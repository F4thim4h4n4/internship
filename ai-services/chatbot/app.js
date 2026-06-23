import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import { config } from '../shared/configs/config.js';
import { logger } from '../shared/utils/logger.js';
import { groundingMiddleware } from './rag/grounding.js';
import { generateGroundedResponse } from './geminiClient.js';

// Database Models
import ChatbotSession from './models/ChatbotSession.js';
import ChatbotMessage from './models/ChatbotMessage.js';
import AiAuditLog from '../shared/models/AiAuditLog.js';
import AiError from '../shared/models/AiError.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB with safe failover to Mock Mode
const isDbConnected = () => mongoose.connection.readyState === 1;

// In-memory Database mock fallback for local tests and offline mode
export const mockDb = {
  sessions: [],
  messages: [],
  auditLogs: [],
  errors: []
};

// Correlation ID Middleware
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || req.body.correlation_id || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

// Rate Limiter
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: {
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', { 
      correlationId: req.correlationId,
      ip: req.ip
    });
    res.status(options.statusCode).send(options.message);
  }
});

// HTTP Request Logger Middleware
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.url}`, { 
    correlationId: req.correlationId,
    ip: req.ip 
  });
  next();
});

/* ==========================================================================
   Chatbot Session Endpoints
   ========================================================================== */

// 1. Start a new Chat Session
app.post('/api/ai/chat/session/start', async (req, res, next) => {
  const { user_id, channel, language } = req.body;
  const correlationId = req.correlationId;

  if (!channel) {
    const err = new Error('Channel is required in request body.');
    err.status = 400;
    err.userFriendlyMessage = err.message;
    return next(err);
  }

  const validChannels = ["web", "mobile", "kiosk", "staff_portal", "api"];
  if (!validChannels.includes(channel)) {
    const err = new Error(`Invalid channel. Must be one of: ${validChannels.join(', ')}`);
    err.status = 400;
    err.userFriendlyMessage = err.message;
    return next(err);
  }

  try {
    const sessionNo = `SESS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months retention

    let sessionRecord;

    if (isDbConnected()) {
      sessionRecord = new ChatbotSession({
        session_no: sessionNo,
        user_id: user_id ? new mongoose.Types.ObjectId(user_id) : undefined,
        channel,
        language: language || 'en',
        status: 'active',
        expires_at: expiresAt,
        correlation_id: correlationId
      });
      await sessionRecord.save();
    } else {
      // In-memory mock save
      sessionRecord = {
        _id: new mongoose.Types.ObjectId(),
        session_no: sessionNo,
        user_id: user_id ? new mongoose.Types.ObjectId(user_id) : null,
        channel,
        language: language || 'en',
        status: 'active',
        started_at: new Date(),
        last_message_at: new Date(),
        expires_at: expiresAt,
        correlation_id: correlationId,
        escalation_requested: false,
        pii_redaction_applied: false
      };
      mockDb.sessions.push(sessionRecord);
      logger.info('Saved session to Mock DB (in-memory)', { correlationId, sessionId: sessionRecord._id });
    }

    res.json({
      success: true,
      session: sessionRecord
    });

  } catch (error) {
    error.errorStage = 'database_write';
    error.userFriendlyMessage = 'Failed to create chatbot session.';
    next(error);
  }
});

// 2. Send Message inside a Session
app.post('/api/ai/chat/session/:sessionId/message', chatLimiter, groundingMiddleware, async (req, res, next) => {
  const { sessionId } = req.params;
  const query = req.body.message || req.body.query;
  const correlationId = req.correlationId;

  if (!query) {
    const err = new Error('Message is required in request body.');
    err.status = 400;
    err.userFriendlyMessage = err.message;
    return next(err);
  }

  // Load Session and verify active status
  let session;
  try {
    if (isDbConnected()) {
      session = await ChatbotSession.findById(sessionId);
    } else {
      session = mockDb.sessions.find(s => s._id.toString() === sessionId);
    }

    if (!session) {
      const err = new Error('Chat session not found.');
      err.status = 404;
      err.userFriendlyMessage = err.message;
      return next(err);
    }

    if (session.status !== 'active') {
      const err = new Error(`Cannot send message. Chat session is currently: ${session.status}`);
      err.status = 400;
      err.userFriendlyMessage = err.message;
      return next(err);
    }
  } catch (err) {
    err.status = 400;
    err.userFriendlyMessage = 'Invalid Session ID format.';
    return next(err);
  }

  try {
    // Invoke Gemini Model
    const result = await generateGroundedResponse(query, req.ragContext, correlationId);
    
    // Extract flags from Gemini JSON response
    const { response, grounded, sourcesUsed, escalateRequired } = result.data;
    const isSafetyBlocked = response.includes('Access Denied');
    const responseSource = grounded ? 'RAG' : (isSafetyBlocked ? 'system' : 'fallback');
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months retention

    // Save Chat Messages (User and Assistant)
    let userMsgRecord, assistantMsgRecord;

    if (isDbConnected()) {
      // Save User Message
      userMsgRecord = new ChatbotMessage({
        session_id: session._id,
        role: 'user',
        content: query,
        redacted_content: query,
        language: session.language,
        correlation_id: correlationId,
        expires_at: expiresAt
      });
      await userMsgRecord.save();

      // Save Assistant Message
      assistantMsgRecord = new ChatbotMessage({
        session_id: session._id,
        role: 'assistant',
        content: response,
        redacted_content: response,
        language: session.language,
        ai_model: result.meta.model,
        prompt_version: 'v1',
        guardrail_version: 'v1',
        retrieval_kb_ids: sourcesUsed.map(() => new mongoose.Types.ObjectId()), // Simulate mapping to KB ObjectId
        response_source: responseSource,
        escalation_triggered: escalateRequired,
        safety_flag: isSafetyBlocked,
        correlation_id: correlationId,
        expires_at: expiresAt
      });
      await assistantMsgRecord.save();

      // Save Telemetry Audit Log
      const auditLog = new AiAuditLog({
        user_id: session.user_id,
        session_id: session._id,
        action_type: 'chat_message',
        service_name: 'chatbot_service',
        model_name: result.meta.model,
        confidence_score: grounded ? 1.0 : 0.0,
        policy_decision: grounded ? 'allowed' : (escalateRequired ? 'escalated' : 'blocked'),
        safety_flag: isSafetyBlocked,
        retrieval_kb_ids: assistantMsgRecord.retrieval_kb_ids,
        operational_entity_type: 'chatbot_message',
        operational_entity_id: assistantMsgRecord._id,
        fallback_action: escalateRequired ? 'human_escalation' : 'none',
        correlation_id: correlationId,
        pii_redaction_applied: false
      });
      await auditLog.save();

      // Update Session status
      session.last_message_at = new Date();
      if (escalateRequired) {
        session.status = 'escalated';
        session.escalation_requested = true;
        session.escalation_reason = 'Low confidence / ungrounded answer required human review';
      }
      await session.save();

    } else {
      // Mock DB saves
      userMsgRecord = {
        _id: new mongoose.Types.ObjectId(),
        session_id: session._id,
        role: 'user',
        content: query,
        redacted_content: query,
        language: session.language,
        created_at: new Date(),
        correlation_id: correlationId,
        expires_at: expiresAt
      };
      mockDb.messages.push(userMsgRecord);

      assistantMsgRecord = {
        _id: new mongoose.Types.ObjectId(),
        session_id: session._id,
        role: 'assistant',
        content: response,
        redacted_content: response,
        language: session.language,
        ai_model: result.meta.model,
        prompt_version: 'v1',
        guardrail_version: 'v1',
        retrieval_kb_ids: sourcesUsed,
        response_source: responseSource,
        escalation_triggered: escalateRequired,
        safety_flag: isSafetyBlocked,
        created_at: new Date(),
        correlation_id: correlationId,
        expires_at: expiresAt
      };
      mockDb.messages.push(assistantMsgRecord);

      const auditLog = {
        _id: new mongoose.Types.ObjectId(),
        user_id: session.user_id,
        session_id: session._id,
        action_type: 'chat_message',
        service_name: 'chatbot_service',
        model_name: result.meta.model,
        confidence_score: grounded ? 1.0 : 0.0,
        policy_decision: grounded ? 'allowed' : (escalateRequired ? 'escalated' : 'blocked'),
        safety_flag: isSafetyBlocked,
        retrieval_kb_ids: sourcesUsed,
        operational_entity_type: 'chatbot_message',
        operational_entity_id: assistantMsgRecord._id,
        fallback_action: escalateRequired ? 'human_escalation' : 'none',
        correlation_id: correlationId,
        pii_redaction_applied: false,
        timestamp: new Date()
      };
      mockDb.auditLogs.push(auditLog);

      // Update in-memory session reference
      session.last_message_at = new Date();
      if (escalateRequired) {
        session.status = 'escalated';
        session.escalation_requested = true;
        session.escalation_reason = 'Low confidence / ungrounded answer required human review';
      }
      logger.info('Saved message details and updated session status in Mock DB', { correlationId });
    }

    res.json({
      success: true,
      data: response,
      meta: result.meta
    });

  } catch (error) {
    // Record to AI Errors
    const errorStage = error.errorStage || 'gemini_call';
    const fallbackAction = errorStage === 'gemini_call' ? 'safe_message' : 'none';

    if (isDbConnected()) {
      try {
        const errorRecord = new AiError({
          service_name: 'chatbot_service',
          error_message: error.message,
          error_stage: errorStage,
          correlation_id: correlationId,
          fallback_action: fallbackAction,
          timestamp: new Date()
        });
        await errorRecord.save();
      } catch (logErr) {
        logger.error('Failed to write error to Mongoose ai_errors collection: ' + logErr.message);
      }
    } else {
      mockDb.errors.push({
        _id: new mongoose.Types.ObjectId(),
        service_name: 'chatbot_service',
        error_message: error.message,
        error_stage: errorStage,
        correlation_id: correlationId,
        fallback_action: fallbackAction,
        timestamp: new Date()
      });
      logger.info('Saved error record to Mock DB (in-memory)');
    }

    error.errorStage = errorStage;
    error.userFriendlyMessage = 'The chatbot service encountered an error processing your query.';
    next(error);
  }
});

// 3. Load Session Message History
app.get('/api/ai/chat/session/:sessionId/history', async (req, res, next) => {
  const { sessionId } = req.params;

  try {
    let messages;

    if (isDbConnected()) {
      messages = await ChatbotMessage.find({ session_id: sessionId }).sort({ created_at: 1 });
    } else {
      messages = mockDb.messages
        .filter(m => m.session_id.toString() === sessionId)
        .sort((a, b) => a.created_at - b.created_at);
    }

    res.json({
      success: true,
      messages
    });

  } catch (error) {
    error.errorStage = 'database_write';
    error.userFriendlyMessage = 'Failed to load chat history.';
    next(error);
  }
});

// 4. Manually Close a Chat Session
app.post('/api/ai/chat/session/:sessionId/close', async (req, res, next) => {
  const { sessionId } = req.params;

  try {
    let session;

    if (isDbConnected()) {
      session = await ChatbotSession.findById(sessionId);
      if (session) {
        session.status = 'closed';
        session.ended_at = new Date();
        await session.save();
      }
    } else {
      session = mockDb.sessions.find(s => s._id.toString() === sessionId);
      if (session) {
        session.status = 'closed';
        session.ended_at = new Date();
      }
    }

    if (!session) {
      const err = new Error('Chat session not found.');
      err.status = 404;
      err.userFriendlyMessage = err.message;
      return next(err);
    }

    res.json({
      success: true,
      session
    });

  } catch (error) {
    error.errorStage = 'database_write';
    error.userFriendlyMessage = 'Failed to close chat session.';
    next(error);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    apiConfigured: !!config.geminiApiKey,
    databaseConnected: isDbConnected()
  });
});

// Centralized Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const correlationId = req.correlationId || 'no-correlation-id';
  const status = err.status || 500;
  
  logger.error('Error handling request', {
    correlationId,
    status,
    errorStage: err.errorStage || 'api_gateway',
    errorMessage: err.message,
    stack: err.stack
  });

  res.status(status).json({
    success: false,
    error: {
      message: err.userFriendlyMessage || 'An unexpected error occurred in the AI chatbot service.',
      correlationId
    }
  });
});

// Check if app.js is run directly (for starting the server)
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(__filename)
);

if (isMain || process.env.NODE_ENV === 'test') {
  logger.info(`Connecting to database at ${config.mongodbUri}...`);
  mongoose.connect(config.mongodbUri)
    .then(() => logger.info('Connected to MongoDB database'))
    .catch(err => logger.warn('MongoDB connection failed. Running with in-memory Mock DB fallback: ' + err.message));
}

if (isMain) {
  app.listen(config.port, () => {
    logger.info(`Chatbot service running on port ${config.port} with model ${config.geminiModel}`);
  });
}

export default app;
export { ChatbotSession, ChatbotMessage, AiAuditLog, AiError };
