'use strict';

/**
 * @file backend/models/Role.js
 * @description Mongoose schema and model for the SmartCity `roles` collection.
 *
 * Task: TASK-DB-002 - Role Schema
 * Module: Database
 * Dependency: TASK-DB-001 (User Schema integration)
 *
 * Architecture alignment:
 *  - Reference: docs/architecture/database/SmartCity_DB_Architecture_v4.0_AI_Extension_Updated.md (Section 2, 5)
 *  - Security Reference: docs/architecture/security/Security_Access_Control_Architecture_Document.md (Section 3, 4)
 *
 * Design & Security Principles:
 *  1. Strict Validation: Required role names and codes, string length limits, non-empty permissions.
 *  2. Normalization: Standardized uppercase role codes (e.g. 'CITIZEN', 'ADMIN') and trimmed strings.
 *  3. Unique Constraints: Database-level unique indexes on `name` and `code` preventing duplicate registration.
 *  4. Data Integrity: Error middleware handles MongoDB E11000 duplicate keys with descriptive messages.
 *  5. Relational Support: Directly referenced by `User.role` (ObjectId ref: 'Role').
 *  6. Hot-Reload Safe: Guarded model compilation avoiding Mongoose overwrite errors.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const { ROLE_CODES, STANDARD_ROLES } = require('./roles.constants');

// Pattern for normalized uppercase alphanumeric role codes (e.g. MUNICIPAL_STAFF, ADMIN)
const ROLE_CODE_REGEX = /^[A-Z0-9_]+$/;

// Pattern for permission identifiers (e.g. '*', 'users:read', 'complaints:update:assigned')
const PERMISSION_REGEX = /^[a-zA-Z0-9_*:-]+$/;

const roleSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Role name is required.'],
      unique: true,
      trim: true,
      minlength: [2, 'Role name must be at least 2 characters.'],
      maxlength: [50, 'Role name must not exceed 50 characters.'],
    },

    code: {
      type: String,
      required: [true, 'Role code is required.'],
      unique: true,
      trim: true,
      uppercase: true,
      minlength: [2, 'Role code must be at least 2 characters.'],
      maxlength: [50, 'Role code must not exceed 50 characters.'],
      validate: {
        validator: function (v) {
          return ROLE_CODE_REGEX.test(v);
        },
        message: (props) => `"${props.value}" is not a valid role code format. Must contain only uppercase letters, numbers, and underscores.`,
      },
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must not exceed 500 characters.'],
      default: '',
    },

    permissions: {
      type: [
        {
          type: String,
          trim: true,
          validate: {
            validator: function (p) {
              return typeof p === 'string' && p.trim().length > 0 && PERMISSION_REGEX.test(p);
            },
            message: (props) => `"${props.value}" is not a valid permission identifier format.`,
          },
        },
      ],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'roles',
    timestamps: true,   // Automatically creates and manages createdAt and updatedAt
    versionKey: false,  // Disables __v
  }
);

// ── Pre-Validate Hook for Normalization ───────────────────────────────────────
roleSchema.pre('validate', function () {
  if (this.name) {
    this.name = this.name.trim();
  }
  if (this.code) {
    this.code = this.code.trim().toUpperCase();
  }
});

// ── Methods & Statics ─────────────────────────────────────────────────────────

/**
 * Checks whether this role has a specific permission or wildcard superuser grant.
 * @param {string} permission - The permission identifier to test (e.g. 'users:read')
 * @returns {boolean}
 */
roleSchema.methods.hasPermission = function (permission) {
  if (!Array.isArray(this.permissions) || this.permissions.length === 0) {
    return false;
  }
  // Superuser wildcard grants all permissions
  if (this.permissions.includes('*')) {
    return true;
  }
  // Exact match
  if (this.permissions.includes(permission)) {
    return true;
  }
  // Scoped wildcard match (e.g. 'users:*' matches 'users:read')
  const [resource] = permission.split(':');
  if (resource && this.permissions.includes(`${resource}:*`)) {
    return true;
  }
  return false;
};

// ── Duplicate Key Error Handling (MongoDB E11000) ─────────────────────────────
const handleDuplicateKeyError = (error, doc, next) => {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    next(new Error(`A role with that ${field} already exists.`));
  } else {
    next(error);
  }
};

roleSchema.post('save', handleDuplicateKeyError);
roleSchema.post('insertMany', handleDuplicateKeyError);
roleSchema.post('findOneAndUpdate', handleDuplicateKeyError);

// ── Model Export (Hot-Reload Safe) ────────────────────────────────────────────
const Role = mongoose.models.Role || mongoose.model('Role', roleSchema);

// Attach constants directly to model for unified access
Role.ROLE_CODES = ROLE_CODES;
Role.STANDARD_ROLES = STANDARD_ROLES;

module.exports = Role;

