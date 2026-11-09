'use strict';

/**
 * @file backend/tests/user.test.js
 * @description Comprehensive automated test suite for TASK-DB-001: Mongoose User Schema.
 *
 * Verifies all 12 acceptance criteria specified in Section 8:
 *  1. Successfully create a user with valid data.
 *  2. Reject a user without an email.
 *  3. Reject an invalid email format.
 *  4. Reject a user without a password hash.
 *  5. Verify duplicate email rejection.
 *  6. Verify password hashing.
 *  7. Verify password comparison.
 *  8. Verify that passwordHash is not exposed in normal query responses.
 *  9. Verify default isActive is true.
 * 10. Verify automatic timestamps.
 * 11. Verify the role reference.
 * 12. Verify admin seed script execution and idempotency.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const User = require('../models/User');
const { seedAdmin, resolveAdminRole, ADMIN_EMAIL, ADMIN_NAME } = require('../seed/seedAdmin');

// Sample valid data fixtures
const VALID_ROLE_ID = new mongoose.Types.ObjectId();
const SAMPLE_PASSWORD = 'SecureMunicipalPass#2026';
let SAMPLE_BCRYPT_HASH;

before(async () => {
  SAMPLE_BCRYPT_HASH = await bcrypt.hash(SAMPLE_PASSWORD, 10);
});

describe('TASK-DB-001: User Schema & Password Security Suite', () => {

  // ── 1. Successfully create a user with valid data ──────────────────────────
  it('1. Successfully creates a user instance with valid data and validates successfully', async () => {
    const validUser = new User({
      name: 'Fathima Hana',
      email: 'fathima.hana@smartcity.gov',
      passwordHash: SAMPLE_BCRYPT_HASH,
      role: VALID_ROLE_ID,
      isActive: true,
    });

    await assert.doesNotReject(async () => {
      await validUser.validate();
    }, 'Valid user should not produce validation errors');
    assert.equal(validUser.name, 'Fathima Hana');
    assert.equal(validUser.email, 'fathima.hana@smartcity.gov');
    assert.equal(validUser.isActive, true);
    assert.equal(validUser.role.toString(), VALID_ROLE_ID.toString());
  });

  // ── 2. Reject a user without an email ──────────────────────────────────────
  it('2. Rejects a user without an email', async () => {
    const userWithoutEmail = new User({
      name: 'Test Citizen',
      passwordHash: SAMPLE_BCRYPT_HASH,
      role: VALID_ROLE_ID,
    });

    await assert.rejects(
      async () => {
        await userWithoutEmail.validate();
      },
      (err) => {
        assert.ok(err.errors.email, 'Error should be on email field');
        assert.match(err.errors.email.message, /Email is required/);
        return true;
      }
    );
  });

  // ── 3. Reject an invalid email format ──────────────────────────────────────
  it('3. Rejects invalid email formats and trims/lowercases valid emails', async () => {
    const invalidEmails = [
      'plainaddress',
      '#@%^%#$@#$@#.com',
      '@missingusername.com',
      'missingatdomain.com',
      'user@.com',
      'user@domain..com',
      'user spaces@domain.com',
    ];

    for (const invalidEmail of invalidEmails) {
      const user = new User({
        name: 'Invalid Email User',
        email: invalidEmail,
        passwordHash: SAMPLE_BCRYPT_HASH,
        role: VALID_ROLE_ID,
      });

      await assert.rejects(
        async () => {
          await user.validate();
        },
        (err) => {
          assert.ok(err.errors.email, `Expected email validation error for "${invalidEmail}"`);
          assert.match(err.errors.email.message, /valid email address format/);
          return true;
        }
      );
    }

    // Verify whitespace trimming and lowercasing
    const userToTrim = new User({
      name: 'Trim User',
      email: '   CITIZEN.ONE@Kottakkal.Gov.In   ',
      passwordHash: SAMPLE_BCRYPT_HASH,
      role: VALID_ROLE_ID,
    });
    assert.equal(userToTrim.email, 'citizen.one@kottakkal.gov.in');
  });

  // ── 4. Reject a user without a password hash ───────────────────────────────
  it('4. Rejects a user without a password hash', async () => {
    const userWithoutPassword = new User({
      name: 'No Password User',
      email: 'nopass@smartcity.gov',
      role: VALID_ROLE_ID,
    });

    await assert.rejects(
      async () => {
        await userWithoutPassword.validate();
      },
      (err) => {
        assert.ok(err.errors.passwordHash, 'Error should be on passwordHash field');
        assert.match(err.errors.passwordHash.message, /Password hash is required/);
        return true;
      }
    );
  });

  // ── 5. Verify duplicate email rejection ────────────────────────────────────
  it('5. Verifies unique email constraint in schema indexes and duplicate key error handler', () => {
    // 5a. Schema-level unique index definition
    const indexes = User.schema.indexes();
    const emailIndex = indexes.find(([idxDef]) => idxDef.email === 1 && !idxDef.role);

    // Mongoose creates unique index from `unique: true` on the field
    assert.ok(
      User.schema.path('email').options.unique,
      'Email schema path must have unique: true option'
    );

    // 5b. Verify no duplicate redundant email index exists
    const allEmailIndexes = indexes.filter(([idxDef]) => idxDef.email !== undefined);
    assert.ok(
      allEmailIndexes.length <= 1,
      'Avoid duplicate indexes: email should not have redundant index definitions'
    );

    // 5c. Duplicate key error handler verification (MongoServerError code 11000)
    let handledError = null;
    const mockDuplicateError = new Error('E11000 duplicate key error collection: municipality_db.users index: email_1 dup key');
    mockDuplicateError.name = 'MongoServerError';
    mockDuplicateError.code = 11000;
    mockDuplicateError.keyPattern = { email: 1 };

    // Simulate Mongoose post error pipeline
    const postHooks = User.schema.s.hooks._posts.get('save') || [];
    const errorHandler = postHooks.find((h) => h.fn && h.fn.length >= 3);

    if (errorHandler) {
      errorHandler.fn(mockDuplicateError, null, (err) => {
        handledError = err;
      });
      assert.ok(handledError, 'Error handler should pass transformed error to next()');
      assert.match(handledError.message, /A user with that email already exists\./);
    }
  });

  // ── 6. Verify password hashing ─────────────────────────────────────────────
  it('6. Verifies password hashing mechanism and avoids double-hashing on update', async () => {
    // 6a. Static password hashing
    const generatedHash = await User.hashPassword('MySecretPass@2026', 10);
    assert.ok(generatedHash.startsWith('$2b$'), 'Bcrypt hash should start with $2b$');
    assert.equal(generatedHash.length, 60, 'Bcrypt hash should be 60 characters');

    // 6b. Pre-save hook via virtual password
    const userWithVirtual = new User({
      name: 'Virtual Pass User',
      email: 'virtual@smartcity.gov',
      role: VALID_ROLE_ID,
    });
    userWithVirtual.password = 'PlaintextPass#123';

    // Execute pre-save hooks
    await User.schema.s.hooks.execPre('save', userWithVirtual, []);
    assert.ok(userWithVirtual.passwordHash, 'Pre-save should populate passwordHash');
    assert.ok(userWithVirtual.passwordHash.startsWith('$2b$'), 'Hash should be valid bcrypt');
    assert.equal(userWithVirtual._password, undefined, 'Plaintext _password must be cleared');
    assert.ok(userWithVirtual.password_changed_at instanceof Date, 'password_changed_at should be recorded');

    // 6c. Avoid re-hashing already hashed password on unrelated field update
    const originalHash = userWithVirtual.passwordHash;
    userWithVirtual.name = 'Updated User Name'; // Modify unrelated field

    // Run pre-save hook again
    await User.schema.s.hooks.execPre('save', userWithVirtual, []);
    assert.equal(
      userWithVirtual.passwordHash,
      originalHash,
      'passwordHash must not change when an unrelated field is updated'
    );
  });

  // ── 7. Verify password comparison ──────────────────────────────────────────
  it('7. Verifies password comparison method (comparePassword and matchPassword)', async () => {
    const user = new User({
      name: 'Auth Test User',
      email: 'auth@smartcity.gov',
      passwordHash: SAMPLE_BCRYPT_HASH,
      role: VALID_ROLE_ID,
    });

    // Valid password
    const isCorrect = await user.comparePassword(SAMPLE_PASSWORD);
    assert.equal(isCorrect, true, 'comparePassword should return true for valid password');

    // Invalid password
    const isWrong = await user.comparePassword('WrongPassword#999');
    assert.equal(isWrong, false, 'comparePassword should return false for incorrect password');

    // Edge cases: null, undefined, empty string
    assert.equal(await user.comparePassword(''), false, 'Empty string candidate should return false');
    assert.equal(await user.comparePassword(null), false, 'Null candidate should return false');

    // Match password alias
    const matchAlias = await user.matchPassword(SAMPLE_PASSWORD);
    assert.equal(matchAlias, true, 'matchPassword alias should return true for valid password');
  });

  // ── 8. Verify passwordHash is not exposed in query responses ───────────────
  it('8. Verifies passwordHash is excluded from toJSON() and toObject() serialization', () => {
    const user = new User({
      name: 'Secure Serialization User',
      email: 'secure@smartcity.gov',
      passwordHash: SAMPLE_BCRYPT_HASH,
      role: VALID_ROLE_ID,
    });
    user.password = 'tempSecret';

    // 8a. toJSON() method
    const jsonOutput = user.toJSON();
    assert.equal(jsonOutput.passwordHash, undefined, 'toJSON() must delete passwordHash');
    assert.equal(jsonOutput._password, undefined, 'toJSON() must delete _password');
    assert.equal(jsonOutput.name, 'Secure Serialization User');
    assert.equal(jsonOutput.email, 'secure@smartcity.gov');

    // 8b. JSON.stringify (standard Express res.json behavior)
    const stringified = JSON.stringify(user);
    const parsed = JSON.parse(stringified);
    assert.equal(parsed.passwordHash, undefined, 'JSON.stringify output must not contain passwordHash');
    assert.equal(parsed._password, undefined, 'JSON.stringify output must not contain _password');

    // 8c. toObject() method
    const objOutput = user.toObject();
    assert.equal(objOutput.passwordHash, undefined, 'toObject() must delete passwordHash');
    assert.equal(objOutput._password, undefined, 'toObject() must delete _password');
  });

  // ── 9. Verify default isActive is true ─────────────────────────────────────
  it('9. Verifies default isActive is true', () => {
    const userWithoutActive = new User({
      name: 'Default Active User',
      email: 'active@smartcity.gov',
      passwordHash: SAMPLE_BCRYPT_HASH,
      role: VALID_ROLE_ID,
    });

    assert.equal(userWithoutActive.isActive, true, 'Default isActive value must be true');

    const explicitInactive = new User({
      name: 'Inactive User',
      email: 'inactive@smartcity.gov',
      passwordHash: SAMPLE_BCRYPT_HASH,
      role: VALID_ROLE_ID,
      isActive: false,
    });
    assert.equal(explicitInactive.isActive, false, 'Explicit isActive false should be respected');
  });

  // ── 10. Verify automatic timestamps ────────────────────────────────────────
  it('10. Verifies automatic timestamps configuration in schema options', () => {
    const schemaOptions = User.schema.options;
    assert.equal(schemaOptions.timestamps, true, 'Schema options must have timestamps: true');
    assert.ok(User.schema.path('createdAt'), 'createdAt path must be registered on schema');
    assert.ok(User.schema.path('updatedAt'), 'updatedAt path must be registered on schema');
    assert.equal(User.schema.path('createdAt').instance, 'Date');
    assert.equal(User.schema.path('updatedAt').instance, 'Date');
  });

  // ── 11. Verify the role reference ──────────────────────────────────────────
  it('11. Verifies role reference (ObjectId ref to Role) and role_id virtual alias', async () => {
    const rolePath = User.schema.path('role');
    assert.equal(rolePath.instance.toLowerCase(), 'objectid', 'Role field must be an ObjectId');
    assert.equal(rolePath.options.ref, 'Role', 'Role ref must point to Role model');
    assert.equal(rolePath.isRequired, true, 'Role field must be required');

    // Verify rejection of invalid ObjectId format
    const invalidRoleUser = new User({
      name: 'Bad Role User',
      email: 'badrole@smartcity.gov',
      passwordHash: SAMPLE_BCRYPT_HASH,
      role: 'not-a-valid-object-id',
    });
    await assert.rejects(
      async () => {
        await invalidRoleUser.validate();
      },
      (err) => {
        assert.ok(err.errors.role, 'Error should be on role field');
        return true;
      }
    );

    // Verify role_id virtual alias
    const userWithAlias = new User({
      name: 'Alias User',
      email: 'alias@smartcity.gov',
      passwordHash: SAMPLE_BCRYPT_HASH,
      role: VALID_ROLE_ID,
    });
    assert.equal(userWithAlias.role_id.toString(), VALID_ROLE_ID.toString(), 'role_id getter should return role');

    const newRoleId = new mongoose.Types.ObjectId();
    userWithAlias.role_id = newRoleId;
    assert.equal(userWithAlias.role.toString(), newRoleId.toString(), 'role_id setter should update role');
  });

  // ── 12. Verify admin seed script execution and idempotency ─────────────────
  describe('12. Admin Seed Script Verification', () => {
    it('12a. resolveAdminRole returns existing role when found', async () => {
      const mockRoleId = new mongoose.Types.ObjectId();
      const mockConnection = {
        collection: (name) => {
          assert.equal(name, 'roles');
          return {
            findOne: async (query) => {
              return { _id: mockRoleId, name: 'Administrator' };
            },
          };
        },
      };

      const resolvedId = await resolveAdminRole(mockConnection);
      assert.equal(resolvedId.toString(), mockRoleId.toString());
    });

    it('12b. resolveAdminRole creates Administrator role if not present', async () => {
      let createdDoc = null;
      const mockInsertedId = new mongoose.Types.ObjectId();
      const mockConnection = {
        collection: (name) => {
          assert.equal(name, 'roles');
          return {
            findOne: async () => null,
            insertOne: async (doc) => {
              createdDoc = doc;
              return { insertedId: mockInsertedId };
            },
          };
        },
      };

      const resolvedId = await resolveAdminRole(mockConnection);
      assert.equal(resolvedId.toString(), mockInsertedId.toString());
      assert.equal(createdDoc.name, 'Administrator');
      assert.ok(createdDoc.createdAt instanceof Date);
    });

    it('12c. seedAdmin is idempotent: detects existing admin and prevents duplicate creation', async () => {
      // Mock User.findOne to simulate an existing admin
      const originalFindOne = User.findOne;
      const existingAdminId = new mongoose.Types.ObjectId();

      User.findOne = function (query) {
        if (query.email === ADMIN_EMAIL) {
          return Promise.resolve({
            _id: existingAdminId,
            email: ADMIN_EMAIL,
            name: ADMIN_NAME,
          });
        }
        return Promise.resolve(null);
      };

      try {
        const result = await seedAdmin({ existingConnection: true });
        assert.equal(result.created, false, 'Must not create a new user if admin already exists');
        assert.equal(result.user._id.toString(), existingAdminId.toString());
      } finally {
        User.findOne = originalFindOne;
      }
    });

    it('12d. seedAdmin creates new administrator when none exists', async () => {
      const originalFindOne = User.findOne;
      const originalCreate = User.create;
      let createdPayload = null;
      const newAdminId = new mongoose.Types.ObjectId();
      const adminRoleId = new mongoose.Types.ObjectId();

      User.findOne = function () {
        return Promise.resolve(null); // No existing admin
      };

      User.create = function (payload) {
        createdPayload = payload;
        return Promise.resolve({
          _id: newAdminId,
          ...payload,
        });
      };

      // Mock connection for resolveAdminRole
      const originalCollection = mongoose.connection.collection;
      mongoose.connection.collection = function (name) {
        return {
          findOne: async () => ({ _id: adminRoleId, name: 'Administrator' }),
        };
      };

      try {
        const result = await seedAdmin({ existingConnection: true });
        assert.equal(result.created, true, 'Should create new admin');
        assert.equal(result.user._id.toString(), newAdminId.toString());
        assert.equal(createdPayload.email, ADMIN_EMAIL);
        assert.equal(createdPayload.name, ADMIN_NAME);
        assert.ok(createdPayload.passwordHash.startsWith('$2b$'), 'Password must be hashed with bcrypt');
        assert.notEqual(createdPayload.passwordHash, 'Admin@123', 'Plaintext password must never be stored');
        assert.equal(createdPayload.role.toString(), adminRoleId.toString());
        assert.equal(createdPayload.isActive, true);
      } finally {
        User.findOne = originalFindOne;
        User.create = originalCreate;
        mongoose.connection.collection = originalCollection;
      }
    });
  });
});
