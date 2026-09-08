'use strict';

const mongoose = require('mongoose');

/**
 * Every create / update / delete in the system lands here — this is the
 * accountability trail the old Google Sheet never had.
 */
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    userName: { type: String, default: 'system' },
    userRole: { type: String, default: '' },

    action: {
      type: String,
      required: true,
      enum: [
        'CREATE',
        'UPDATE',
        'DELETE',
        'LOGIN',
        'LOGIN_FAILED',
        'LOGOUT',
        'PASSWORD_RESET',
        'PERMISSION_CHANGE',
        'STATUS_CHANGE',
        'LOCK_OVERRIDE',
        'BULK_IMPORT',
        'EXPORT',
        'PAYROLL_CALCULATED',
        'PAYROLL_APPROVED',
        'PAYROLL_PAID',
        'PAYROLL_ADJUSTMENT_ADDED',
        'SALARY_ADVANCE_ISSUED',
        'SALARY_ADVANCE_CANCELLED',
        'SALARY_REVISED',
      ],
      index: true,
    },
    entity: { type: String, required: true, index: true },
    entityId: { type: String, default: null },
    entityLabel: { type: String, default: '' },

    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },

    note: { type: String, default: '', maxlength: 400 },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
