'use strict';

/**
 * Operator permission catalogue.
 *
 * Admin always has every permission implicitly and can never be restricted.
 * Operators start with everything OFF; the admin ticks exactly what each one may do.
 * Every permission is enforced on the BACKEND — the UI only mirrors it.
 */
const PERMISSIONS = [
  {
    key: 'canRegisterEmployee',
    label: 'Register new employees',
    group: 'Employees',
    description: 'Create new employee master records.',
  },
  {
    key: 'canEditEmployee',
    label: 'Edit employee details',
    group: 'Employees',
    description: 'Modify existing employee master data.',
  },
  {
    key: 'canAssignDepartment',
    label: 'Assign employees to departments / teams',
    group: 'Employees',
    description: 'Move employees between departments and teams.',
  },
  {
    key: 'canChangeEmployeeStatus',
    label: 'Activate / deactivate employees',
    group: 'Employees',
    description: 'Mark an employee Active or Inactive (history is always preserved).',
  },
  {
    key: 'canViewSensitive',
    label: 'View Aadhar & bank details',
    group: 'Employees',
    description: 'Unmask Aadhar number and bank account details. Off by default.',
  },
  {
    key: 'canEnterDpr',
    label: 'Enter DPR',
    group: 'DPR',
    description: 'Record IN time, OUT time and work done for employees.',
  },
  {
    key: 'canEditDpr',
    label: 'Edit locked DPR fields',
    group: 'DPR',
    description:
      'Override a DPR field that has already been saved and locked. Off by default.',
  },
  {
    key: 'canManageMasters',
    label: 'Manage departments, teams, shifts & holidays',
    group: 'Configuration',
    description: 'Create and edit master configuration records.',
  },
  {
    key: 'canViewReports',
    label: 'View reports & analytics',
    group: 'Reporting',
    description: 'Access the reports, analytics and export screens.',
  },
];

const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/** A fresh permission object with everything disabled. */
function emptyPermissions() {
  return PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});
}

/** Admin behaves as if every permission is granted. */
function fullPermissions() {
  return PERMISSION_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {});
}

/** Keeps only known keys and coerces to booleans. */
function sanitisePermissions(input = {}) {
  const out = emptyPermissions();
  PERMISSION_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = Boolean(input[key]);
  });
  return out;
}

module.exports = {
  PERMISSIONS,
  PERMISSION_KEYS,
  emptyPermissions,
  fullPermissions,
  sanitisePermissions,
};
