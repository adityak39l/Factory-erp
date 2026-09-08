'use strict';

const { env } = require('./env');

/**
 * OpenAPI 3 description of the Phase 1 API.
 * Served at /api/docs by swagger-ui-express.
 */
const bearer = [{ bearerAuth: [] }];

const dateParam = {
  in: 'query',
  name: 'date',
  schema: { type: 'string', format: 'date', example: '2026-09-05' },
  description: 'Calendar date (YYYY-MM-DD). Defaults to today.',
};

const rangeParams = [
  { in: 'query', name: 'from', required: true, schema: { type: 'string', format: 'date' } },
  { in: 'query', name: 'to', required: true, schema: { type: 'string', format: 'date' } },
  { in: 'query', name: 'department', schema: { type: 'string' } },
  { in: 'query', name: 'team', schema: { type: 'string' } },
  { in: 'query', name: 'employee', schema: { type: 'string' } },
  { in: 'query', name: 'employeeType', schema: { type: 'string', enum: ['Permanent', 'Contract'] } },
  { in: 'query', name: 'shift', schema: { type: 'string', enum: ['Day', 'Night'] } },
];

const ok = (description) => ({ 200: { description } });

const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Trading Engineers — Factory Employee Management & DPR API',
    version: '1.0.0',
    description: [
      'Phase 1 API: employees, departments, shifts, holidays, DPR, attendance,',
      'reports, operators & permissions, audit log and system settings.',
      '',
      '**Key rules enforced by this API**',
      '- Progressive lock-on-save: `inTime`, `outTime` and `workQty` lock independently the moment each is saved.',
      '- Overtime / short-time are calculated for Permanent employees only; Contract employees get total hours.',
      '- Night shifts crossing midnight are computed as one continuous shift on one date.',
      '- Absence is inferred (no entry + not a holiday + Active employee), never stored.',
      '- Every permission is checked server-side; the UI is never the gate.',
    ].join('\n'),
    contact: { name: 'Trading Engineers' },
  },
  servers: [{ url: `http://localhost:${env.port}`, description: 'Local development' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          details: { type: 'array', items: { type: 'object' } },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', example: 'admin' },
          password: { type: 'string', example: 'Admin@12345' },
        },
      },
      DprSaveRequest: {
        type: 'object',
        required: ['employee', 'date'],
        description:
          'Send only the field-group(s) you currently have. Each one locks on save.',
        properties: {
          employee: { type: 'string', description: 'Employee _id' },
          date: { type: 'string', format: 'date' },
          shiftName: { type: 'string', enum: ['Day', 'Night'] },
          workingDepartment: {
            type: 'string',
            description: 'Helper-pool cross-assignment for this day only',
          },
          inTime: { type: 'string', example: '09:15' },
          outTime: { type: 'string', example: '18:20' },
          workDescription: { type: 'string', example: 'NNJ pole connection plate' },
          qty: { type: 'number', example: 38 },
          qtyUnit: { type: 'string', example: 'Nos' },
          reason: { type: 'string', description: 'Required context when overriding a locked field' },
        },
      },
      DprEntry: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          date: { type: 'string', format: 'date' },
          employeeId: { type: 'string', example: '2608001' },
          employeeName: { type: 'string' },
          employeeType: { type: 'string', enum: ['Permanent', 'Contract'] },
          shiftName: { type: 'string', nullable: true },
          inTime: { type: 'string', nullable: true },
          outTime: { type: 'string', nullable: true },
          totalHours: { type: 'number', nullable: true },
          overtime: { type: 'number', nullable: true, description: 'null for Contract employees' },
          shortTime: { type: 'number', nullable: true, description: 'null for Contract employees' },
          workDescription: { type: 'string' },
          qty: { type: 'number', nullable: true },
          locks: {
            type: 'object',
            properties: {
              inTime: { type: 'boolean' },
              outTime: { type: 'boolean' },
              workQty: { type: 'boolean' },
            },
          },
          entryStatus: { type: 'string', enum: ['Open', 'Completed'] },
          workingStatus: {
            type: 'string',
            enum: ['Working', 'Completed', 'Incomplete', 'Absent'],
          },
        },
      },
    },
  },
  security: bearer,
  tags: [
    { name: 'Authentication' },
    { name: 'Employees' },
    { name: 'Configuration', description: 'Departments, teams, shifts, holidays' },
    { name: 'DPR' },
    { name: 'Dashboard' },
    { name: 'Reports' },
    { name: 'Operators & Permissions' },
    { name: 'Audit' },
    { name: 'System' },
  ],
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Sign in and receive a JWT',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: { description: 'Token and user profile with effective permissions' },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/auth/me': {
      get: { tags: ['Authentication'], summary: 'Current user & permissions', responses: ok('Current user') },
    },
    '/api/auth/change-password': {
      post: { tags: ['Authentication'], summary: 'Change your own password', responses: ok('Password updated') },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['Authentication'],
        summary: 'Admin lockout recovery — emails a one-time code',
        security: [],
        responses: ok('Generic acknowledgement (never reveals whether the account exists)'),
      },
    },
    '/api/auth/reset-password': {
      post: { tags: ['Authentication'], summary: 'Complete the OTP reset', security: [], responses: ok('Password reset') },
    },

    '/api/employees': {
      get: {
        tags: ['Employees'],
        summary: 'List employees (Active by default)',
        parameters: [
          { in: 'query', name: 'status', schema: { type: 'string', enum: ['Active', 'Inactive', 'All'] } },
          { in: 'query', name: 'search', schema: { type: 'string' } },
          { in: 'query', name: 'department', schema: { type: 'string' } },
          { in: 'query', name: 'employeeType', schema: { type: 'string', enum: ['Permanent', 'Contract'] } },
          { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
          { in: 'query', name: 'limit', schema: { type: 'integer', default: 25 } },
        ],
        responses: ok('Paginated employees; Aadhar & bank data masked unless permitted'),
      },
      post: {
        tags: ['Employees'],
        summary: 'Register an employee (auto-generates YYMM+3-digit ID)',
        responses: { 201: { description: 'Employee created' } },
      },
    },
    '/api/employees/search': {
      get: { tags: ['Employees'], summary: 'Type-ahead lookup for DPR entry (Active only)', responses: ok('Matches') },
    },
    '/api/employees/{id}': {
      get: { tags: ['Employees'], summary: 'Employee profile', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: ok('Employee') },
      put: { tags: ['Employees'], summary: 'Update employee master data', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: ok('Updated') },
    },
    '/api/employees/{id}/status': {
      patch: {
        tags: ['Employees'],
        summary: 'Activate / deactivate (history always preserved)',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: ok('Status changed'),
      },
    },
    '/api/employees/{id}/attendance': {
      get: {
        tags: ['Employees'],
        summary: 'Monthly attendance & DPR history, split by Day/Night shift',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'query', name: 'year', schema: { type: 'integer', example: 2026 } },
          { in: 'query', name: 'month', schema: { type: 'integer', example: 7 } },
        ],
        responses: ok('Calendar days + summary totals'),
      },
    },
    '/api/employees/import/template': {
      get: { tags: ['Employees'], summary: 'Download the bulk-import CSV template', responses: ok('CSV file') },
    },
    '/api/employees/import/validate': {
      post: { tags: ['Employees'], summary: 'Validate an upload and preview results', responses: ok('Row-by-row validation') },
    },
    '/api/employees/import/confirm': {
      post: { tags: ['Employees'], summary: 'Import only the rows that passed validation', responses: ok('Import result') },
    },

    '/api/masters/departments': {
      get: { tags: ['Configuration'], summary: 'List departments with headcount and teams', responses: ok('Departments') },
      post: { tags: ['Configuration'], summary: 'Create a department', responses: { 201: { description: 'Created' } } },
    },
    '/api/masters/teams': {
      get: { tags: ['Configuration'], summary: 'List teams', responses: ok('Teams') },
      post: { tags: ['Configuration'], summary: 'Create a team (department must have teams enabled)', responses: { 201: { description: 'Created' } } },
    },
    '/api/masters/shifts': {
      get: { tags: ['Configuration'], summary: 'Current shift timings and history', responses: ok('Shifts') },
      put: {
        tags: ['Configuration'],
        summary: 'Set shift timings (creates a new dated version, history preserved)',
        responses: ok('Shift saved'),
      },
    },
    '/api/masters/holidays': {
      get: { tags: ['Configuration'], summary: 'List holidays', responses: ok('Holidays') },
      post: { tags: ['Configuration'], summary: 'Declare a holiday (blocks DPR entry)', responses: { 201: { description: 'Created' } } },
    },

    '/api/dpr/control-center': {
      get: {
        tags: ['DPR'],
        summary: "Today's DPR for every active employee, with lock/pending indicators",
        parameters: [dateParam, { in: 'query', name: 'department', schema: { type: 'string' } }],
        responses: ok('Rows + summary'),
      },
    },
    '/api/dpr': {
      post: {
        tags: ['DPR'],
        summary: 'Progressive save — each field-group locks on save',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DprSaveRequest' } } },
        },
        responses: {
          200: { description: 'Saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/DprEntry' } } } },
          403: { description: 'Field is locked and you lack edit rights' },
        },
      },
    },
    '/api/dpr/bulk': {
      post: { tags: ['DPR'], summary: 'Table-style bulk entry (same locking rules)', responses: ok('Per-row result') },
    },
    '/api/dpr/entry': {
      get: { tags: ['DPR'], summary: 'One employee/date entry', responses: ok('Entry or null') },
    },
    '/api/dpr/my-workspace': {
      get: {
        tags: ['DPR'],
        summary: "The logged-in operator's own DPR Missing Information list",
        description:
          'Informational only. Excludes employees with no IN time (they are Absent), skips work/qty for support roles, and shows missing OUT time only after the shift end has passed.',
        parameters: [dateParam],
        responses: ok('Missing information items'),
      },
    },
    '/api/dpr/incomplete': {
      get: { tags: ['DPR'], summary: 'Factory-wide incomplete DPR entries', parameters: [dateParam], responses: ok('Items') },
    },
    '/api/dpr/{id}': {
      delete: { tags: ['DPR'], summary: 'Delete an entry (admin only)', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: ok('Deleted') },
    },

    '/api/dashboard/overview': {
      get: { tags: ['Dashboard'], summary: 'Live headline statistics', parameters: [dateParam], responses: ok('Stats + absentees') },
    },
    '/api/dashboard/departments': {
      get: { tags: ['Dashboard'], summary: 'Department-wise attendance breakdown', parameters: [dateParam], responses: ok('Departments') },
    },
    '/api/dashboard/analytics': {
      get: {
        tags: ['Dashboard'],
        summary: 'Monthly chart data (attendance, overtime, hours, completion)',
        parameters: [
          { in: 'query', name: 'year', schema: { type: 'integer' } },
          { in: 'query', name: 'month', schema: { type: 'integer' } },
        ],
        responses: ok('Trends and comparisons'),
      },
    },
    '/api/dashboard/notifications': {
      get: { tags: ['Dashboard'], summary: 'Derived alert items for the header bell', responses: ok('Items') },
    },
    '/api/dashboard/search': {
      get: {
        tags: ['Dashboard'],
        summary: 'Global search (employees, departments, DPR dates)',
        parameters: [{ in: 'query', name: 'q', schema: { type: 'string' } }],
        responses: ok('Grouped results'),
      },
    },

    '/api/reports/dpr': {
      get: { tags: ['Reports'], summary: 'Detailed DPR register', parameters: rangeParams, responses: ok('Rows + totals') },
    },
    '/api/reports/attendance': {
      get: { tags: ['Reports'], summary: 'Attendance summary per employee', parameters: rangeParams, responses: ok('Rows + totals') },
    },
    '/api/reports/production': {
      get: { tags: ['Reports'], summary: 'Production quantity report', parameters: rangeParams, responses: ok('Grouped totals') },
    },
    '/api/reports/export': {
      get: {
        tags: ['Reports'],
        summary: 'Export a report as Excel, CSV or PDF',
        parameters: [
          ...rangeParams,
          { in: 'query', name: 'type', schema: { type: 'string', enum: ['dpr', 'attendance'] } },
          { in: 'query', name: 'format', schema: { type: 'string', enum: ['excel', 'csv', 'pdf'] } },
        ],
        responses: ok('File download'),
      },
    },

    '/api/operators': {
      get: { tags: ['Operators & Permissions'], summary: 'List logins (admin only)', responses: ok('Operators') },
      post: { tags: ['Operators & Permissions'], summary: 'Create an operator login', responses: { 201: { description: 'Created' } } },
    },
    '/api/operators/permissions': {
      get: { tags: ['Operators & Permissions'], summary: 'Permission catalogue for the checklist UI', responses: ok('Permissions') },
    },
    '/api/operators/{id}/permissions': {
      put: { tags: ['Operators & Permissions'], summary: 'Update an operator permission checklist', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: ok('Updated') },
    },
    '/api/operators/{id}/password': {
      put: { tags: ['Operators & Permissions'], summary: 'Admin resets an operator password', parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: ok('Reset') },
    },

    '/api/audit': {
      get: { tags: ['Audit'], summary: 'Audit trail (admin only)', responses: ok('Paginated log') },
    },

    '/api/system/health': {
      get: { tags: ['System'], summary: 'Public liveness probe', security: [], responses: ok('Health') },
    },
    '/api/system/settings': {
      get: { tags: ['System'], summary: 'Read system settings', responses: ok('Settings') },
      put: { tags: ['System'], summary: 'Update system settings (admin only)', responses: ok('Updated') },
    },
    '/api/system/status': {
      get: { tags: ['System'], summary: 'Admin system health & backup information', responses: ok('Status') },
    },
  },
};

module.exports = { swaggerSpec };
