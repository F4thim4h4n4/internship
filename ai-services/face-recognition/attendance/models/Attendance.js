import mongoose from 'mongoose';

const AttendanceSchema = new mongoose.Schema({
  metadata: {
    staff_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff'
    },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department'
    },
    device_id: {
      type: mongoose.Schema.Types.ObjectId
    }
  },
  punch_time: {
    type: Date,
    default: Date.now
  },
  verification_method: {
    type: String,
    enum: ["face", "manual", "device_card", "supervisor_override"],
    required: true
  },
  face_match_score: {
    type: Number
  },
  liveness_score: {
    type: Number
  },
  confidence_score: {
    type: Number
  },
  liveness_result: {
    type: String,
    enum: ["passed", "failed", "not_required", "manual_override"]
  },
  confidence_decision: {
    type: String,
    enum: ["high_confidence", "low_confidence", "rejected", "manual_required"]
  },
  device_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  capture_location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: false
    }
  },
  location_verified: {
    type: Boolean,
    default: false
  },
  shift_id: {
    type: mongoose.Schema.Types.ObjectId
  },
  late_flag: {
    type: Boolean,
    default: false
  },
  template_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FaceTemplate'
  },
  consent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BiometricConsent'
  },
  model_version: {
    type: String
  },
  manual_fallback_used: {
    type: Boolean,
    default: false
  },
  fallback_reason: {
    type: String
  },
  correlation_id: {
    type: String
  },
  review_status: {
    type: String,
    enum: ["pending", "approved", "rejected", "escalated"],
    default: "pending"
  },
  reviewed_by: {
    type: mongoose.Schema.Types.ObjectId
  },
  reviewed_at: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Configure indexes
AttendanceSchema.index({ "metadata.staff_id": 1, punch_time: -1 });
AttendanceSchema.index({ "metadata.department_id": 1, punch_time: -1 });
AttendanceSchema.index({ "metadata.device_id": 1, punch_time: -1 });
AttendanceSchema.index({ review_status: 1, punch_time: -1 });
AttendanceSchema.index({ verification_method: 1, punch_time: -1 });
AttendanceSchema.index({ confidence_decision: 1, punch_time: -1 });
AttendanceSchema.index({ template_id: 1 });
AttendanceSchema.index({ consent_id: 1 });
AttendanceSchema.index({ correlation_id: 1 });
AttendanceSchema.index({ capture_location: "2dsphere" });
AttendanceSchema.index({ shift_id: 1, punch_time: -1 });
AttendanceSchema.index({ late_flag: 1, punch_time: -1 });

const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', AttendanceSchema, 'attendance');
export default Attendance;
