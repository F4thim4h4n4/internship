'use strict';

/**
 * @file backend/models/User.js
 * @description Mongoose schema and model for the SmartCity `users` collection.
 *
 * Task: TASK-DB-001 - Mongoose User Schema
 * Module: Database
 *
 * Architecture alignment:
 *  - Reference: docs/architecture/database/SmartCity_DB_Architecture_v4.0_AI_Extension_Updated.md (Sections 2, 4, 5, 9)
 *  - Security Reference: docs/architecture/security/Security_Access_Control_Architecture_Document.md (Sections 3, 4, 5)
 *
 * Design & Security Principles:
 *  1. Strict Validation: Email format via RFC-compliant regex, required field checks, string length bounds.
 *  2. Password Security: Bcrypt hashing, pre-save hook, never storing plaintext passwords.
 *  3. Idempotent Hashing: Avoids re-hashing already hashed passwords on unrelated field updates.
 *  4. Data Protection: `passwordHash` stripped during JSON serialisation (`toJSON`, `toObject`) so
 *     ordinary query responses / API responses never expose credential hashes.
 *  5. Relational Integrity: `role` references the `Role` model (ObjectId ref: 'Role') with `role_id` virtual alias.
 *  6. Database Constraints: Unique index on `email` at schema level; avoids duplicate index declarations.
 *  7. Error Handling: Intercepts MongoDB duplicate key (E11000) errors and transforms them into friendly messages.
 *  8. Hot-reload Safe: Prevents "Cannot overwrite model once compiled" errors.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const { Schema } = mongoose;

// Standard RFC-5322 compatible email validation pattern
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Standard bcrypt hash signature ($2a$, $2b$, or $2y$, followed by cost factor and 53 base64 characters)
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required.'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters.'],
      maxlength: [100, 'Name must not exceed 100 characters.'],
    },

    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: [255, 'Email must not exceed 255 characters.'],
      validate: {
        validator: function (value) {
          return EMAIL_REGEX.test(value);
        },
        message: (props) => `"${props.value}" is not a valid email address format.`,
      },
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

    // Extended fields aligned with SmartCity DB Architecture v4.0 AI Extension (Section 4)
    phone: {
      type: String,
      trim: true,
      sparse: true,
    },

    aadhaar_hash: {
      type: String,
      trim: true,
      sparse: true,
    },

    profile_photo_file_id: {
      type: Schema.Types.ObjectId,
      ref: 'File',
    },

    preferred_language: {
      type: String,
      trim: true,
      default: 'en',
    },

    notification_channels: {
      type: [String],
      default: ['email'],
    },

    employee_code: {
      type: String,
      trim: true,
      sparse: true,
    },

    employment_status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'suspended', 'retired'],
        message: '"{VALUE}" is not a valid employment status.',
      },
      default: 'active',
    },

    last_login_at: {
      type: Date,
    },

    password_changed_at: {
      type: Date,
    },
  },
  {
    collection: 'users',
    timestamps: true,   // Automatically creates and manages createdAt and updatedAt
    versionKey: false,  // Disables Mongoose internal __v field
  }
);

// ── Secondary Indexes (SmartCity DB Architecture v4.0 Section 4) ─────────────
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ aadhaar_hash: 1 }, { sparse: true, unique: true });
userSchema.index({ employee_code: 1 }, { sparse: true, unique: true });
userSchema.index({ role: 1, employment_status: 1 });

// ── Virtuals ──────────────────────────────────────────────────────────────────

/**
 * Virtual `role_id` alias for seamless compatibility with both `role` and `role_id` conventions.
 */
userSchema.virtual('role_id')
  .get(function () {
    return this.role;
  })
  .set(function (value) {
    this.role = value;
  });

/**
 * Virtual `password` field for transparent hashing upon creation or update.
 */
userSchema.virtual('password')
  .set(function (value) {
    this._password = value;
  })
  .get(function () {
    return this._password;
  });

// ── Pre-Save Middleware ───────────────────────────────────────────────────────

/**
 * Pre-save middleware for secure password hashing:
 *  - If plaintext `password` virtual was supplied, hashes it.
 *  - If `passwordHash` was modified directly with plaintext, hashes it.
 *  - If `passwordHash` is already a bcrypt hash, skips re-hashing.
 *  - If unrelated fields are updated, leaves `passwordHash` untouched.
 *  - Updates `password_changed_at` on credential updates.
 */
userSchema.pre('save', async function () {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;

  // Case 1: Plaintext password provided via virtual
  if (this._password) {
    this.passwordHash = await bcrypt.hash(this._password, saltRounds);
    this.password_changed_at = new Date();
    this._password = undefined;
    return;
  }

  // Case 2: passwordHash field was modified directly
  if (this.isModified('passwordHash')) {
    // Check if the assigned value is already a bcrypt digest
    if (this.passwordHash && !BCRYPT_HASH_REGEX.test(this.passwordHash)) {
      this.passwordHash = await bcrypt.hash(this.passwordHash, saltRounds);
      this.password_changed_at = new Date();
    }
  }
});

// ── Methods & Statics ─────────────────────────────────────────────────────────

/**
 * Compares candidate plaintext password with stored bcrypt hash.
 * @param {string} candidatePassword - Plaintext password to verify
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!candidatePassword || !this.passwordHash) {
    return false;
  }
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

/**
 * Alias for comparePassword.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.matchPassword = function (candidatePassword) {
  return this.comparePassword(candidatePassword);
};

/**
 * Static helper to hash passwords outside document instances.
 * @param {string} password - Plaintext password
 * @param {number} [saltRounds] - Optional bcrypt salt rounds
 * @returns {Promise<string>}
 */
userSchema.statics.hashPassword = async function (password, saltRounds) {
  const rounds = saltRounds || parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;
  return bcrypt.hash(password, rounds);
};

// ── Serialization & Data Protection ──────────────────────────────────────────

/**
 * Strips passwordHash and temporary virtuals whenever a document is serialized to JSON.
 */
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj._password;
  return obj;
};

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret._password;
    return ret;
  },
});

userSchema.set('toObject', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret._password;
    return ret;
  },
});

// ── Duplicate Key Error Handling (MongoDB E11000) ─────────────────────────────

/**
 * Intercepts MongoDB duplicate key errors and converts them into clear application messages.
 */
const handleDuplicateKeyError = (error, doc, next) => {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    next(new Error(`A user with that ${field} already exists.`));
  } else {
    next(error);
  }
};

userSchema.post('save', handleDuplicateKeyError);
userSchema.post('insertMany', handleDuplicateKeyError);
userSchema.post('findOneAndUpdate', handleDuplicateKeyError);

// ── Model Export (Hot-Reload Safe) ────────────────────────────────────────────
const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;

