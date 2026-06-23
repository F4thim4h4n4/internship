import mongoose from 'mongoose';

const ChatbotSessionSchema = new mongoose.Schema({
  session_no: {
    type: String,
    required: true,
    unique: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  channel: {
    type: String,
    enum: ["web", "mobile", "kiosk", "staff_portal", "api"],
    required: true
  },
  language: {
    type: String,
    default: 'en'
  },
  auth_context: {
    authenticated: {
      type: Boolean,
      default: false
    },
    auth_session_id: {
      type: mongoose.Schema.Types.ObjectId
    }
  },
  status: {
    type: String,
    enum: ["active", "closed", "escalated", "expired"],
    default: 'active'
  },
  started_at: {
    type: Date,
    default: Date.now
  },
  ended_at: {
    type: Date
  },
  expires_at: {
    type: Date
  },
  last_message_at: {
    type: Date,
    default: Date.now
  },
  escalation_requested: {
    type: Boolean,
    default: false
  },
  escalation_reason: {
    type: String
  },
  ticket_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Complaint'
  },
  correlation_id: {
    type: String
  },
  pii_redaction_applied: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Configure indexes
ChatbotSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
ChatbotSessionSchema.index({ user_id: 1, started_at: -1 });
ChatbotSessionSchema.index({ status: 1, last_message_at: -1 });
ChatbotSessionSchema.index({ channel: 1, started_at: -1 });
ChatbotSessionSchema.index({ correlation_id: 1 });

const ChatbotSession = mongoose.models.ChatbotSession || mongoose.model('ChatbotSession', ChatbotSessionSchema, 'chatbot_sessions');
export default ChatbotSession;
