'use strict';

/**
 * backend/seed/seedAdmin.js
 *
 * One-time seeder that creates a single System Administrator user.
 *
 * Usage (from the project root):
 *   node -r dotenv/config backend/seed/seedAdmin.js
 *
 * Requirements:
 *   - MONGODB_URI must be set in .env (or the environment).
 *   - A Role document with name "Administrator" must already exist in the
 *     `roles` collection (created by a separate role seeder / migration).
 *     This script will NOT create roles — doing so would produce inconsistent
 *     permission data if run in isolation.
 *
 * Idempotency:
 *   Running this script more than once is safe. If an admin already exists
 *   the script exits without modifying any data.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

// ── Constants ─────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'admin@municipality.local';
const ADMIN_NAME = 'System Administrator';
const ADMIN_PASSWORD = 'Admin@123'; // Development/testing only — never hard-code in production
const BCRYPT_SALT_ROUNDS = 12;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolves the ObjectId of the "Administrator" role document.
 * Throws a descriptive error when the role does not exist so developers
 * know exactly which prerequisite is missing.
 */
async function resolveAdminRole(db) {
  const role = await db.collection('roles').findOne({ name: 'Administrator' });

  if (!role) {
    throw new Error(
      'Prerequisite not met: no Role document with name "Administrator" exists ' +
        'in the `roles` collection.\n' +
        'Please run the role seeder (backend/seed/seedRoles.js) before this script.'
    );
  }

  return role._id;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error(
      'ERROR: MONGODB_URI is not set.\n' +
        'Copy .env.example to .env and fill in your Atlas connection string.'
    );
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB Atlas.');

  try {
    // ── 1. Check for existing administrator ───────────────────────────────────
    const existing = await User.findOne({ email: ADMIN_EMAIL }).lean();

    if (existing) {
      console.log(`Administrator already exists (email: ${ADMIN_EMAIL}). Nothing to do.`);
      return;
    }

    // ── 2. Resolve the Administrator role ─────────────────────────────────────
    const adminRoleId = await resolveAdminRole(mongoose.connection.db);

    // ── 3. Hash the password ──────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);

    // ── 4. Create the administrator ───────────────────────────────────────────
    const admin = await User.create({
      email: ADMIN_EMAIL,
      name: ADMIN_NAME,
      passwordHash,
      role: adminRoleId,
      isActive: true,
    });

    // Log the new user's ID only — never log the hash or password
    console.log(`Administrator created successfully. User ID: ${admin._id}`);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB Atlas.');
  }
}

main().catch((err) => {
  console.error('Seeder failed:', err.message);
  process.exit(1);
});
