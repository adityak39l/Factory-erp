'use strict';

const mongoose = require('mongoose');

const repaymentSchema = new mongoose.Schema(
  {
    payrollId: { type: mongoose.Schema.Types.ObjectId, ref: 'MonthlyPayroll', default: null },
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    amountDeducted: { type: Number, required: true, min: 0 },
    deductedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const salaryAdvanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee reference is required'],
      index: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Issuer reference is required'],
    },
    issuedDate: {
      type: Date,
      required: [true, 'Advance issue date is required'],
      index: true,
    },
    totalAmount: {
      type: Number,
      required: [true, 'Advance amount is required'],
      min: [1, 'Advance amount must be greater than zero'],
    },
    purpose: {
      type: String,
      trim: true,
      default: '',
      maxlength: 250,
    },
    repaymentType: {
      type: String,
      enum: ['FullNextMonth', 'Installments'],
      default: 'FullNextMonth',
    },
    totalInstallments: {
      type: Number,
      default: 1,
      min: 1,
      max: 24,
    },
    installmentAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    remainingBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['Active', 'Completed', 'Cancelled'],
      default: 'Active',
      index: true,
    },
    repayments: [repaymentSchema],
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: '', maxlength: 250 },
  },
  { timestamps: true }
);

salaryAdvanceSchema.index({ employee: 1, status: 1 });
salaryAdvanceSchema.index({ issuedDate: -1 });

module.exports = mongoose.model('SalaryAdvance', salaryAdvanceSchema);
