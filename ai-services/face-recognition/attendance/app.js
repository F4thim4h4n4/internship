import express from 'express';
import crypto from 'crypto';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import { config } from '../../shared/configs/config.js';
import { logger } from '../../shared/utils/logger.js';

// Database Models
import Attendance from './models/Attendance.js';
import BiometricConsent from './models/BiometricConsent.js';
import FaceTemplate from './models/FaceTemplate.js';
import AiHumanReviewQueue from './models/AiHumanReviewQueue.js';
import AiAuditLog from '../../shared/models/AiAuditLog.js';
import AiError from '../../shared/models/AiError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Determine if DB is connected
const isDbConnected = () => mongoose.connection.readyState === 1;

// In-Memory Database Fallback for local testing
export const mockDb = {
  consents: [],
  templates: [],
  attendance: [],
  reviewQueue: [],
  auditLogs: [],
  errors: []
};

// KMS / AES-256 Encryption Helpers
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'kottakkal-secret-kms-key-version-1';
const ENCRYPTION_KEY = crypto.scryptSync(ENCRYPTION_SECRET, 'salt', 32);
const IV_LENGTH = 16;

export function encryptEmbedding(embeddingJson) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(embeddingJson, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptEmbedding(encryptedText) {
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encrypted = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
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
   Helper: Execute verify.py via Python Shell (spawn)
   ========================================================================== */
function executePythonVerification(templateEmbeddingJson, imageBase64, options = {}) {
  return new Promise((resolve, reject) => {
    // Resolve python executable path
    let pythonPath = process.env.PYTHON_PATH || 'python';
    if (process.platform === 'win32' && pythonPath === 'python') {
      pythonPath = 'C:\\Users\\sadik\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
    }
    const scriptPath = path.resolve(__dirname, 'verify.py');
    
    const args = [];
    if (options.mock) {
      args.push('--mock');
      args.push('--mock-type');
      args.push(options.mockType || 'success');
    } else {
      args.push('--template-embedding');
      args.push(templateEmbeddingJson);
      args.push('--image-base64');
      args.push(imageBase64);
    }

    const pyProcess = spawn(pythonPath, [scriptPath, ...args]);
    
    let stdoutData = '';
    let stderrData = '';

    pyProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pyProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python verification process exited with code ${code}. Error: ${stderrData}`));
      }
      try {
        const parsed = JSON.parse(stdoutData.trim());
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse Python verify output: ${stdoutData}. Error: ${err.message}`));
      }
    });

    pyProcess.on('error', (err) => {
      reject(new Error(`Failed to start Python verify process: ${err.message}`));
    });
  });
}

/* ==========================================================================
   Routes: Consents and Templates (Enrollment)
   ========================================================================== */

// 1. Register Biometric Consent
app.post('/api/ai/attendance/consents', async (req, res, next) => {
  const { staff_id, consent_given, consent_source, consent_policy_version, notes } = req.body;
  const correlationId = req.correlationId;

  if (!staff_id || consent_given === undefined || !consent_source || !consent_policy_version) {
    const err = new Error('Missing required consent parameters (staff_id, consent_given, consent_source, consent_policy_version).');
    err.status = 400;
    return next(err);
  }

  try {
    let consentRecord;
    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months retention

    if (isDbConnected()) {
      // Find existing active consent and revoke if present
      await BiometricConsent.updateMany({ staff_id, status: 'active' }, { status: 'revoked', revoked_date: new Date() });
      
      consentRecord = new BiometricConsent({
        staff_id: new mongoose.Types.ObjectId(staff_id),
        consent_given,
        consent_source,
        consent_policy_version,
        retention_expires_at: expiresAt,
        status: consent_given ? 'active' : 'pending',
        notes
      });
      await consentRecord.save();
    } else {
      mockDb.consents.filter(c => c.staff_id.toString() === staff_id && c.status === 'active').forEach(c => {
        c.status = 'revoked';
        c.revoked_date = new Date();
      });

      consentRecord = {
        _id: new mongoose.Types.ObjectId(),
        staff_id: new mongoose.Types.ObjectId(staff_id),
        consent_given,
        consent_date: new Date(),
        consent_source,
        consent_policy_version,
        retention_expires_at: expiresAt,
        status: consent_given ? 'active' : 'pending',
        notes
      };
      mockDb.consents.push(consentRecord);
    }

    res.json({ success: true, consent: consentRecord });
  } catch (error) {
    error.errorStage = 'database_write';
    next(error);
  }
});

// 2. Enroll Biometric Face Template (Encrypts and stores embedding coordinates)
app.post('/api/ai/attendance/templates/enroll', async (req, res, next) => {
  const { staff_id, consent_id, embedding, model_version, enrolled_device_id } = req.body;
  
  if (!staff_id || !consent_id || !embedding || !model_version) {
    const err = new Error('Missing required enrollment parameters (staff_id, consent_id, embedding, model_version).');
    err.status = 400;
    return next(err);
  }

  try {
    // Encrypt embedding landmarks array
    const embeddingStr = typeof embedding === 'string' ? embedding : JSON.stringify(embedding);
    const encryptedStr = encryptEmbedding(embeddingStr);
    
    let templateRecord;
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year retention for templates

    if (isDbConnected()) {
      // Mark old templates as rotated/revoked
      await FaceTemplate.updateMany({ staff_id, status: 'active' }, { status: 'revoked', deleted_at: new Date(), deletion_reason: 'template_rotated' });

      templateRecord = new FaceTemplate({
        staff_id: new mongoose.Types.ObjectId(staff_id),
        consent_id: new mongoose.Types.ObjectId(consent_id),
        encrypted_embedding: encryptedStr,
        encryption_key_id: 'kms-key-v1',
        model_version,
        enrolled_device_id: enrolled_device_id ? new mongoose.Types.ObjectId(enrolled_device_id) : undefined,
        retention_expires_at: expiresAt,
        status: 'active'
      });
      await templateRecord.save();
    } else {
      mockDb.templates.filter(t => t.staff_id.toString() === staff_id && t.status === 'active').forEach(t => {
        t.status = 'revoked';
        t.deleted_at = new Date();
        t.deletion_reason = 'template_rotated';
      });

      templateRecord = {
        _id: new mongoose.Types.ObjectId(),
        staff_id: new mongoose.Types.ObjectId(staff_id),
        consent_id: new mongoose.Types.ObjectId(consent_id),
        encrypted_embedding: encryptedStr,
        encryption_key_id: 'kms-key-v1',
        model_version,
        enrolled_device_id: enrolled_device_id ? new mongoose.Types.ObjectId(enrolled_device_id) : null,
        enrolled_at: new Date(),
        retention_expires_at: expiresAt,
        status: 'active'
      };
      mockDb.templates.push(templateRecord);
    }

    res.json({ success: true, template: { _id: templateRecord._id, status: templateRecord.status } });
  } catch (error) {
    error.errorStage = 'database_write';
    next(error);
  }
});

/* ==========================================================================
   Route: Attendance Punch API
   ========================================================================== */

// 3. Biometric Verification Check-in Punch API
app.post('/api/ai/attendance/punch', async (req, res, next) => {
  const { staff_id, department_id, device_id, capture_location, verification_method, image_base64, mock_verification, mock_type } = req.body;
  const correlationId = req.correlationId;

  if (!staff_id || !verification_method) {
    const err = new Error('staff_id and verification_method are required.');
    err.status = 400;
    return next(err);
  }

  // Handle Manual Fallback punch requests directly
  if (verification_method === 'manual') {
    return handleManualFallback(req, res, next);
  }

  if (verification_method !== 'face') {
    const err = new Error('Unsupported verification method. Use "face" or "manual".');
    err.status = 400;
    return next(err);
  }

  // Ensure image or mock option is supplied
  if (!image_base64 && !mock_verification && !req.body.mock) {
    const err = new Error('image_base64 is required for face verification.');
    err.status = 400;
    return next(err);
  }

  try {
    // 1. Validate Biometric Consent
    let consent;
    if (isDbConnected()) {
      consent = await BiometricConsent.findOne({ staff_id, status: 'active' });
    } else {
      consent = mockDb.consents.find(c => c.staff_id.toString() === staff_id && c.status === 'active');
    }

    if (!consent || !consent.consent_given) {
      // Create pending attendance & route to manual review due to missing consent
      return handleManualFallback(req, res, next, 'Biometric consent absent or revoked.');
    }

    // 2. Load active face template
    let template;
    if (isDbConnected()) {
      template = await FaceTemplate.findOne({ staff_id, status: 'active' });
    } else {
      template = mockDb.templates.find(t => t.staff_id.toString() === staff_id && t.status === 'active');
    }

    if (!template) {
      return handleManualFallback(req, res, next, 'No active biometric face template enrolled.');
    }

    // 3. Decrypt Embedding
    const decryptedEmbedding = decryptEmbedding(template.encrypted_embedding);

    // 4. Run Python verification process
    const isMock = mock_verification || req.body.mock || !isDbConnected();
    const result = await executePythonVerification(
      decryptedEmbedding,
      image_base64,
      { mock: isMock, mockType: mock_type || req.body.mock_type }
    );

    if (!result.success) {
      const pyErr = new Error(result.error || 'Python verification failed');
      pyErr.status = 422;
      pyErr.errorStage = 'face_match';
      pyErr.userFriendlyMessage = pyErr.message;
      return next(pyErr);
    }

    const { face_match_score, liveness_score, liveness_result, model_version } = result;

    // 5. Evaluate thresholds and compute confidence decision
    let confidence_decision;
    let review_status;
    let needsHumanReview = false;
    let reviewType = '';
    let reviewReason = '';

    // Liveness checks fail targets
    if (liveness_result === 'failed' || liveness_score < 0.90) {
      confidence_decision = 'rejected';
      review_status = 'pending';
      needsHumanReview = true;
      reviewType = 'liveness_failed';
      reviewReason = `Spoof detection fail: liveness score ${liveness_score} is below threshold 0.90.`;
    } else {
      // Evaluate match score
      if (face_match_score >= 0.95) {
        confidence_decision = 'high_confidence';
        review_status = 'approved';
      } else if (face_match_score >= 0.80) {
        confidence_decision = 'low_confidence';
        review_status = 'pending';
        needsHumanReview = true;
        reviewType = 'biometric_low_confidence';
        reviewReason = `Biometric similarity score ${face_match_score} below target 0.95.`;
      } else {
        confidence_decision = 'rejected';
        review_status = 'pending';
        needsHumanReview = true;
        reviewType = 'biometric_low_confidence';
        reviewReason = `Biometric matching failed completely with score ${face_match_score} (below 0.80).`;
      }
    }

    // 6. Save attendance event log
    let attendanceRecord;
    const locationCoords = capture_location || { type: 'Point', coordinates: [0.0, 0.0] };

    if (isDbConnected()) {
      attendanceRecord = new Attendance({
        metadata: {
          staff_id: new mongoose.Types.ObjectId(staff_id),
          department_id: department_id ? new mongoose.Types.ObjectId(department_id) : undefined,
          device_id: device_id ? new mongoose.Types.ObjectId(device_id) : undefined
        },
        verification_method: 'face',
        face_match_score,
        liveness_score,
        confidence_score: face_match_score, // Bounded confidence representation
        liveness_result,
        confidence_decision,
        device_id: device_id ? new mongoose.Types.ObjectId(device_id) : undefined,
        capture_location: locationCoords,
        location_verified: true,
        template_id: template._id,
        consent_id: consent._id,
        model_version,
        correlation_id: correlationId,
        review_status
      });
      await attendanceRecord.save();
    } else {
      attendanceRecord = {
        _id: new mongoose.Types.ObjectId(),
        metadata: {
          staff_id: new mongoose.Types.ObjectId(staff_id),
          department_id: department_id ? new mongoose.Types.ObjectId(department_id) : null,
          device_id: device_id ? new mongoose.Types.ObjectId(device_id) : null
        },
        punch_time: new Date(),
        verification_method: 'face',
        face_match_score,
        liveness_score,
        confidence_score: face_match_score,
        liveness_result,
        confidence_decision,
        device_id: device_id ? new mongoose.Types.ObjectId(device_id) : null,
        capture_location: locationCoords,
        location_verified: true,
        template_id: template._id,
        consent_id: consent._id,
        model_version,
        correlation_id: correlationId,
        review_status
      };
      mockDb.attendance.push(attendanceRecord);
    }

    // 7. Enqueue to review queue if needed
    let reviewRecord = null;
    if (needsHumanReview) {
      const reviewNo = `REV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      if (isDbConnected()) {
        reviewRecord = new AiHumanReviewQueue({
          review_no: reviewNo,
          review_type: reviewType,
          source_system: 'attendance_ai',
          priority: reviewType === 'liveness_failed' ? 'high' : 'normal',
          status: 'open',
          staff_id: new mongoose.Types.ObjectId(staff_id),
          department_id: department_id ? new mongoose.Types.ObjectId(department_id) : undefined,
          attendance_id: attendanceRecord._id,
          confidence_score: face_match_score,
          liveness_score,
          reason: reviewReason,
          correlation_id: correlationId
        });
        await reviewRecord.save();
      } else {
        reviewRecord = {
          _id: new mongoose.Types.ObjectId(),
          review_no: reviewNo,
          review_type: reviewType,
          source_system: 'attendance_ai',
          priority: reviewType === 'liveness_failed' ? 'high' : 'normal',
          status: 'open',
          staff_id: new mongoose.Types.ObjectId(staff_id),
          department_id: department_id ? new mongoose.Types.ObjectId(department_id) : null,
          attendance_id: attendanceRecord._id,
          confidence_score: face_match_score,
          liveness_score,
          reason: reviewReason,
          correlation_id: correlationId,
          created_at: new Date(),
          updated_at: new Date()
        };
        mockDb.reviewQueue.push(reviewRecord);
      }
    }

    // 8. Create Telemetry Audit Log
    if (isDbConnected()) {
      const auditLog = new AiAuditLog({
        user_id: new mongoose.Types.ObjectId(staff_id),
        action_type: 'biometric_verification',
        service_name: 'attendance_ai',
        model_name: model_version,
        confidence_score: face_match_score,
        policy_decision: review_status === 'approved' ? 'allowed' : 'escalated',
        safety_flag: liveness_result === 'failed',
        operational_entity_type: 'attendance',
        operational_entity_id: attendanceRecord._id,
        fallback_action: needsHumanReview ? 'human_escalation' : 'none',
        correlation_id: correlationId,
        pii_redaction_applied: false
      });
      await auditLog.save();
    } else {
      const auditLog = {
        _id: new mongoose.Types.ObjectId(),
        user_id: new mongoose.Types.ObjectId(staff_id),
        action_type: 'biometric_verification',
        service_name: 'attendance_ai',
        model_name: model_version,
        confidence_score: face_match_score,
        policy_decision: review_status === 'approved' ? 'allowed' : 'escalated',
        safety_flag: liveness_result === 'failed',
        operational_entity_type: 'attendance',
        operational_entity_id: attendanceRecord._id,
        fallback_action: needsHumanReview ? 'human_escalation' : 'none',
        correlation_id: correlationId,
        pii_redaction_applied: false,
        created_at: new Date()
      };
      mockDb.auditLogs.push(auditLog);
    }

    res.json({
      success: true,
      attendance: attendanceRecord,
      review_required: needsHumanReview,
      review: reviewRecord
    });

  } catch (error) {
    error.errorStage = 'face_match';
    next(error);
  }
});

// Helper for Manual Fallback check-ins
async function handleManualFallback(req, res, next, reason = 'Manual request or PIN fallback') {
  const { staff_id, department_id, device_id, capture_location } = req.body;
  const correlationId = req.correlationId;
  const locationCoords = capture_location || { type: 'Point', coordinates: [0.0, 0.0] };

  try {
    let attendanceRecord;
    if (isDbConnected()) {
      attendanceRecord = new Attendance({
        metadata: {
          staff_id: new mongoose.Types.ObjectId(staff_id),
          department_id: department_id ? new mongoose.Types.ObjectId(department_id) : undefined,
          device_id: device_id ? new mongoose.Types.ObjectId(device_id) : undefined
        },
        verification_method: 'manual',
        device_id: device_id ? new mongoose.Types.ObjectId(device_id) : undefined,
        capture_location: locationCoords,
        location_verified: false,
        manual_fallback_used: true,
        fallback_reason: reason,
        correlation_id: correlationId,
        review_status: 'pending'
      });
      await attendanceRecord.save();
    } else {
      attendanceRecord = {
        _id: new mongoose.Types.ObjectId(),
        metadata: {
          staff_id: new mongoose.Types.ObjectId(staff_id),
          department_id: department_id ? new mongoose.Types.ObjectId(department_id) : null,
          device_id: device_id ? new mongoose.Types.ObjectId(device_id) : null
        },
        punch_time: new Date(),
        verification_method: 'manual',
        device_id: device_id ? new mongoose.Types.ObjectId(device_id) : null,
        capture_location: locationCoords,
        location_verified: false,
        manual_fallback_used: true,
        fallback_reason: reason,
        correlation_id: correlationId,
        review_status: 'pending'
      };
      mockDb.attendance.push(attendanceRecord);
    }

    // Insert into Review Queue
    const reviewNo = `REV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    let reviewRecord;
    if (isDbConnected()) {
      reviewRecord = new AiHumanReviewQueue({
        review_no: reviewNo,
        review_type: 'manual_attendance',
        source_system: 'attendance_ai',
        priority: 'normal',
        status: 'open',
        staff_id: new mongoose.Types.ObjectId(staff_id),
        department_id: department_id ? new mongoose.Types.ObjectId(department_id) : undefined,
        attendance_id: attendanceRecord._id,
        reason: `Manual checkin: ${reason}`,
        correlation_id: correlationId
      });
      await reviewRecord.save();
    } else {
      reviewRecord = {
        _id: new mongoose.Types.ObjectId(),
        review_no: reviewNo,
        review_type: 'manual_attendance',
        source_system: 'attendance_ai',
        priority: 'normal',
        status: 'open',
        staff_id: new mongoose.Types.ObjectId(staff_id),
        department_id: department_id ? new mongoose.Types.ObjectId(department_id) : null,
        attendance_id: attendanceRecord._id,
        reason: `Manual checkin: ${reason}`,
        correlation_id: correlationId,
        created_at: new Date(),
        updated_at: new Date()
      };
      mockDb.reviewQueue.push(reviewRecord);
    }

    // Save audit log
    if (isDbConnected()) {
      const auditLog = new AiAuditLog({
        user_id: new mongoose.Types.ObjectId(staff_id),
        action_type: 'manual_fallback',
        service_name: 'attendance_ai',
        confidence_score: 0.0,
        policy_decision: 'escalated',
        operational_entity_type: 'attendance',
        operational_entity_id: attendanceRecord._id,
        fallback_action: 'human_escalation',
        correlation_id: correlationId,
        pii_redaction_applied: false
      });
      await auditLog.save();
    } else {
      const auditLog = {
        _id: new mongoose.Types.ObjectId(),
        user_id: new mongoose.Types.ObjectId(staff_id),
        action_type: 'manual_fallback',
        service_name: 'attendance_ai',
        confidence_score: 0.0,
        policy_decision: 'escalated',
        operational_entity_type: 'attendance',
        operational_entity_id: attendanceRecord._id,
        fallback_action: 'human_escalation',
        correlation_id: correlationId,
        pii_redaction_applied: false,
        created_at: new Date()
      };
      mockDb.auditLogs.push(auditLog);
    }

    res.json({
      success: true,
      attendance: attendanceRecord,
      review_required: true,
      review: reviewRecord
    });
  } catch (error) {
    error.errorStage = 'database_write';
    next(error);
  }
}

/* ==========================================================================
   Error Handlers and Centralized Middleware
   ========================================================================== */

app.use(async (err, req, res, next) => {
  const correlationId = req.correlationId;
  const status = err.status || 500;
  const errorMsg = err.message || 'An unexpected error occurred.';
  const errorStage = err.errorStage || 'api_gateway';
  
  logger.error(`Attendance Service Error: ${errorMsg}`, {
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
      const errLog = {
        _id: new mongoose.Types.ObjectId(),
        error_message: errorMsg,
        error_stage: errorStage,
        stack_trace: err.stack || '',
        fallback_action: 'none',
        correlation_id: correlationId,
        created_at: new Date()
      };
      mockDb.errors.push(errLog);
    }
  } catch (logErr) {
    console.error('Failed to log error to MONGODB/MOCK:', logErr);
  }

  res.status(status).json({
    success: false,
    error: {
      message: err.userFriendlyMessage || 'Internal server error occurred.',
      code: err.code || 'INTERNAL_ERROR',
      correlation_id: correlationId
    }
  });
});

// Start Express server if executed directly
if (process.env.NODE_ENV !== 'test') {
  const port = parseInt(process.env.ATTENDANCE_PORT || '5006', 10);
  
  mongoose.connect(config.mongodbUri)
    .then(() => {
      logger.info('Connected to MongoDB successfully for Attendance Service.');
    })
    .catch((err) => {
      logger.warn(`MongoDB Connection failed: ${err.message}. Running in Local Mock mode.`);
    })
    .finally(() => {
      app.listen(port, () => {
        logger.info(`Attendance Recognition Service listening on port ${port}`);
      });
    });
}

export default app;
