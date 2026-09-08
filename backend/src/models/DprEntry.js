'use strict';

const mongoose = require('mongoose');
const { TIME_RE } = require('../services/timeCalculation');

/**
 * One DPR record per employee per calendar date.
 *
 * PROGRESSIVE LOCK-ON-SAVE (core business rule):
 * The entry has three independent field-groups — inTime, outTime and workQty
 * (work description + quantity). Each one locks the instant it is saved, in any
 * order, any number of times through the day. A locked group can only be changed
 * by an admin or an operator explicitly granted `canEditDpr`; every such override
 * is written to editHistory and to the audit log.
 *
 * An employee with NO entry at all (no IN time) is Absent — absence is inferred,
 * never stored here.
 */

const editHistorySchema = new mongoose.Schema(
  {
    fieldGroup: { type: String, enum: ['inTime', 'outTime', 'workQty', 'shift'], required: true },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedByName: { type: String, default: '' },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String, trim: true, default: '', maxlength: 200 },
    wasLocked: { type: Boolean, default: false },
  },
  { _id: false }
);

const dprEntrySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, index: true },

    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    // Snapshots so historical DPRs stay truthful even if master data changes later.
    employeeIdCode: { type: String, required: true, index: true },
    employeeName: { type: String, required: true },
    employeeType: { type: String, enum: ['Permanent', 'Contract'], required: true },

    /** Home department at the time of entry. */
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    departmentName: { type: String, default: '' },
    /** Department actually worked in that day — differs only for Helper cross-assignment. */
    workingDepartment: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    workingDepartmentName: { type: String, default: '' },
    isCrossAssigned: { type: Boolean, default: false },

    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    teamName: { type: String, default: '' },

    /** Null for Contract employees — they do not work fixed shifts. */
    shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
    shiftName: { type: String, enum: ['Day', 'Night', ''], default: '' },
    shiftStartTime: { type: String, default: '' },
    shiftEndTime: { type: String, default: '' },

    inTime: {
      type: String,
      default: null,
      validate: { validator: (v) => v === null || TIME_RE.test(v), message: 'IN time must be HH:MM' },
    },
    outTime: {
      type: String,
      default: null,
      validate: { validator: (v) => v === null || TIME_RE.test(v), message: 'OUT time must be HH:MM' },
    },

    // Derived — never accepted from the client.
    totalHours: { type: Number, default: null },
    overtime: { type: Number, default: null },
    shortTime: { type: Number, default: null },

    workDescription: { type: String, trim: true, default: '', maxlength: 500 },
    qty: { type: Number, default: null, min: [0, 'Quantity cannot be negative'] },
    qtyUnit: { type: String, trim: true, default: 'Nos', maxlength: 16 },
    /** Copied from the employee at entry time so completion logic stays stable. */
    requiresWorkQty: { type: Boolean, default: true },

    locks: {
      inTime: { type: Boolean, default: false },
      outTime: { type: Boolean, default: false },
      workQty: { type: Boolean, default: false },
    },
    lockedAt: {
      inTime: { type: Date, default: null },
      outTime: { type: Date, default: null },
      workQty: { type: Date, default: null },
    },

    entryStatus: { type: String, enum: ['Open', 'Completed'], default: 'Open', index: true },

    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    enteredByName: { type: String, default: '' },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editHistory: { type: [editHistorySchema], default: [] },
  },
  { timestamps: true }
);

// One entry per employee per day — the database itself prevents duplicates.
dprEntrySchema.index({ employee: 1, date: 1 }, { unique: true });
dprEntrySchema.index({ date: 1, workingDepartment: 1 });
dprEntrySchema.index({ date: 1, entryStatus: 1 });
dprEntrySchema.index({ enteredBy: 1, date: 1 });

/** Which field-groups still need information for this entry to be complete. */
dprEntrySchema.methods.pendingGroups = function pendingGroups() {
  const pending = [];
  if (!this.inTime) pending.push('inTime');
  if (!this.outTime) pending.push('outTime');
  if (this.requiresWorkQty && !this.workDescription) pending.push('workQty');
  return pending;
};

dprEntrySchema.methods.recomputeStatus = function recomputeStatus() {
  this.entryStatus = this.pendingGroups().length === 0 ? 'Completed' : 'Open';
  return this.entryStatus;
};

module.exports = mongoose.model('DprEntry', dprEntrySchema);
