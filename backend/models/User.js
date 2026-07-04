'use strict';

/**
 * backend/models/User.js
 *
 * Mongoose schema and model for the `users` collection.
 *
 * Design decisions:
 *  - email is validated with a lightweight RFC-5322-compatible regex so that
 *    obviously malformed addresses are rejected at the DB layer even if
 *    application-layer validation is bypassed.
 *  - passwordHash stores only the bcrypt digest; plaintext passwords are never
 *    persisted here.
 *  - role is a ref to the `Role` collection (ObjectId). Authorization queries
 *    use populate() to resolve role documents.
 *  - versionKey (__v) is disabled — we rely on updatedAt for optimistic checks.
 *  - The model export guard (mongoose.models.User || ...) prevents the
 *    "Cannot overwrite model once compiled" error during hot-reload.
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

// ── Email validation ──────────────────────────────────────────────────────────
// Covers the vast majority of valid addresses without pulling in a dependency.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Schema definition ─────────────────────────────────────────────────────────
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [255, 'Email must not exceed 255 characters.'],
      validate: {
        validator: (value) => EMAIL_REGEX.test(value),
        message: (props) => `"${props.value}" is not a valid email address.`,
      },
      index: true,
    },

    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters.'],
      maxlength: [100, 'Name must not exceed 100 characters.'],
    },

    passwordHash: {
      type: String,
      required: [true, 'Password hash is required.'],
    },

    role: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: [true, 'Role is required.'],
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'users',
    timestamps: true,   // Adds createdAt and updatedAt automatically
    versionKey: false,  // Disables the __v field
  }
);

// ── Instance method — safe JSON representation ────────────────────────────────
// Strips passwordHash whenever a User document is serialised (e.g. res.json()).
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

// ── Model export (hot-reload safe) ────────────────────────────────────────────
module.exports = mongoose.models.User || mongoose.model('User', userSchema);
