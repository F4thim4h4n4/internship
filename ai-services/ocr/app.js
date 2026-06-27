import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import { config } from '../shared/configs/config.js';
import { logger } from '../shared/utils/logger.js';
import { runOcrSandbox } from './sandboxRunner.js';
import { validateDocument } from './validation.js';

// Database Models
import AiAuditLog from '../shared/models/AiAuditLog.js';
import AiError from '../shared/models/AiError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Determine if DB is connected
const isDbConnected = () => mongoose.connection.readyState === 1;

// In-Memory Database Fallback for local testing
export const mockDb = {
  auditLogs: [],
  errors: []
};

// Create temporary folder on startup
const tempDir = path.resolve(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Correlation ID Middleware
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || req.body.correlation_id || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
});

// Request Logger
app.use((req, res, next) => {
  logger.http(`${req.method} ${req.url}`, {
    correlationId: req.correlationId,
    ip: req.ip
  });
  next();
});

/* ==========================================================================
   Routes: OCR Parsing Endpoints
   ========================================================================== */

app.post('/api/ai/ocr/parse', async (req, res, next) => {
  const { file_base64, mime_type, file_name, mock, mock_type, timeout_ms } = req.body;
  const correlationId = req.correlationId;

  if (!file_base64 && !mock) {
    const err = new Error('Missing file input (file_base64 or mock is required).');
    err.status = 400;
    return next(err);
  }

  if (!mock && !mime_type) {
    const err = new Error('Missing mime_type parameter.');
    err.status = 400;
    return next(err);
  }

  let filePath = '';
  let startTime = Date.now();

  try {
    // 1. If not mock, write base64 payload to a temporary file
    if (!mock) {
      const ext = mime_type === 'application/pdf' ? 'pdf' : 'img';
      const fileNameUnique = `ocr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      filePath = path.resolve(tempDir, fileNameUnique);
      const buffer = Buffer.from(file_base64, 'base64');
      fs.writeFileSync(filePath, buffer);
    }

    // 2. Invoke Sandboxed OCR process execution
    const isMock = mock || !isDbConnected();
    const timeoutVal = timeout_ms || 30000;
    
    logger.info('Launching sandboxed file parse task...', {
      correlationId,
      mimeType: mime_type,
      isMock,
      timeoutVal
    });

    const extractedText = await runOcrSandbox(filePath, mime_type, {
      mock: isMock,
      mockType: mock_type || 'success',
      timeoutMs: timeoutVal
    });

    const elapsedMs = Date.now() - startTime;

    // 3. Log Telemetry Audit Log
    if (isDbConnected()) {
      const auditLog = new AiAuditLog({
        action_type: 'document_ocr',
        service_name: 'ocr_service',
        model_name: mime_type === 'application/pdf' ? 'pdf-parse' : 'tesseract-wasm',
        confidence_score: 1.0,
        policy_decision: 'allowed',
        safety_flag: false,
        operational_entity_type: 'document',
        correlation_id: correlationId,
        pii_redaction_applied: false
      });
      await auditLog.save();
    } else {
      mockDb.auditLogs.push({
        _id: new mongoose.Types.ObjectId(),
        action_type: 'document_ocr',
        service_name: 'ocr_service',
        model_name: mime_type === 'application/pdf' ? 'pdf-parse' : 'tesseract-wasm',
        confidence_score: 1.0,
        policy_decision: 'allowed',
        correlation_id: correlationId,
        created_at: new Date()
      });
    }

    // Return the response
    res.json({
      success: true,
      text: extractedText,
      meta: {
        char_count: extractedText.length,
        processing_time_ms: elapsedMs,
        mime_type: mime_type || 'mock/text'
      }
    });

  } catch (error) {
    error.errorStage = 'api_gateway';
    next(error);
  } finally {
    // 4. Secure Cleanup: Deletes file immediately from storage
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.debug('Temporary file deleted successfully.', { filePath });
      } catch (cleanupErr) {
        logger.error(`Failed to clean up temporary file: ${cleanupErr.message}`, { filePath });
      }
    }
  }
});

/* ==========================================================================
   OCR Text Validation Endpoint
   ========================================================================== */
app.post('/api/ai/ocr/validate', async (req, res, next) => {
  const { document_type, credentials, extracted_text, file_base64, mime_type, mock, mock_type, timeout_ms } = req.body;
  const correlationId = req.correlationId;

  if (!document_type || !credentials) {
    const err = new Error('Missing document_type or credentials parameter.');
    err.status = 400;
    return next(err);
  }

  const validDocTypes = ['tax_receipt', 'property_license', 'building_permit'];
  if (!validDocTypes.includes(document_type)) {
    const err = new Error(`Invalid document_type. Must be one of: ${validDocTypes.join(', ')}`);
    err.status = 400;
    return next(err);
  }

  // If mock mode is triggered
  if (mock) {
    if (mock_type === 'crash') {
      const crashErr = new Error('Mock validator crash simulation');
      crashErr.status = 500;
      crashErr.errorStage = 'api_gateway';
      return next(crashErr);
    }
    const valid = mock_type === 'success';
    const responsePayload = {
      success: true,
      valid,
      score: valid ? 1.0 : 0.45,
      matches: {
        id: valid,
        name: valid,
        amount: valid,
        date: valid
      },
      details: {
        extracted: {
          id: valid ? credentials.id : 'MOCK-WRONG-ID',
          name: valid ? credentials.name : 'MOCK-WRONG-NAME',
          amount: valid ? credentials.amount : 0,
          date: valid ? credentials.date : '2000-01-01'
        },
        expected: credentials
      }
    };
    
    // Log Mock Telemetry
    mockDb.auditLogs.push({
      _id: new mongoose.Types.ObjectId(),
      action_type: 'document_validation',
      service_name: 'ocr_service',
      model_name: 'regex-levenshtein-validator',
      confidence_score: responsePayload.score,
      policy_decision: valid ? 'allowed' : 'blocked',
      correlation_id: correlationId,
      created_at: new Date()
    });

    return res.json(responsePayload);
  }

  let filePath = '';
  try {
    let textToValidate = extracted_text || '';

    // If base64 file is provided, run parsing sandbox first
    if (!textToValidate && file_base64) {
      if (!mime_type) {
        const err = new Error('Missing mime_type for parsing file input.');
        err.status = 400;
        return next(err);
      }
      const ext = mime_type === 'application/pdf' ? 'pdf' : 'img';
      const fileNameUnique = `ocr_val_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      filePath = path.resolve(tempDir, fileNameUnique);
      const buffer = Buffer.from(file_base64, 'base64');
      fs.writeFileSync(filePath, buffer);

      const timeoutVal = timeout_ms || 30000;
      textToValidate = await runOcrSandbox(filePath, mime_type, {
        mock: false,
        timeoutMs: timeoutVal
      });
    }

    if (!textToValidate) {
      const err = new Error('Missing text input to validate (extracted_text or file_base64 is required).');
      err.status = 400;
      return next(err);
    }

    // Run Levenshtein and Regex validation checks
    const valResult = validateDocument(textToValidate, document_type, credentials);

    // Log Telemetry Audit Log
    if (isDbConnected()) {
      const auditLog = new AiAuditLog({
        action_type: 'document_validation',
        service_name: 'ocr_service',
        model_name: 'regex-levenshtein-validator',
        confidence_score: valResult.score,
        policy_decision: valResult.valid ? 'allowed' : 'blocked',
        safety_flag: !valResult.valid,
        operational_entity_type: 'document',
        correlation_id: correlationId,
        pii_redaction_applied: false
      });
      await auditLog.save();
    } else {
      mockDb.auditLogs.push({
        _id: new mongoose.Types.ObjectId(),
        action_type: 'document_validation',
        service_name: 'ocr_service',
        model_name: 'regex-levenshtein-validator',
        confidence_score: valResult.score,
        policy_decision: valResult.valid ? 'allowed' : 'blocked',
        correlation_id: correlationId,
        created_at: new Date()
      });
    }

    res.json({
      success: true,
      valid: valResult.valid,
      score: valResult.score,
      matches: valResult.matches,
      details: valResult.details
    });

  } catch (error) {
    error.errorStage = 'api_gateway';
    next(error);
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupErr) {
        logger.error(`Failed to clean up validation file: ${cleanupErr.message}`, { filePath });
      }
    }
  }
});

/* ==========================================================================
   Error Handlers and Centralized Middleware
   ========================================================================== */

app.use(async (err, req, res, next) => {
  const correlationId = req.correlationId;
  const status = err.status || 500;
  const errorMsg = err.message || 'An unexpected error occurred.';
  const errorStage = err.errorStage || 'api_gateway';

  logger.error(`OCR Service Error: ${errorMsg}`, {
    correlationId,
    status,
    errorStage,
    stack: err.stack
  });

  try {
    // Record error in database / memory
    if (isDbConnected()) {
      const errLog = new AiError({
        error_message: errorMsg,
        error_stage: errorStage,
        stack_trace: err.stack || '',
        fallback_action: 'none',
        correlation_id: correlationId
      });
      await errLog.save();
    } else {
      mockDb.errors.push({
        _id: new mongoose.Types.ObjectId(),
        error_message: errorMsg,
        error_stage: errorStage,
        stack_trace: err.stack || '',
        correlation_id: correlationId,
        created_at: new Date()
      });
    }
  } catch (logErr) {
    console.error('Failed to log error to MONGODB/MOCK:', logErr);
  }

  res.status(status).json({
    success: false,
    error: {
      message: err.message || 'Internal server error occurred.',
      code: err.code || 'INTERNAL_ERROR',
      correlation_id: correlationId
    }
  });
});

// Start Express server if executed directly
if (process.env.NODE_ENV !== 'test') {
  const port = parseInt(process.env.OCR_PORT || '5007', 10);

  mongoose.connect(config.mongodbUri)
    .then(() => {
      logger.info('Connected to MongoDB successfully for OCR Service.');
    })
    .catch((err) => {
      logger.warn(`MongoDB Connection failed: ${err.message}. Running in Local Mock mode.`);
    })
    .finally(() => {
      app.listen(port, () => {
        logger.info(`OCR Service listening on port ${port}`);
      });
    });
}

export default app;
