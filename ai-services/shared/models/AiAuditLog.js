import mongoose from 'mongoose';

const AiAuditLogSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  session_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  action_type: {
    type: String,
    required: true
  },
  service_name: {
    type: String,
    required: true
  },
  model_name: {
    type: String
  },
  confidence_score: {
    type: Number
  },
  policy_decision: {
    type: String,
    enum: ["allowed", "blocked", "redacted", "escalated", "fallback"],
    default: "allowed"
  },
  safety_flag: {
    type: Boolean,
    default: false
  },
  retrieval_kb_ids: [{
    type: mongoose.Schema.Types.ObjectId
  }],
  retrieval_chunk_ids: [{
    type: mongoose.Schema.Types.ObjectId
  }],
  tool_name: {
    type: String
  },
  tool_call_validated: {
    type: Boolean
  },
  operational_entity_type: {
    type: String,
    enum: ["chatbot_session", "chatbot_message", "complaint", "attendance", "face_template", "biometric_consent", "notification"]
  },
  operational_entity_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  reviewer_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  fallback_action: {
    type: String
  },
  request_id: {
    type: String
  },
  correlation_id: {
    type: String
  },
  prompt_hash: {
    type: String
  },
  response_hash: {
    type: String
  },
  pii_redaction_applied: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Configure indexes
AiAuditLogSchema.index({ user_id: 1 });
AiAuditLogSchema.index({ timestamp: -1 });
AiAuditLogSchema.index({ action_type: 1 });
AiAuditLogSchema.index({ user_id: 1, timestamp: -1 });
AiAuditLogSchema.index({ action_type: 1, timestamp: -1 });
AiAuditLogSchema.index({ session_id: 1, timestamp: -1 });
AiAuditLogSchema.index({ correlation_id: 1 });
AiAuditLogSchema.index({ operational_entity_type: 1, operational_entity_id: 1 });
AiAuditLogSchema.index({ policy_decision: 1, timestamp: -1 });

const AiAuditLog = mongoose.models.AiAuditLog || mongoose.model('AiAuditLog', AiAuditLogSchema, 'ai_audit_logs');
export default AiAuditLog;
