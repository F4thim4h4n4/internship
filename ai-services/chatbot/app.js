import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../shared/configs/config.js';
import { logger } from '../shared/utils/logger.js';
import { groundingMiddleware } from './rag/grounding.js';
import { generateGroundedResponse } from './geminiClient.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Correlation ID Middleware
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || req.body.correlation_id || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

// Rate Limiter
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 requests per windowMs
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

// Chat endpoint
app.post('/api/ai/chat', chatLimiter, groundingMiddleware, async (req, res, next) => {
  const query = req.body.message || req.body.query;
  const correlationId = req.correlationId;

  if (!query) {
    const err = new Error('Message is required in request body.');
    err.status = 400;
    err.userFriendlyMessage = err.message;
    err.errorStage = 'api_gateway';
    return next(err);
  }

  try {
    const result = await generateGroundedResponse(query, req.ragContext, correlationId);
    res.json(result);
  } catch (error) {
    error.errorStage = error.errorStage || 'gemini_call';
    error.userFriendlyMessage = 'The AI service failed to generate a response. Please try again later.';
    next(error);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    apiConfigured: !!config.geminiApiKey
  });
});

// Centralized Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const correlationId = req.correlationId || 'no-correlation-id';
  const status = err.status || 500;
  
  // Log error with complete context
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

if (isMain) {
  app.listen(config.port, () => {
    logger.info(`Chatbot service running on port ${config.port} with model ${config.geminiModel}`);
  });
}

export default app;
