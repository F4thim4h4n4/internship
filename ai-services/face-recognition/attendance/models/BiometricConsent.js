import mongoose from 'mongoose';

const BiometricConsentSchema = new mongoose.Schema({
  staff_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  consent_given: {
    type: Boolean,
    required: true
  },
  consent_date: {
    type: Date,
    default: Date.now
  },
  consent_source: {
    type: String,
    enum: ["paper_form", "digital_form", "admin_record"],
    required: true
  },
  consent_policy_version: {
    type: String,
    required: true
  },
  revoked_date: {
    type: Date
  },
  revoked_by: {
    type: mongoose.Schema.Types.ObjectId
  },
  deletion_requested_at: {
    type: Date
  },
  deletion_completed_at: {
    type: Date
  },
  retention_expires_at: {
    type: Date
  },
  status: {
    type: String,
    enum: ["active", "revoked", "expired", "pending"],
    default: "pending"
  },
  notes: {
    type: String
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Configure indexes
BiometricConsentSchema.index({ staff_id: 1 });
BiometricConsentSchema.index({ status: 1 });
BiometricConsentSchema.index({ staff_id: 1, status: 1 });
BiometricConsentSchema.index({ retention_expires_at: 1 });
BiometricConsentSchema.index({ deletion_requested_at: 1, status: 1 });

const BiometricConsent = mongoose.models.BiometricConsent || mongoose.model('BiometricConsent', BiometricConsentSchema, 'biometric_consents');
export default BiometricConsent;
