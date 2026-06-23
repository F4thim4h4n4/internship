import mongoose from 'mongoose';

const AiHumanReviewQueueSchema = new mongoose.Schema({
  review_no: {
    type: String,
    required: true,
    unique: true
  },
  review_type: {
    type: String,
    enum: ["chatbot_escalation", "low_confidence_answer", "ticket_escalation", "biometric_low_confidence", "liveness_failed", "manual_attendance", "ai_exception"],
    required: true
  },
  source_system: {
    type: String,
    enum: ["gemini_chatbot", "attendance_ai", "ticket_service", "ai_gateway"],
    required: true
  },
  priority: {
    type: String,
    enum: ["low", "normal", "high", "urgent"],
    default: "normal"
  },
  status: {
    type: String,
    enum: ["open", "assigned", "resolved", "rejected", "cancelled"],
    default: "open"
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  staff_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },
  department_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department'
  },
  session_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  message_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  attendance_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance'
  },
  ticket_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  ai_audit_log_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiAuditLog'
  },
  confidence_score: {
    type: Number
  },
  liveness_score: {
    type: Number
  },
  reason: {
    type: String
  },
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId
  },
  reviewed_by: {
    type: mongoose.Schema.Types.ObjectId
  },
  reviewed_at: {
    type: Date
  },
  resolution_notes: {
    type: String
  },
  correlation_id: {
    type: String
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Configure indexes
AiHumanReviewQueueSchema.index({ review_no: 1 }, { unique: true });
AiHumanReviewQueueSchema.index({ status: 1, priority: 1, created_at: 1 });
AiHumanReviewQueueSchema.index({ review_type: 1, status: 1, created_at: -1 });
AiHumanReviewQueueSchema.index({ assigned_to: 1, status: 1, created_at: -1 });
AiHumanReviewQueueSchema.index({ department_id: 1, status: 1, created_at: -1 });
AiHumanReviewQueueSchema.index({ session_id: 1 });
AiHumanReviewQueueSchema.index({ attendance_id: 1 });
AiHumanReviewQueueSchema.index({ ticket_id: 1 });
AiHumanReviewQueueSchema.index({ correlation_id: 1 });

const AiHumanReviewQueue = mongoose.models.AiHumanReviewQueue || mongoose.model('AiHumanReviewQueue', AiHumanReviewQueueSchema, 'ai_human_review_queue');
export default AiHumanReviewQueue;
