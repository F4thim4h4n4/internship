import mongoose from 'mongoose';

const FaceTemplateSchema = new mongoose.Schema({
  staff_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  consent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BiometricConsent',
    required: true
  },
  encrypted_embedding: {
    type: String,
    required: true
  },
  encryption_key_id: {
    type: String,
    required: true
  },
  model_version: {
    type: String,
    required: true
  },
  template_version: {
    type: Number,
    default: 1
  },
  previous_template_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FaceTemplate'
  },
  enrolled_device_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  enrolled_at: {
    type: Date,
    default: Date.now
  },
  retention_expires_at: {
    type: Date
  },
  deleted_at: {
    type: Date
  },
  deletion_reason: {
    type: String,
    enum: ["consent_revoked", "employment_ended", "retention_expired", "template_rotated", "admin_disabled"]
  },
  status: {
    type: String,
    enum: ["active", "revoked", "expired", "disabled", "deleted"],
    default: "active"
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Configure indexes
FaceTemplateSchema.index({ staff_id: 1 });
FaceTemplateSchema.index({ status: 1 });
FaceTemplateSchema.index({ staff_id: 1, status: 1 });
FaceTemplateSchema.index({ consent_id: 1 });
FaceTemplateSchema.index({ retention_expires_at: 1 });
FaceTemplateSchema.index({ model_version: 1, status: 1 });

const FaceTemplate = mongoose.models.FaceTemplate || mongoose.model('FaceTemplate', FaceTemplateSchema, 'face_templates');
export default FaceTemplate;
