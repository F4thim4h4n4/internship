'use strict';

/**
 * @file backend/models/roles.constants.js
 * @description Centralized standard role definitions and permission boundaries for SmartCity.
 *
 * Architecture alignment:
 *  - Reference: docs/architecture/security/Security_Access_Control_Architecture_Document.md (Sections 3 & 4)
 *  - Reference: docs/architecture/database/SmartCity_DB_Architecture_v4.0_AI_Extension_Updated.md (Section 2)
 */

const ROLE_CODES = Object.freeze({
  CITIZEN: 'CITIZEN',
  STAFF: 'MUNICIPAL_STAFF',
  DEPARTMENT_OFFICER: 'DEPARTMENT_OFFICER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  SYSTEM_AUDITOR: 'SYSTEM_AUDITOR',
  IT_SUPPORT: 'IT_SUPPORT_ENGINEER',
});

const STANDARD_ROLES = Object.freeze([
  {
    name: 'Citizen',
    code: ROLE_CODES.CITIZEN,
    description: 'Registered municipal citizen with access to public services, complaint filing, tracking, and personal profile.',
    permissions: [
      'users:read:own',
      'users:update:own',
      'complaints:create',
      'complaints:read:own',
      'complaints:update:own',
      'files:read:own',
      'file_tracking:read:public',
      'feedback:create',
      'feedback:read:own',
      'certificates:create',
      'certificates:read:own',
      'payments:create',
      'payments:read:own',
      'tax_records:read:own',
      'chatbot:use',
      'notifications:read:own',
    ],
    isActive: true,
  },
  {
    name: 'Municipal Staff',
    code: ROLE_CODES.STAFF,
    description: 'Municipal field and office staff responsible for assigned complaints, status updates, and attendance verification.',
    permissions: [
      'users:read:own',
      'complaints:read:assigned',
      'complaints:update:assigned',
      'complaint_status_history:create',
      'file_tracking:read:assigned',
      'file_tracking:update:assigned',
      'attendance:mark',
      'attendance:read:own',
      'attendance_summary:read:own',
      'feedback:read:assigned',
      'notifications:read:own',
    ],
    isActive: true,
  },
  {
    name: 'Department Officer',
    code: ROLE_CODES.DEPARTMENT_OFFICER,
    description: 'Department officer managing departmental complaint triage, worklist assignment, and staff oversight.',
    permissions: [
      'users:read:dept',
      'departments:read:dept',
      'department_members:read:dept',
      'complaints:read:dept',
      'complaints:update:dept',
      'complaints:assign:dept',
      'complaint_status_history:create:dept',
      'file_tracking:read:dept',
      'file_tracking:update:dept',
      'attendance:read:dept',
      'attendance_summary:read:dept',
      'staff_presence:read:dept',
      'knowledge_base:create:dept',
      'knowledge_base:update:dept',
      'feedback:read:dept',
      'notifications:create:dept',
      'notifications:read:dept',
    ],
    isActive: true,
  },
  {
    name: 'Admin',
    code: ROLE_CODES.ADMIN,
    description: 'Municipal administrator managing users, employees, complaint triage, attendance analytics, reports, and settings.',
    permissions: [
      'users:create',
      'users:read',
      'users:update',
      'users:assign',
      'roles:read',
      'departments:*',
      'department_members:*',
      'complaints:*',
      'attendance:*',
      'attendance_summary:*',
      'staff_presence:*',
      'biometric_consents:*',
      'face_templates:read',
      'knowledge_base:*',
      'report_exports:*',
      'system_settings:read',
      'system_settings:update:non_secret',
      'audit_logs:read',
      'notifications:*',
    ],
    isActive: true,
  },
  {
    name: 'Super Admin',
    code: ROLE_CODES.SUPER_ADMIN,
    description: 'Highest-level administrative authority governing roles, permissions, security references, and system lifecycle.',
    permissions: ['*'],
    isActive: true,
  },
]);

module.exports = {
  ROLE_CODES,
  STANDARD_ROLES,
};

