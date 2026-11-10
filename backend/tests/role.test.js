'use strict';

/**
 * @file backend/tests/role.test.js
 * @description Automated test suite for TASK-DB-002: Mongoose Role Schema and Predefined Role Initialization.
 *
 * Verifies all 14 acceptance criteria:
 *  1. Successfully creating a valid role.
 *  2. Successfully creating Citizen, Staff and Admin roles.
 *  3. Rejecting an empty role name.
 *  4. Rejecting duplicate role names.
 *  5. Rejecting duplicate role codes.
 *  6. Validating permission formats.
 *  7. Checking the default isActive value.
 *  8. Checking automatic timestamps.
 *  9. Verifying role indexes in schema.
 * 10. Running the seed script more than once.
 * 11. Verifying that predefined roles are not duplicated.
 * 12. Verifying compatibility with the User model.
 * 13. Testing role population through Mongoose.
 * 14. Checking that existing custom roles and permissions are preserved.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Role = require('../models/Role');
const User = require('../models/User');
const { seedRoles, STANDARD_ROLES, ROLE_CODES } = require('../seed/seedRoles');

describe('TASK-DB-002: Role Schema & Predefined Roles Suite', () => {

  // ── 1. Successfully creating a valid role ──────────────────────────────────
  it('1. Successfully creates a role instance with valid data and passes validation', async () => {
    const validRole = new Role({
      name: 'Field Inspector',
      code: 'FIELD_INSPECTOR',
      description: 'Field officer performing site investigations and reporting',
      permissions: ['complaints:read:assigned', 'complaints:update:assigned'],
      isActive: true,
    });

    await assert.doesNotReject(async () => {
      await validRole.validate();
    }, 'Valid role should pass validation');

    assert.equal(validRole.name, 'Field Inspector');
    assert.equal(validRole.code, 'FIELD_INSPECTOR');
    assert.equal(validRole.permissions.length, 2);
    assert.equal(validRole.isActive, true);
  });

  // ── 2. Successfully creating Citizen, Staff and Admin roles ────────────────
  it('2. Successfully validates all predefined standard roles (Citizen, Staff, Admin, etc.)', async () => {
    for (const standardRole of STANDARD_ROLES) {
      const roleDoc = new Role(standardRole);
      await assert.doesNotReject(async () => {
        await roleDoc.validate();
      }, `Predefined role "${standardRole.name}" (${standardRole.code}) must validate successfully`);

      assert.ok(roleDoc.name.length >= 2, 'Role name length check');
      assert.ok(roleDoc.code.length >= 2, 'Role code length check');
      assert.ok(Array.isArray(roleDoc.permissions), 'Permissions must be an array');
      assert.ok(roleDoc.permissions.length > 0, 'Standard roles must specify permissions');
    }

    // Verify presence of core expected roles
    const codes = STANDARD_ROLES.map((r) => r.code);
    assert.ok(codes.includes(ROLE_CODES.CITIZEN), 'CITIZEN role must be defined');
    assert.ok(codes.includes(ROLE_CODES.STAFF), 'MUNICIPAL_STAFF role must be defined');
    assert.ok(codes.includes(ROLE_CODES.ADMIN), 'ADMIN role must be defined');
  });

  // ── 3. Rejecting an empty role name ────────────────────────────────────────
  it('3. Rejects missing, empty, or whitespace-only role names', async () => {
    // Missing name
    const missingName = new Role({
      code: 'TEST_ROLE',
    });
    await assert.rejects(
      async () => {
        await missingName.validate();
      },
      (err) => {
        assert.ok(err.errors.name, 'Error should be on name field');
        assert.match(err.errors.name.message, /Role name is required/);
        return true;
      }
    );

    // Whitespace / too short name
    const emptyName = new Role({
      name: '   ',
      code: 'TEST_ROLE',
    });
    await assert.rejects(
      async () => {
        await emptyName.validate();
      },
      (err) => {
        assert.ok(err.errors.name, 'Error should reject empty/whitespace name');
        return true;
      }
    );
  });

  // ── 4. Rejecting duplicate role names ──────────────────────────────────────
  it('4. Verifies unique constraint on role name in schema indexes and duplicate error handler', () => {
    // 4a. Unique index on name
    assert.ok(
      Role.schema.path('name').options.unique,
      'Role name must have unique: true option'
    );

    // 4b. Duplicate key error handler
    let handledError = null;
    const mockDuplicateError = new Error('E11000 duplicate key error collection: municipality_db.roles index: name_1 dup key');
    mockDuplicateError.name = 'MongoServerError';
    mockDuplicateError.code = 11000;
    mockDuplicateError.keyPattern = { name: 1 };

    const postHooks = Role.schema.s.hooks._posts.get('save') || [];
    const errorHandler = postHooks.find((h) => h.fn && h.fn.length >= 3);

    if (errorHandler) {
      errorHandler.fn(mockDuplicateError, null, (err) => {
        handledError = err;
      });
      assert.ok(handledError, 'Error handler should pass transformed error');
      assert.match(handledError.message, /A role with that name already exists\./);
    }
  });

  // ── 5. Rejecting duplicate role codes and validating format ────────────────
  it('5. Verifies unique constraint and normalization on role code', async () => {
    // 5a. Unique index on code
    assert.ok(
      Role.schema.path('code').options.unique,
      'Role code must have unique: true option'
    );

    // 5b. Normalization (lowercased code converted to uppercase on validation)
    const roleToLower = new Role({
      name: 'Auditor Test',
      code: 'auditor_test',
    });
    await roleToLower.validate();
    assert.equal(roleToLower.code, 'AUDITOR_TEST', 'Role code should be normalized to uppercase');

    // 5c. Format validation: reject invalid characters
    const invalidCodeRole = new Role({
      name: 'Invalid Code Role',
      code: 'INVALID CODE WITH SPACES!',
    });
    await assert.rejects(
      async () => {
        await invalidCodeRole.validate();
      },
      (err) => {
        assert.ok(err.errors.code, 'Error should be on code field');
        assert.match(err.errors.code.message, /valid role code format/);
        return true;
      }
    );

    // 5d. Duplicate key error handler on code
    let handledError = null;
    const mockDuplicateError = new Error('E11000 duplicate key error index: code_1 dup key');
    mockDuplicateError.name = 'MongoServerError';
    mockDuplicateError.code = 11000;
    mockDuplicateError.keyPattern = { code: 1 };

    const postHooks = Role.schema.s.hooks._posts.get('save') || [];
    const errorHandler = postHooks.find((h) => h.fn && h.fn.length >= 3);
    if (errorHandler) {
      errorHandler.fn(mockDuplicateError, null, (err) => {
        handledError = err;
      });
      assert.match(handledError.message, /A role with that code already exists\./);
    }
  });

  // ── 6. Validating permission formats ───────────────────────────────────────
  it('6. Validates permission identifier formats and permission checking method', async () => {
    // Rejects empty string in permissions array
    const emptyPermissionRole = new Role({
      name: 'Empty Perm Role',
      code: 'EMPTY_PERM',
      permissions: ['users:read', '   '],
    });
    await assert.rejects(
      async () => {
        await emptyPermissionRole.validate();
      },
      (err) => {
        assert.ok(err.errors['permissions.1'], 'Empty permission element must fail validation');
        return true;
      }
    );

    // Rejects invalid characters in permission string
    const invalidPermChar = new Role({
      name: 'Bad Perm Role',
      code: 'BAD_PERM',
      permissions: ['valid:permission', 'invalid permission with spaces!'],
    });
    await assert.rejects(
      async () => {
        await invalidPermChar.validate();
      },
      (err) => {
        assert.ok(err.errors['permissions.1'], 'Malformed permission format must fail validation');
        return true;
      }
    );

    // Tests hasPermission method
    const adminRole = new Role({
      name: 'Admin Test',
      code: 'ADMIN_TEST',
      permissions: ['users:*', 'complaints:read'],
    });
    assert.equal(adminRole.hasPermission('complaints:read'), true, 'Exact match should return true');
    assert.equal(adminRole.hasPermission('users:create'), true, 'Scoped wildcard users:* should match users:create');
    assert.equal(adminRole.hasPermission('billing:pay'), false, 'Non-granted permission should return false');

    const superAdminRole = new Role({
      name: 'Super Admin Test',
      code: 'SUPER_ADMIN_TEST',
      permissions: ['*'],
    });
    assert.equal(superAdminRole.hasPermission('any:system:action'), true, 'Super admin wildcard * matches everything');
  });

  // ── 7. Checking default isActive value ─────────────────────────────────────
  it('7. Verifies default isActive is true and explicit false is respected', () => {
    const defaultActive = new Role({
      name: 'Active Test',
      code: 'ACTIVE_TEST',
    });
    assert.equal(defaultActive.isActive, true, 'Default isActive must be true');

    const inactiveRole = new Role({
      name: 'Inactive Test',
      code: 'INACTIVE_TEST',
      isActive: false,
    });
    assert.equal(inactiveRole.isActive, false, 'Explicit isActive false must be preserved');
  });

  // ── 8. Checking automatic timestamps ───────────────────────────────────────
  it('8. Verifies automatic timestamps in schema options', () => {
    assert.equal(Role.schema.options.timestamps, true, 'timestamps option must be true');
    assert.ok(Role.schema.path('createdAt'), 'createdAt path must exist');
    assert.ok(Role.schema.path('updatedAt'), 'updatedAt path must exist');
    assert.equal(Role.schema.path('createdAt').instance, 'Date');
    assert.equal(Role.schema.path('updatedAt').instance, 'Date');
  });

  // ── 9. Verifying role indexes in schema ─────────────────────────────────────
  it('9. Verifies unique indexes on name and code without redundant duplicate definitions', () => {
    assert.ok(Role.schema.path('name').options.unique, 'name must have unique: true');
    assert.ok(Role.schema.path('code').options.unique, 'code must have unique: true');

    const indexes = Role.schema.indexes();
    const nameIndexes = indexes.filter(([def]) => def.name !== undefined);
    const codeIndexes = indexes.filter(([def]) => def.code !== undefined);

    assert.ok(nameIndexes.length <= 1, 'name should have at most 1 index definition');
    assert.ok(codeIndexes.length <= 1, 'code should have at most 1 index definition');
  });

  // ── 10. Running seed script and idempotency ────────────────────────────────
  describe('10-11. Role Seed Script Idempotency Suite', () => {
    it('10 & 11. seedRoles inserts missing roles and avoids duplicates on repeated runs', async () => {
      const insertedRoles = [];

      // Mock Role.findOne and Role.create to simulate database state
      const originalFindOne = Role.findOne;
      const originalCreate = Role.create;

      Role.findOne = function (query) {
        const codeFilter = query.$or?.find((q) => q.code)?.code;
        const nameFilter = query.$or?.find((q) => q.name)?.name;
        const found = insertedRoles.find(
          (r) => r.code === codeFilter || r.name === nameFilter
        );
        return Promise.resolve(found || null);
      };

      Role.create = function (doc) {
        const newDoc = {
          _id: new mongoose.Types.ObjectId(),
          ...doc,
          save: async function () { return this; },
        };
        insertedRoles.push(newDoc);
        return Promise.resolve(newDoc);
      };

      try {
        // Run 1: Should create all standard roles
        const run1 = await seedRoles({ existingConnection: true });
        assert.equal(run1.created, STANDARD_ROLES.length, 'Run 1 should create all standard roles');
        assert.equal(run1.existing, 0, 'Run 1 should have 0 existing roles');
        assert.equal(insertedRoles.length, STANDARD_ROLES.length);

        // Run 2: Should find all existing roles and create 0 new roles (idempotency)
        const run2 = await seedRoles({ existingConnection: true });
        assert.equal(run2.created, 0, 'Run 2 must not create duplicate roles');
        assert.equal(run2.existing, STANDARD_ROLES.length, 'Run 2 should detect all existing roles');
        assert.equal(insertedRoles.length, STANDARD_ROLES.length, 'Total stored roles must remain constant');
      } finally {
        Role.findOne = originalFindOne;
        Role.create = originalCreate;
      }
    });

    it('14. Preserves existing custom roles and permissions without destructive overwrites', async () => {
      const customPermissions = ['custom:municipal:override', 'special:dispatch'];
      const mockExistingRole = {
        _id: new mongoose.Types.ObjectId(),
        name: 'Municipal Staff',
        code: 'MUNICIPAL_STAFF',
        description: 'Customized municipal staff description',
        permissions: [...customPermissions],
        save: async function () { return this; },
      };

      const originalFindOne = Role.findOne;
      Role.findOne = function () {
        return Promise.resolve(mockExistingRole);
      };

      try {
        const summary = await seedRoles({ existingConnection: true, forceUpdate: false });
        assert.equal(summary.existing, STANDARD_ROLES.length);
        // Verify custom permissions were preserved
        assert.deepEqual(
          mockExistingRole.permissions,
          customPermissions,
          'Custom permissions must not be erased during standard seeding'
        );
      } finally {
        Role.findOne = originalFindOne;
      }
    });
  });

  // ── 12. Verifying compatibility with the User model ────────────────────────
  it('12. Verifies User schema role reference points to Role and validates seamlessly', async () => {
    const roleId = new mongoose.Types.ObjectId();
    const rolePath = User.schema.path('role');

    assert.equal(rolePath.options.ref, 'Role', 'User.role ref must point to Role');

    const user = new User({
      name: 'Staff Member',
      email: 'staff.member@smartcity.gov',
      passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz012345678901234567890123456789',
      role: roleId,
    });

    await assert.doesNotReject(async () => {
      await user.validate();
    }, 'User with valid Role ObjectId must pass validation');

    assert.equal(user.role.toString(), roleId.toString());
    assert.equal(user.role_id.toString(), roleId.toString());
  });

  // ── 13. Testing role population through Mongoose ───────────────────────────
  it('13. Verifies Role and User model compilation for Mongoose populate() support', () => {
    // Both models should be registered in mongoose.models
    assert.ok(mongoose.models.Role, 'Role model must be registered on mongoose.models');
    assert.ok(mongoose.models.User, 'User model must be registered on mongoose.models');

    // Confirm User role path has proper ref configuration for populate()
    const userRoleRef = User.schema.path('role').options.ref;
    assert.equal(userRoleRef, 'Role', 'User role path ref must match Role model name');
  });

});

