'use strict';

/**
 * @file backend/seed/seedAdmin.js
 * @description Idempotent administrative user seed script for SmartCity project (TASK-DB-001).
 *
 * Requirements addressed:
 *  1. Uses environment variables for credentials (ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD).
 *  2. Hashes password using bcrypt (BCRYPT_SALT_ROUNDS, default 12).
 *  3. Idempotent: checks for existing administrator before insertion, preventing duplicates.
 *  4. Ensures proper Administrator role resolution from `roles` collection.
 *  5. Never logs plaintext passwords or password hashes.
 *
 * Usage:
 *  node backend/seed/seedAdmin.js
 *  npm run seed:admin
 */

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Load environment variables (.env from project root or backend)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');

// Configuration from environment variables with safe development defaults
const ADMIN_NAME = (process.env.ADMIN_NAME || 'System Administrator').trim();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@municipality.gov').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV !== 'production' ? 'Admin@123' : null);
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12;

/**
 * Resolves the Administrator role ObjectId from the `roles` collection.
 * If the role does not exist (e.g., fresh database before seedRoles is run),
 * it creates the standard Administrator role document to ensure consistency.
 *
 * @param {mongoose.Connection} connection
 * @returns {Promise<mongoose.Types.ObjectId>}
 */
async function resolveAdminRole(connection) {
  const rolesCollection = connection.collection('roles');

  // Search for standard administrator role by name or code
  let role = await rolesCollection.findOne({
    $or: [
      { code: { $in: ['ADMIN', 'ADMINISTRATOR', 'SUPER_ADMIN'] } },
      { name: { $in: ['Admin', 'Administrator', 'admin', 'administrator', 'Super Admin'] } },
    ],
  });

  if (!role) {
    console.log('Administrator role not found in `roles` collection. Initialising default role...');
    const now = new Date();
    const result = await rolesCollection.insertOne({
      name: 'Administrator',
      code: 'ADMIN',
      description: 'System Administrator with full municipal access',
      permissions: ['*'],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    return result.insertedId;
  }

  return role._id;
}

/**
 * Executes the admin seeding operation.
 * @param {Object} [options]
 * @param {string} [options.uri] - Optional MongoDB connection URI override
 * @param {boolean} [options.existingConnection] - Whether connection is already managed externally
 * @returns {Promise<{ created: boolean, user: Object }>}
 */
async function seedAdmin(options = {}) {
  const uri = options.uri || process.env.MONGODB_URI;

  if (!uri && !options.existingConnection) {
    throw new Error(
      'MONGODB_URI environment variable is not set. Please configure .env before running seeder.'
    );
  }

  if (!ADMIN_PASSWORD) {
    throw new Error(
      'ADMIN_PASSWORD environment variable is required in production. Please configure .env.'
    );
  }

  const shouldClose = !options.existingConnection;
  if (shouldClose && mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB database.');
  }

  try {
    // 1. Check for existing administrator (Idempotency check)
    const existingUser = await User.findOne({ email: ADMIN_EMAIL });
    if (existingUser) {
      console.log(`Administrator already exists for ${ADMIN_EMAIL} (User ID: ${existingUser._id}). Seeding skipped.`);
      return { created: false, user: existingUser };
    }

    // 2. Resolve Administrator role
    const adminRoleId = await resolveAdminRole(mongoose.connection);

    // 3. Hash password securely
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);

    // 4. Create administrator document
    const newAdmin = await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash,
      role: adminRoleId,
      isActive: true,
      employment_status: 'active',
      password_changed_at: new Date(),
    });

    console.log(`Administrator created successfully. User ID: ${newAdmin._id}`);
    return { created: true, user: newAdmin };
  } finally {
    if (shouldClose && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB database.');
    }
  }
}

// Execute directly if run as a CLI script
if (require.main === module) {
  seedAdmin()
    .then(() => {
      console.log('Admin seeder completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Admin seeder error:', err.message);
      process.exit(1);
    });
}

module.exports = {
  seedAdmin,
  resolveAdminRole,
  ADMIN_EMAIL,
  ADMIN_NAME,
  BCRYPT_SALT_ROUNDS,
};

