'use strict';

const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Team = require('../models/Team');
const DprEntry = require('../models/DprEntry');
const MonthlyPayroll = require('../models/MonthlyPayroll');
const SalaryAdvance = require('../models/SalaryAdvance');
const Settings = require('../models/Settings');
const { buildEmployeeAttendance, getHolidayMap, isWeeklyOff } = require('./attendanceService');
const { monthRange, parseDateOnly, eachDateInRange, formatDateOnly } = require('../utils/dates');
const { round2 } = require('./timeCalculation');
const { recordAudit } = require('./auditService');
const { ApiError } = require('../utils/ApiError');

/**
 * Calculates working days between two dates excluding weekly offs and holidays.
 */
async function countEligibleWorkingDays(from, to, settings, holidayMap) {
  let count = 0;
  eachDateInRange(from, to).forEach((date) => {
    const key = formatDateOnly(date);
    const holiday = holidayMap.get(key);
    const weeklyOff = isWeeklyOff(date, settings);
    if (!holiday && !weeklyOff) count += 1;
  });
  return count;
}

/**
 * Helper to compute single employee payroll metrics for a given month.
 */
async function computeEmployeeMetrics(emp, { start, end, workingDaysInMonth, settings, holidayMap, entries }) {
  const { summary } = await buildEmployeeAttendance({
    employee: emp,
    from: start,
    to: end,
    entries,
  });

  const joiningDate = emp.joiningDate ? parseDateOnly(emp.joiningDate) : null;
  const isProRata = Boolean(joiningDate && joiningDate >= start && joiningDate <= end);
  let proRataEligibleDays = workingDaysInMonth;

  if (isProRata && joiningDate) {
    proRataEligibleDays = await countEligibleWorkingDays(joiningDate, end, settings, holidayMap);
  }

  // Resolve base rate as of month end from salaryHistory (if any), fallback to current salaryConfig
  let effectiveBaseRate = emp.salaryConfig?.baseRate || 0;
  if (Array.isArray(emp.salaryHistory) && emp.salaryHistory.length > 0) {
    const sorted = [...emp.salaryHistory].sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
    const effectiveEntry = sorted.find((h) => parseDateOnly(h.effectiveFrom) <= end);
    if (effectiveEntry && typeof effectiveEntry.newRate === 'number') {
      effectiveBaseRate = effectiveEntry.newRate;
    }
  }

  const salaryType = emp.salaryConfig?.salaryType || 'Monthly';
  const standardDailyHours = emp.salaryConfig?.standardDailyHours || 8;
  const multiplierStr = emp.salaryConfig?.otMultiplier || '1x';
  const otMultiplier = multiplierStr === '2x' ? 2 : multiplierStr === '1.5x' ? 1.5 : 1;
  const paidLeavesPerMonth = emp.salaryConfig?.paidLeavesPerMonth || 0;

  // Daily rate and hourly rate
  const dailyRate = salaryType === 'Monthly'
    ? (workingDaysInMonth > 0 ? round2(effectiveBaseRate / workingDaysInMonth) : 0)
    : effectiveBaseRate;

  const hourlyRate = standardDailyHours > 0 ? round2(dailyRate / standardDailyHours) : 0;

  // Attendance metrics
  const presentDays = summary.presentDays || 0;
  const absentDays = summary.absentDays || 0;
  const paidLeaveDays = Math.min(absentDays, paidLeavesPerMonth);
  const maxPossibleDays = isProRata ? proRataEligibleDays : workingDaysInMonth;
  const effectivePaidDays = Math.min(presentDays + paidLeaveDays, maxPossibleDays);

  const basicEarned = round2(dailyRate * effectivePaidDays);
  const overtimeHours = round2(summary.totalOvertime || 0);
  const overtimePay = round2(overtimeHours * hourlyRate * otMultiplier);
  const shortTimeHours = round2(summary.totalShortTime || 0);
  const shortTimeDeduction = round2(shortTimeHours * hourlyRate);

  const grossSalary = round2(basicEarned + overtimePay - shortTimeDeduction);

  // Active advance deductions
  const activeAdvances = await SalaryAdvance.find({ employee: emp._id, status: 'Active' });
  let advanceDeductedAmount = 0;
  const advanceDeductionBreakdown = [];

  activeAdvances.forEach((adv) => {
    const deduction = Math.min(adv.installmentAmount, adv.remainingBalance);
    if (deduction > 0) {
      advanceDeductedAmount += deduction;
      advanceDeductionBreakdown.push({
        advanceId: adv._id,
        amount: round2(deduction),
      });
    }
  });

  advanceDeductedAmount = round2(advanceDeductedAmount);
  const netPayable = Math.max(0, round2(grossSalary - advanceDeductedAmount));

  return {
    employee: emp._id,
    employeeIdCode: emp.employeeId,
    employeeName: emp.name,
    department: emp.department?.name || '',
    salaryType,
    baseRate: effectiveBaseRate,
    dailyRate,
    hourlyRate,
    otMultiplier,
    isProRata,
    proRataEligibleDays,
    joiningDate: isProRata ? emp.joiningDate : null,
    presentDays,
    absentDays,
    paidLeaveDays,
    effectivePaidDays,
    totalWorkedHours: round2(summary.totalHours || 0),
    overtimeHours,
    shortTimeHours,
    basicEarned,
    overtimePay,
    shortTimeDeduction,
    grossSalary,
    adjustments: [],
    totalManualAdditions: 0,
    totalManualDeductions: 0,
    totalAdjustments: 0,
    advanceDeductedAmount,
    advanceDeductionBreakdown,
    netPayable,
    paymentStatus: 'Pending',
  };
}

/**
 * Recalculates totals across all records in a payroll document.
 */
function recalculatePayrollTotals(payroll) {
  let totalBasicEarned = 0;
  let totalOvertimePay = 0;
  let totalShortTimeDeduction = 0;
  let totalManualAdditions = 0;
  let totalManualDeductions = 0;
  let totalAdvanceDeducted = 0;
  let companyGrandTotal = 0;

  payroll.records.forEach((rec) => {
    let additions = 0;
    let deductions = 0;
    (rec.adjustments || []).forEach((adj) => {
      if (adj.type === 'Addition') additions += adj.amount;
      if (adj.type === 'Deduction') deductions += adj.amount;
    });

    rec.totalManualAdditions = round2(additions);
    rec.totalManualDeductions = round2(deductions);
    rec.totalAdjustments = round2(additions - deductions);

    rec.netPayable = Math.max(
      0,
      round2(rec.grossSalary + rec.totalAdjustments - (rec.advanceDeductedAmount || 0))
    );

    totalBasicEarned += rec.basicEarned || 0;
    totalOvertimePay += rec.overtimePay || 0;
    totalShortTimeDeduction += rec.shortTimeDeduction || 0;
    totalManualAdditions += rec.totalManualAdditions || 0;
    totalManualDeductions += rec.totalManualDeductions || 0;
    totalAdvanceDeducted += rec.advanceDeductedAmount || 0;
    companyGrandTotal += rec.netPayable || 0;
  });

  payroll.totalBasicEarned = round2(totalBasicEarned);
  payroll.totalOvertimePay = round2(totalOvertimePay);
  payroll.totalShortTimeDeduction = round2(totalShortTimeDeduction);
  payroll.totalManualAdditions = round2(totalManualAdditions);
  payroll.totalManualDeductions = round2(totalManualDeductions);
  payroll.totalAdvanceDeducted = round2(totalAdvanceDeducted);
  payroll.companyGrandTotal = round2(companyGrandTotal);
}

/**
 * Ingests DPR data and generates or recalculates a monthly payroll.
 */
async function calculateMonthlyPayroll(month, year, workingDaysInMonth, user = null) {
  const m = Number(month);
  const y = Number(year);
  const wDays = Number(workingDaysInMonth);

  if (!m || m < 1 || m > 12) throw ApiError.badRequest('Valid month (1-12) is required');
  if (!y || y < 2020 || y > 2100) throw ApiError.badRequest('Valid 4-digit year is required');
  if (!wDays || wDays < 1 || wDays > 31) {
    throw ApiError.badRequest('Working days in month must be between 1 and 31');
  }

  let payroll = await MonthlyPayroll.findOne({ month: m, year: y });
  if (payroll && (payroll.status === 'Approved' || payroll.status === 'Paid')) {
    throw ApiError.forbidden(`Payroll for ${m}/${y} is ${payroll.status} and locked from recalculation.`);
  }

  const { start, end } = monthRange(y, m);
  const [employees, settings, holidayMap, allEntries] = await Promise.all([
    Employee.find({ status: 'Active' }).populate('department', 'name').sort({ name: 1 }),
    Settings.getSettings(),
    getHolidayMap(start, end),
    DprEntry.find({ date: { $gte: start, $lte: end } }).lean(),
  ]);

  const entriesByEmployee = new Map();
  allEntries.forEach((entry) => {
    const empIdStr = String(entry.employee);
    if (!entriesByEmployee.has(empIdStr)) entriesByEmployee.set(empIdStr, []);
    entriesByEmployee.get(empIdStr).push(entry);
  });

  const records = [];
  for (const emp of employees) {
    const empEntries = entriesByEmployee.get(String(emp._id)) || [];
    const rec = await computeEmployeeMetrics(emp, {
      start,
      end,
      workingDaysInMonth: wDays,
      settings,
      holidayMap,
      entries: empEntries,
    });
    records.push(rec);
  }

  if (!payroll) {
    payroll = new MonthlyPayroll({
      month: m,
      year: y,
      workingDaysInMonth: wDays,
      status: 'Calculated',
      records,
      generatedBy: user?._id || null,
      generatedAt: new Date(),
    });
  } else {
    // Preserve manual adjustments & manual overtime if existing
    const existingAdjustmentsMap = new Map();
    const existingOvertimeMap = new Map();
    payroll.records.forEach((r) => {
      if (r.adjustments && r.adjustments.length > 0) {
        existingAdjustmentsMap.set(String(r.employee), r.adjustments);
      }
      if (r.isManualOvertime) {
        existingOvertimeMap.set(String(r.employee), r.overtimeHours);
      }
    });

    records.forEach((r) => {
      const existingAdj = existingAdjustmentsMap.get(String(r.employee));
      if (existingAdj) r.adjustments = existingAdj;
      const manualOtHours = existingOvertimeMap.get(String(r.employee));
      if (manualOtHours !== undefined) {
        r.isManualOvertime = true;
        r.overtimeHours = manualOtHours;
        r.overtimePay = round2(manualOtHours * r.hourlyRate * r.otMultiplier);
        r.grossSalary = round2(r.basicEarned + r.overtimePay - r.shortTimeDeduction);
      }
    });

    payroll.workingDaysInMonth = wDays;
    payroll.status = 'Calculated';
    payroll.records = records;
    payroll.generatedBy = user?._id || payroll.generatedBy;
    payroll.generatedAt = new Date();
  }

  recalculatePayrollTotals(payroll);
  await payroll.save();

  await recordAudit({
    user,
    action: 'PAYROLL_CALCULATED',
    entity: 'MonthlyPayroll',
    entityId: payroll._id,
    entityLabel: `${m}/${y} Payroll`,
    note: `Calculated payroll for ${records.length} employees. Grand total: ₹${payroll.companyGrandTotal}`,
  });

  return payroll;
}

/**
 * Live preview calculation for a single employee (pure read, no database save).
 */
async function calculateEmployeePreview(employeeId, month, year, workingDaysInMonth = 26) {
  const m = Number(month);
  const y = Number(year);
  const wDays = Number(workingDaysInMonth) || 26;

  const existingPayroll = await MonthlyPayroll.findOne({ month: m, year: y }).lean();
  if (existingPayroll) {
    const rec = existingPayroll.records.find((r) => String(r.employee) === String(employeeId));
    if (rec) {
      return {
        isFinalized: existingPayroll.status === 'Approved' || existingPayroll.status === 'Paid',
        payrollStatus: existingPayroll.status,
        workingDaysInMonth: existingPayroll.workingDaysInMonth,
        record: rec,
      };
    }
  }

  const emp = await Employee.findById(employeeId).populate('department', 'name');
  if (!emp) throw ApiError.notFound('Employee not found');

  const { start, end } = monthRange(y, m);
  const [settings, holidayMap, entries] = await Promise.all([
    Settings.getSettings(),
    getHolidayMap(start, end),
    DprEntry.find({ employee: emp._id, date: { $gte: start, $lte: end } }).lean(),
  ]);

  const rec = await computeEmployeeMetrics(emp, {
    start,
    end,
    workingDaysInMonth: wDays,
    settings,
    holidayMap,
    entries,
  });

  return {
    isFinalized: false,
    payrollStatus: 'Live Preview',
    workingDaysInMonth: wDays,
    record: rec,
  };
}

/**
 * Approves a calculated payroll and commits advance deductions atomically.
 */
async function approvePayroll(payrollId, user = null) {
  const payroll = await MonthlyPayroll.findById(payrollId);
  if (!payroll) throw ApiError.notFound('Payroll not found');

  if (payroll.status === 'Approved' || payroll.status === 'Paid') {
    throw ApiError.badRequest(`Payroll is already ${payroll.status}`);
  }

  // Commit advance repayments
  for (const record of payroll.records) {
    for (const item of record.advanceDeductionBreakdown || []) {
      const advance = await SalaryAdvance.findById(item.advanceId);
      if (advance && advance.status === 'Active') {
        const actualDeduct = Math.min(item.amount, advance.remainingBalance);
        advance.remainingBalance = round2(Math.max(0, advance.remainingBalance - actualDeduct));
        advance.repayments.push({
          payrollId: payroll._id,
          month: payroll.month,
          year: payroll.year,
          amountDeducted: actualDeduct,
          deductedAt: new Date(),
        });
        if (advance.remainingBalance <= 0) {
          advance.status = 'Completed';
        }
        await advance.save();
      }
    }
  }

  payroll.status = 'Approved';
  payroll.approvedBy = user?._id || null;
  payroll.approvedAt = new Date();
  await payroll.save();

  await recordAudit({
    user,
    action: 'PAYROLL_APPROVED',
    entity: 'MonthlyPayroll',
    entityId: payroll._id,
    entityLabel: `${payroll.month}/${payroll.year} Payroll`,
    note: `Approved payroll. Payout: ₹${payroll.companyGrandTotal}`,
  });

  return payroll;
}

/**
 * Marks payroll as Paid and sets lockedAt, rendering it permanently immutable.
 */
async function markPayrollPaid(payrollId, user = null) {
  const payroll = await MonthlyPayroll.findById(payrollId);
  if (!payroll) throw ApiError.notFound('Payroll not found');

  if (payroll.status !== 'Approved') {
    throw ApiError.badRequest('Payroll must be Approved before marking as Paid');
  }

  payroll.status = 'Paid';
  payroll.lockedAt = new Date();
  const paymentDate = new Date();

  payroll.records.forEach((rec) => {
    rec.paymentStatus = 'Paid';
    rec.paymentDate = paymentDate;
  });

  await payroll.save();

  await recordAudit({
    user,
    action: 'PAYROLL_PAID',
    entity: 'MonthlyPayroll',
    entityId: payroll._id,
    entityLabel: `${payroll.month}/${payroll.year} Payroll`,
    note: `Paid payroll for ${payroll.month}/${payroll.year}. Locked permanently.`,
  });

  return payroll;
}

/**
 * Adds an adjustment (bonus/penalty) to an employee in a Draft or Calculated payroll.
 */
async function addAdjustment(payrollId, employeeId, { label, amount, type }, user = null) {
  const payroll = await MonthlyPayroll.findById(payrollId);
  if (!payroll) throw ApiError.notFound('Payroll not found');

  if (payroll.status === 'Approved' || payroll.status === 'Paid') {
    throw ApiError.forbidden('Adjustments cannot be added to an Approved or Paid payroll');
  }

  const record = payroll.records.find((r) => String(r.employee) === String(employeeId));
  if (!record) throw ApiError.notFound('Employee record not found in this payroll');

  const adjAmount = Number(amount);
  if (isNaN(adjAmount) || adjAmount <= 0) {
    throw ApiError.badRequest('Adjustment amount must be a positive number');
  }

  record.adjustments.push({
    label: String(label || 'Adjustment').trim(),
    amount: adjAmount,
    type: type === 'Deduction' ? 'Deduction' : 'Addition',
    addedBy: user?._id || null,
    addedAt: new Date(),
  });

  recalculatePayrollTotals(payroll);
  await payroll.save();

  await recordAudit({
    user,
    action: 'PAYROLL_ADJUSTMENT_ADDED',
    entity: 'MonthlyPayroll',
    entityId: payroll._id,
    entityLabel: `${payroll.month}/${payroll.year} Payroll`,
    note: `Added ${type} of ₹${adjAmount} (${label}) for employee ${record.employeeName}`,
  });

  return payroll;
}

/**
 * Removes an adjustment from an employee record.
 */
async function removeAdjustment(payrollId, employeeId, adjustmentId, user = null) {
  const payroll = await MonthlyPayroll.findById(payrollId);
  if (!payroll) throw ApiError.notFound('Payroll not found');

  if (payroll.status === 'Approved' || payroll.status === 'Paid') {
    throw ApiError.forbidden('Adjustments cannot be modified in an Approved or Paid payroll');
  }

  const record = payroll.records.find((r) => String(r.employee) === String(employeeId));
  if (!record) throw ApiError.notFound('Employee record not found in this payroll');

  record.adjustments = record.adjustments.filter((a) => String(a._id) !== String(adjustmentId));

  recalculatePayrollTotals(payroll);
  await payroll.save();

  return payroll;
}

/**
 * Updates overtime hours manually for a single employee in a payroll document.
 */
async function updateEmployeeOvertime(payrollId, employeeId, manualOvertimeHours, user = null) {
  const payroll = await MonthlyPayroll.findById(payrollId);
  if (!payroll) throw ApiError.notFound('Payroll not found');
  if (payroll.status === 'Approved' || payroll.status === 'Paid') {
    throw ApiError.forbidden(`Cannot modify overtime in a ${payroll.status} payroll.`);
  }

  const rec = payroll.records.find(
    (r) => String(r.employee) === String(employeeId) || String(r._id) === String(employeeId)
  );
  if (!rec) throw ApiError.notFound('Employee record not found in payroll');

  const otHours = Math.max(0, round2(Number(manualOvertimeHours) || 0));
  rec.overtimeHours = otHours;
  rec.overtimePay = round2(otHours * rec.hourlyRate * rec.otMultiplier);
  rec.grossSalary = round2(rec.basicEarned + rec.overtimePay - (rec.shortTimeDeduction || 0));
  rec.isManualOvertime = true;

  recalculatePayrollTotals(payroll);
  await payroll.save();

  await recordAudit({
    user,
    action: 'PAYROLL_ADJUSTMENT_ADDED',
    entity: 'MonthlyPayroll',
    entityId: payroll._id,
    entityLabel: `${rec.employeeName} — Manual OT: ${otHours}h (₹${rec.overtimePay})`,
    after: {
      employeeId: rec.employee,
      overtimeHours: otHours,
      overtimePay: rec.overtimePay,
      companyGrandTotal: payroll.companyGrandTotal,
    },
  });

  return payroll;
}

/**
 * Automatically ensures all current active employees are included in a draft/calculated payroll.
 */
async function syncActiveEmployeesToPayroll(payroll, user = null) {
  if (!payroll || payroll.status === 'Approved' || payroll.status === 'Paid') {
    return payroll;
  }

  const { start, end } = monthRange(payroll.year, payroll.month);
  const activeEmployees = await Employee.find({
    status: 'Active',
    joiningDate: { $lte: end },
  }).populate('department', 'name').sort({ name: 1 });

  const existingEmpIds = new Set(payroll.records.map((r) => String(r.employee)));
  const missing = activeEmployees.filter((e) => !existingEmpIds.has(String(e._id)));

  if (missing.length === 0) return payroll;

  const settings = await Settings.getSettings();
  const holidayMap = await getHolidayMap(start, end);
  const missingEntries = await DprEntry.find({
    employee: { $in: missing.map((e) => e._id) },
    date: { $gte: start, $lte: end },
  }).lean();

  const entriesByEmployee = new Map();
  missingEntries.forEach((entry) => {
    const empIdStr = String(entry.employee);
    if (!entriesByEmployee.has(empIdStr)) entriesByEmployee.set(empIdStr, []);
    entriesByEmployee.get(empIdStr).push(entry);
  });

  for (const emp of missing) {
    const empEntries = entriesByEmployee.get(String(emp._id)) || [];
    const rec = await computeEmployeeMetrics(emp, {
      start,
      end,
      workingDaysInMonth: payroll.workingDaysInMonth || 26,
      settings,
      holidayMap,
      entries: empEntries,
    });
    payroll.records.push(rec);
  }

  recalculatePayrollTotals(payroll);
  await payroll.save();
  return payroll;
}

module.exports = {
  calculateMonthlyPayroll,
  calculateEmployeePreview,
  approvePayroll,
  markPayrollPaid,
  addAdjustment,
  removeAdjustment,
  updateEmployeeOvertime,
  syncActiveEmployeesToPayroll,
  recalculatePayrollTotals,
};
