'use strict';

const mongoose = require('mongoose');

const adjustmentSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['Addition', 'Deduction'], required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const advanceBreakdownSchema = new mongoose.Schema(
  {
    advanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryAdvance', required: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const payrollRecordSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    employeeIdCode: { type: String, default: '' },
    employeeName: { type: String, default: '' },
    department: { type: String, default: '' },
    salaryType: { type: String, enum: ['Monthly', 'Daily'], default: 'Monthly' },
    baseRate: { type: Number, default: 0 },
    dailyRate: { type: Number, default: 0 },
    hourlyRate: { type: Number, default: 0 },
    otMultiplier: { type: Number, default: 1 },

    // Pro-rata flags
    isProRata: { type: Boolean, default: false },
    proRataEligibleDays: { type: Number, default: 0 },
    joiningDate: { type: Date, default: null },

    // Attendance data from DPR
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    paidLeaveDays: { type: Number, default: 0 },
    effectivePaidDays: { type: Number, default: 0 },
    totalWorkedHours: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    isManualOvertime: { type: Boolean, default: false },
    shortTimeHours: { type: Number, default: 0 },

    // Earnings & deductions
    basicEarned: { type: Number, default: 0 },
    overtimePay: { type: Number, default: 0 },
    shortTimeDeduction: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },

    // Adjustments
    adjustments: [adjustmentSchema],
    totalManualAdditions: { type: Number, default: 0 },
    totalManualDeductions: { type: Number, default: 0 },
    totalAdjustments: { type: Number, default: 0 },

    // Advance recovery
    advanceDeductedAmount: { type: Number, default: 0 },
    advanceDeductionBreakdown: [advanceBreakdownSchema],

    // Net Payable Grand Total
    netPayable: { type: Number, required: true, default: 0 },
    paymentStatus: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
    paymentDate: { type: Date, default: null },
    paymentRef: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const monthlyPayrollSchema = new mongoose.Schema(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    workingDaysInMonth: { type: Number, required: true, min: 1, max: 31 },
    status: {
      type: String,
      enum: ['Draft', 'Calculated', 'Approved', 'Paid'],
      default: 'Draft',
      index: true,
    },

    records: [payrollRecordSchema],

    // Company-level aggregates
    totalBasicEarned: { type: Number, default: 0 },
    totalOvertimePay: { type: Number, default: 0 },
    totalShortTimeDeduction: { type: Number, default: 0 },
    totalManualAdditions: { type: Number, default: 0 },
    totalManualDeductions: { type: Number, default: 0 },
    totalAdvanceDeducted: { type: Number, default: 0 },
    companyGrandTotal: { type: Number, default: 0 },

    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    generatedAt: { type: Date, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

monthlyPayrollSchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyPayroll', monthlyPayrollSchema);
