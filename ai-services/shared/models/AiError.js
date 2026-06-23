import mongoose from 'mongoose';

const AiErrorSchema = new mongoose.Schema({
  service_name: {
    type: String,
    required: true
  },
  error_code: {
    type: String
  },
  error_message: {
    type: String,
    required: true
  },
  error_stage: {
    type: String,
    enum: ["api_gateway", "guardrails", "gemini_call", "rag_retrieval", "tool_call", "ticket_service", "face_capture", "liveness_check", "face_match", "database_write", "notification", "queue_worker"],
    required: true
  },
  request_id: {
    type: String
  },
  correlation_id: {
    type: String
  },
  provider_status_code: {
    type: Number
  },
  is_transient: {
    type: Boolean,
    default: false
  },
  retry_count: {
    type: Number,
    default: 0
  },
  circuit_breaker_state: {
    type: String,
    enum: ["closed", "open", "half_open"],
    default: "closed"
  },
  fallback_action: {
    type: String,
    enum: ["none", "human_escalation", "manual_attendance", "queue_retry", "safe_message", "pin_fallback"],
    default: "none"
  },
  details_redacted: {
    type: Boolean,
    default: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Configure indexes
AiErrorSchema.index({ service_name: 1 });
AiErrorSchema.index({ timestamp: -1 });
AiErrorSchema.index({ error_code: 1 });
AiErrorSchema.index({ service_name: 1, timestamp: -1 });
AiErrorSchema.index({ correlation_id: 1 });
AiErrorSchema.index({ error_stage: 1, timestamp: -1 });
AiErrorSchema.index({ fallback_action: 1, timestamp: -1 });

const AiError = mongoose.models.AiError || mongoose.model('AiError', AiErrorSchema, 'ai_errors');
export default AiError;
