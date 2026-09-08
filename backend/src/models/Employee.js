'use strict';

const mongoose = require('mongoose');
const { encrypt, decrypt, maskAadhar, maskAccount } = require('../services/encryption');

/**
 * Employee master data.
 *
 * Sensitive fields (Aadhar number, bank account number) are encrypted at rest with
 * AES-256-GCM and are only ever decrypted for a user holding `canViewSensitive`.
 */
const employeeSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{7}$/, 'Employee ID must be 7 digits (YYMM + 3 digits)'],
    },

    name: { type: String, required: [true, 'Employee name is required'], trim: true, maxlength: 80 },
    designation: { type: String, trim: true, default: '', maxlength: 80 },
    fathersName: { type: String, trim: true, default: '', maxlength: 80 },
    mobileNo: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: (v) => !v || /^[6-9]\d{9}$/.test(v),
        message: 'Mobile number must be a valid 10-digit Indian number',
      },
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      validate: {
        validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Email address is not valid',
      },
    },
    address: { type: String, trim: true, default: '', maxlength: 300 },
    photoUrl: { type: String, trim: true, default: '' },

    // --- Sensitive, encrypted at rest ---
    aadharNo: { type: String, default: '', select: false },
    bankDetails: {
      bankName: { type: String, trim: true, default: '' },
      accountNo: { type: String, default: '', select: false },
      ifsc: {
        type: String,
        trim: true,
        uppercase: true,
        default: '',
        validate: {
          validator: (v) => !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
          message: 'IFSC code format is invalid (e.g. SBIN0001234)',
        },
      },
    },

    // --- Employment ---
    employeeType: {
      type: String,
      enum: {
        values: ['Permanent', 'Contract'],
        message: 'Employee type must be Permanent or Contract',
      },
      default: 'Permanent',
      index: true,
    },
    /**
     * Default shift. Meaningful for Permanent employees only — Contract workers do
     * not follow fixed factory shifts, so they get total hours with no OT/short-time.
     */
    shiftCategory: {
      type: String,
      enum: ['Day', 'Night', 'Not Applicable'],
      default: 'Day',
    },
    /**
     * False for support roles (guard, cook, sweeper): their DPR is never treated as
     * incomplete for a missing work description / quantity.
     */
    requiresWorkQty: { type: Boolean, default: true },

    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Employee must be assigned to a department'],
      index: true,
    },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

    joiningDate: { type: Date, required: true },
    joiningYear: { type: Number, required: true },
    joiningMonth: { type: Number, required: true, min: 1, max: 12 },

    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
      index: true,
    },
    inactiveSince: { type: Date, default: null },
    inactiveReason: { type: String, trim: true, default: '', maxlength: 200 },

    // --- Compensation & Salary Structure (Phase 2) ---
    salaryConfig: {
      salaryType: {
        type: String,
        enum: ['Monthly', 'Daily'],
        default: 'Monthly',
      },
      baseRate: { type: Number, default: 0, min: 0 },
      standardDailyHours: { type: Number, default: 8, min: 1, max: 24 },
      otMultiplier: {
        type: String,
        enum: ['1x', '1.5x', '2x'],
        default: '1x',
      },
      paymentMode: {
        type: String,
        enum: ['Bank', 'Cash', 'Bank Transfer', 'Cheque'],
        default: 'Bank',
      },
      paidLeavesPerMonth: { type: Number, default: 0, min: 0 },
    },
    salaryHistory: [
      {
        effectiveFrom: { type: Date, required: true },
        previousRate: { type: Number, default: 0 },
        newRate: { type: Number, required: true },
        reason: { type: String, trim: true, default: '' },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        changedAt: { type: Date, default: Date.now },
      },
    ],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

employeeSchema.index({ status: 1, department: 1 });
employeeSchema.index({ name: 1 });

// --- Transparent encryption of sensitive fields -----------------------------
employeeSchema.pre('save', function encryptSensitive(next) {
  if (this.isModified('aadharNo') && this.aadharNo) {
    this.aadharNo = encrypt(this.aadharNo);
  }
  if (this.isModified('bankDetails.accountNo') && this.bankDetails?.accountNo) {
    this.bankDetails.accountNo = encrypt(this.bankDetails.accountNo);
  }
  next();
});

/**
 * Serialise for API responses.
 * @param {boolean} canViewSensitive  true only when the caller holds the permission
 */
employeeSchema.methods.toClientJSON = function toClientJSON(canViewSensitive = false, canViewSalary = true) {
  const doc = this.toObject({ virtuals: true });
  const aadharPlain = this.aadharNo ? decrypt(this.aadharNo) : '';
  const accountPlain = this.bankDetails?.accountNo ? decrypt(this.bankDetails.accountNo) : '';

  return {
    id: doc._id,
    employeeId: doc.employeeId,
    name: doc.name,
    designation: doc.designation,
    fathersName: doc.fathersName,
    mobileNo: doc.mobileNo,
    email: doc.email,
    address: doc.address,
    photoUrl: doc.photoUrl,
    employeeType: doc.employeeType,
    shiftCategory: doc.shiftCategory,
    requiresWorkQty: doc.requiresWorkQty,
    department: doc.department,
    team: doc.team,
    joiningDate: doc.joiningDate,
    joiningYear: doc.joiningYear,
    joiningMonth: doc.joiningMonth,
    status: doc.status,
    inactiveSince: doc.inactiveSince,
    inactiveReason: doc.inactiveReason,
    salaryConfig: doc.salaryConfig
      ? {
          salaryType: doc.salaryConfig.salaryType || 'Monthly',
          baseRate: canViewSalary ? (doc.salaryConfig.baseRate || 0) : null,
          standardDailyHours: doc.salaryConfig.standardDailyHours || 8,
          otMultiplier: doc.salaryConfig.otMultiplier || '1x',
          paymentMode: doc.salaryConfig.paymentMode || 'Cash',
          paidLeavesPerMonth: doc.salaryConfig.paidLeavesPerMonth || 0,
        }
      : {
          salaryType: 'Monthly',
          baseRate: canViewSalary ? 0 : null,
          standardDailyHours: 8,
          otMultiplier: '1x',
          paymentMode: 'Cash',
          paidLeavesPerMonth: 0,
        },
    salaryHistory: canViewSalary ? doc.salaryHistory || [] : [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    sensitive: {
      // Masked for everyone; real values only when the permission is held.
      canView: Boolean(canViewSensitive),
      aadharNo: canViewSensitive ? aadharPlain : maskAadhar(aadharPlain),
      hasAadhar: Boolean(aadharPlain),
      bank: {
        bankName: doc.bankDetails?.bankName || '',
        ifsc: canViewSensitive
          ? doc.bankDetails?.ifsc || ''
          : (doc.bankDetails?.ifsc || '').replace(/^(.{4}).*(.{3})$/, '$1•••••$2'),
        accountNo: canViewSensitive ? accountPlain : maskAccount(accountPlain),
        hasAccount: Boolean(accountPlain),
      },
    },
  };
};

module.exports = mongoose.model('Employee', employeeSchema);
