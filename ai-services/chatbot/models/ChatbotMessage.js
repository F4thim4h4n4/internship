import mongoose from 'mongoose';

const ChatbotMessageSchema = new mongoose.Schema({
  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatbotSession',
    required: true
  },
  role: {
    type: String,
    enum: ["user", "assistant", "system", "human_agent", "tool"],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  redacted_content: {
    type: String
  },
  language: {
    type: String,
    default: 'en'
  },
  intent: {
    type: String
  },
  ai_model: {
    type: String
  },
  prompt_version: {
    type: String
  },
  guardrail_version: {
    type: String
  },
  retrieval_kb_ids: [{
    type: mongoose.Schema.Types.ObjectId
  }],
  retrieval_chunk_ids: [{
    type: mongoose.Schema.Types.ObjectId
  }],
  tool_call_name: {
    type: String
  },
  tool_call_validated: {
    type: Boolean,
    default: false
  },
  ticket_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  fallback_action: {
    type: String,
    enum: ["none", "human_escalation", "safe_message", "ticket_created", "status_lookup_failed"],
    default: "none"
  },
  confidence_score: {
    type: Number
  },
  escalation_triggered: {
    type: Boolean,
    default: false
  },
  safety_flag: {
    type: Boolean,
    default: false
  },
  response_source: {
    type: String,
    enum: ["RAG", "fallback", "human", "system"]
  },
  correlation_id: {
    type: String
  },
  expires_at: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Configure indexes
ChatbotMessageSchema.index({ session_id: 1, created_at: 1 });
ChatbotMessageSchema.index({ ai_model: 1, created_at: -1 });
ChatbotMessageSchema.index({ escalation_triggered: 1, created_at: -1 });
ChatbotMessageSchema.index({ safety_flag: 1, created_at: -1 });
ChatbotMessageSchema.index({ ticket_id: 1 });
ChatbotMessageSchema.index({ correlation_id: 1 });
ChatbotMessageSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const ChatbotMessage = mongoose.models.ChatbotMessage || mongoose.model('ChatbotMessage', ChatbotMessageSchema, 'chatbot_messages');
export default ChatbotMessage;
