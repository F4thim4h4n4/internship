'use strict';

/**
 * @file backend/seed/seedRoles.js
 * @description Idempotent predefined roles seeder for SmartCity project (TASK-DB-002).
 *
 * Requirements addressed:
 *  1. Connects to the existing MongoDB database via MONGODB_URI.
 *  2. Initializes predefined standard roles: Citizen, Municipal Staff, Department Officer, Admin, Super Admin.
 *  3. Idempotent: safe to run multiple times without creating duplicates.
 *  4. Preserves existing valid role configurations and custom permission modifications.
 *  5. Provides clear console feedback and clean error handling.
 *  6. Closes database connection safely upon completion when run directly.
 *
 * Usage:
 *  node backend/seed/seedRoles.js
 *  npm run seed:roles
 */

const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Load environment variables (.env from project root or backend)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const Role = require('../models/Role');
const { STANDARD_ROLES, ROLE_CODES } = require('../models/roles.constants');

/**
 * Seeds the standard predefined roles into the `roles` collection.
 *
 * @param {Object} [options]
 * @param {string} [options.uri] - Optional MongoDB connection URI override
 * @param {boolean} [options.existingConnection] - Whether connection is managed externally (e.g. in tests)
 * @param {boolean} [options.forceUpdate] - Whether to update permissions of existing roles
 * @returns {Promise<{ total: number, created: number, existing: number, roles: Array }>}
 */
async function seedRoles(options = {}) {
  const uri = options.uri || process.env.MONGODB_URI;

  if (!uri && !options.existingConnection) {
    throw new Error(
      'MONGODB_URI environment variable is not set. Please configure .env before running seeder.'
    );
  }

  const shouldClose = !options.existingConnection;
  if (shouldClose && mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB database for role initialization.');
  }

  const summary = {
    total: STANDARD_ROLES.length,
    created: 0,
    existing: 0,
    roles: [],
  };

  try {
    console.log(`Initialising ${STANDARD_ROLES.length} standard roles...`);

    for (const standardRole of STANDARD_ROLES) {
      // Check if role already exists by code or name to maintain idempotency
      const existingRole = await Role.findOne({
        $or: [{ code: standardRole.code }, { name: standardRole.name }],
      });

      if (existingRole) {
        console.log(`[EXISTS] Role "${existingRole.name}" (${existingRole.code}) already present. Preserving existing record.`);
        
        // Optional forced sync of permissions without deleting custom fields
        if (options.forceUpdate) {
          existingRole.permissions = standardRole.permissions;
          existingRole.description = standardRole.description;
          await existingRole.save();
          console.log(`[UPDATED] Role "${existingRole.name}" permissions synchronized.`);
        }

        summary.existing += 1;
        summary.roles.push(existingRole);
      } else {
        // Insert new standard role
        const newRole = await Role.create({
          name: standardRole.name,
          code: standardRole.code,
          description: standardRole.description,
          permissions: standardRole.permissions,
          isActive: standardRole.isActive ?? true,
        });

        console.log(`[CREATED] Role "${newRole.name}" (${newRole.code}) registered successfully with ${newRole.permissions.length} permissions.`);
        summary.created += 1;
        summary.roles.push(newRole);
      }
    }

    console.log(`Role initialization complete: ${summary.created} created, ${summary.existing} existing, ${summary.total} total.`);
    return summary;
  } finally {
    if (shouldClose && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB database.');
    }
  }
}

// Execute directly if run as a CLI script
if (require.main === module) {
  seedRoles()
    .then((summary) => {
      console.log(`Successfully finished seeding roles (${summary.created} new, ${summary.existing} existing).`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Role seeder failed:', err.message);
      process.exit(1);
    });
}

module.exports = {
  seedRoles,
  STANDARD_ROLES,
  ROLE_CODES,
};

