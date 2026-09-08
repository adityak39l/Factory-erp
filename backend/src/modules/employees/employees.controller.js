'use strict';

const Employee = require('../../models/Employee');
const Department = require('../../models/Department');
const Team = require('../../models/Team');
const DprEntry = require('../../models/DprEntry');
const SalaryAdvance = require('../../models/SalaryAdvance');
const MonthlyPayroll = require('../../models/MonthlyPayroll');
const { ApiError, asyncHandler } = require('../../utils/ApiError');
const { recordAudit } = require('../../services/auditService');
const { generateEmployeeId } = require('../../services/employeeIdService');
const { can } = require('../../middleware/permissions');
const { parseDateOnly, formatDateOnly, monthRange } = require('../../utils/dates');
const { buildEmployeeAttendance } = require('../../services/attendanceService');
const { calculateEmployeePreview } = require('../../services/payrollService');

const SENSITIVE_SELECT = '+aadharNo +bankDetails.accountNo';

/** Shared shape for list responses. */
function toListItem(employee, canViewSensitive, canViewSalary = true) {
  const json = employee.toClientJSON(canViewSensitive, canViewSalary);
  return json;
}

async function resolveDepartmentAndTeam(departmentId, teamId) {
  const department = await Department.findById(departmentId);
  if (!department) throw ApiError.badRequest('Selected department does not exist');
  if (!department.isActive) throw ApiError.badRequest('That department is archived');

  let team = null;
  if (teamId) {
    team = await Team.findById(teamId);
    if (!team) throw ApiError.badRequest('Selected team does not exist');
    if (String(team.department) !== String(department._id)) {
      throw ApiError.badRequest(`That team does not belong to ${department.name}`);
    }
    if (!department.hasTeams) {
      throw ApiError.badRequest(`${department.name} does not use teams`);
    }
  }
  return { department, team };
}

/** GET /api/employees */
const listEmployees = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 25,
    search = '',
    status = 'Active',
    department,
    team,
    employeeType,
    shiftCategory,
  } = req.query;

  const filter = {};
  if (status && status !== 'All') filter.status = status;
  if (department) filter.department = department;
  if (team) filter.team = team;
  if (employeeType) filter.employeeType = employeeType;
  if (shiftCategory) filter.shiftCategory = shiftCategory;

  if (search) {
    const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { employeeId: rx }, { mobileNo: rx }, { designation: rx }];
  }

  const pageNum = Math.max(1, Number(page));
  const perPage = Math.min(200, Math.max(1, Number(limit)));

  const [total, employees] = await Promise.all([
    Employee.countDocuments(filter),
    Employee.find(filter)
      .select(SENSITIVE_SELECT)
      .populate('department', 'name isHelperPool hasTeams')
      .populate('team', 'name')
      .sort({ name: 1 })
      .skip((pageNum - 1) * perPage)
      .limit(perPage),
  ]);

  const canView = can(req, 'canViewSensitive');
  const canViewSal = can(req, 'canViewSalary') || can(req, 'canManagePayroll');

  res.json({
    success: true,
    employees: employees.map((e) => toListItem(e, canView, canViewSal)),
    pagination: {
      page: pageNum,
      limit: perPage,
      total,
      pages: Math.ceil(total / perPage) || 1,
    },
  });
});

/** GET /api/employees/search?q= — lightweight lookup for the DPR entry screen (Active only) */
const searchEmployees = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const filter = { status: 'Active' };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { employeeId: rx }];
  }

  const employees = await Employee.find(filter)
    .populate('department', 'name isHelperPool')
    .populate('team', 'name')
    .sort({ name: 1 })
    .limit(30)
    .lean();

  res.json({
    success: true,
    employees: employees.map((e) => ({
      id: e._id,
      employeeId: e.employeeId,
      name: e.name,
      designation: e.designation,
      employeeType: e.employeeType,
      shiftCategory: e.shiftCategory,
      requiresWorkQty: e.requiresWorkQty,
      department: e.department ? { id: e.department._id, name: e.department.name, isHelperPool: e.department.isHelperPool } : null,
      team: e.team ? { id: e.team._id, name: e.team.name } : null,
    })),
  });
});

/** GET /api/employees/:id */
const getEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
    .select(SENSITIVE_SELECT)
    .populate('department', 'name isHelperPool hasTeams')
    .populate('team', 'name');
  if (!employee) throw ApiError.notFound('Employee not found');

  const canViewSal = can(req, 'canViewSalary') || can(req, 'canManagePayroll');
  res.json({
    success: true,
    employee: employee.toClientJSON(can(req, 'canViewSensitive'), canViewSal),
  });
});

/**
 * GET /api/employees/:id/attendance?year=&month=
 * Full monthly history — the "show me Amit's July" requirement, split Day/Night.
 */
const getEmployeeAttendance = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id).populate('department', 'name');
  if (!employee) throw ApiError.notFound('Employee not found');

  const now = new Date();
  const year = Number(req.query.year) || now.getUTCFullYear();
  const month = Number(req.query.month) || now.getUTCMonth() + 1;
  if (month < 1 || month > 12) throw ApiError.badRequest('Month must be between 1 and 12');

  const { start, end } = monthRange(year, month);
  const entries = await DprEntry.find({ employee: employee._id, date: { $gte: start, $lte: end } })
    .sort({ date: 1 })
    .lean();

  const { days, summary } = await buildEmployeeAttendance({
    employee,
    from: start,
    to: end,
    entries,
  });

  res.json({
    success: true,
    employee: {
      id: employee._id,
      employeeId: employee.employeeId,
      name: employee.name,
      designation: employee.designation,
      employeeType: employee.employeeType,
      shiftCategory: employee.shiftCategory,
      department: employee.department?.name || '',
      status: employee.status,
    },
    period: { year, month, from: formatDateOnly(start), to: formatDateOnly(end) },
    days,
    summary,
  });
});

/** POST /api/employees */
const createEmployee = asyncHandler(async (req, res) => {
  const body = req.body;
  const { department, team } = await resolveDepartmentAndTeam(body.department, body.team);

  const joiningDate = parseDateOnly(body.joiningDate);
  if (!joiningDate) throw ApiError.badRequest('Invalid joining date');

  // Employee ID: YYMM (admin-selectable) + random 3 digits, unique inside that bucket.
  const year = body.joiningYear || joiningDate.getUTCFullYear();
  const month = body.joiningMonth || joiningDate.getUTCMonth() + 1;
  const prefix = `${String(year % 100).padStart(2, '0')}${String(month).padStart(2, '0')}`;
  const taken = await Employee.find({ employeeId: new RegExp(`^${prefix}`) })
    .select('employeeId')
    .lean();
  const employeeId = generateEmployeeId(year, month, taken.map((t) => t.employeeId));

  const employee = new Employee({
    employeeId,
    name: body.name,
    designation: body.designation || '',
    fathersName: body.fathersName || '',
    mobileNo: body.mobileNo || '',
    email: body.email || '',
    address: body.address || '',
    photoUrl: body.photoUrl || '',
    aadharNo: body.aadharNo || '',
    bankDetails: {
      bankName: body.bankName || '',
      accountNo: body.accountNo || '',
      ifsc: body.ifsc || '',
    },
    employeeType: body.employeeType || 'Permanent',
    // Contract workers do not follow fixed factory shifts.
    shiftCategory:
      (body.employeeType || 'Permanent') === 'Contract'
        ? 'Not Applicable'
        : body.shiftCategory || 'Day',
    requiresWorkQty:
      body.requiresWorkQty !== undefined
        ? body.requiresWorkQty
        : department.requiresWorkQtyByDefault,
    department: department._id,
    team: team ? team._id : null,
    joiningDate,
    joiningYear: year,
    joiningMonth: month,
    salaryConfig: {
      salaryType: body.salaryType || body.salaryConfig?.salaryType || 'Monthly',
      baseRate: Number(body.baseRate ?? body.salaryConfig?.baseRate ?? 0),
      standardDailyHours: Number(body.standardDailyHours ?? body.salaryConfig?.standardDailyHours ?? 8),
      otMultiplier: body.otMultiplier || body.salaryConfig?.otMultiplier || '1x',
      paymentMode: body.paymentMode || body.salaryConfig?.paymentMode || 'Cash',
      paidLeavesPerMonth: Number(body.paidLeavesPerMonth ?? body.salaryConfig?.paidLeavesPerMonth ?? 0),
    },
    salaryHistory:
      Number(body.baseRate ?? body.salaryConfig?.baseRate ?? 0) > 0
        ? [
            {
              effectiveFrom: joiningDate,
              previousRate: 0,
              newRate: Number(body.baseRate ?? body.salaryConfig?.baseRate ?? 0),
              reason: 'Initial joining rate',
              changedBy: req.user._id,
              changedAt: new Date(),
            },
          ]
        : [],
    status: 'Active',
    createdBy: req.user._id,
  });

  await employee.save();

  await recordAudit({
    req,
    action: 'CREATE',
    entity: 'Employee',
    entityId: employee._id,
    entityLabel: `${employee.employeeId} — ${employee.name}`,
    after: {
      employeeId: employee.employeeId,
      name: employee.name,
      department: department.name,
      employeeType: employee.employeeType,
      baseRate: employee.salaryConfig?.baseRate || 0,
    },
  });

  const saved = await Employee.findById(employee._id)
    .select(SENSITIVE_SELECT)
    .populate('department', 'name isHelperPool hasTeams')
    .populate('team', 'name');

  const canViewSal = can(req, 'canViewSalary') || can(req, 'canManagePayroll');
  res.status(201).json({ success: true, employee: saved.toClientJSON(can(req, 'canViewSensitive'), canViewSal) });
});

/** PUT /api/employees/:id */
const updateEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id).select(SENSITIVE_SELECT);
  if (!employee) throw ApiError.notFound('Employee not found');

  const body = req.body;
  const before = {
    name: employee.name,
    department: String(employee.department),
    team: employee.team ? String(employee.team) : null,
    employeeType: employee.employeeType,
    shiftCategory: employee.shiftCategory,
    requiresWorkQty: employee.requiresWorkQty,
  };

  // Department / team reassignment needs its own permission.
  const changingAssignment =
    (body.department && String(body.department) !== String(employee.department)) ||
    (body.team !== undefined && String(body.team || '') !== String(employee.team || ''));

  if (changingAssignment && !can(req, 'canAssignDepartment')) {
    throw ApiError.forbidden('You do not have permission to change department or team assignment');
  }

  if (body.department || body.team !== undefined) {
    const { department, team } = await resolveDepartmentAndTeam(
      body.department || employee.department,
      body.team
    );
    employee.department = department._id;
    employee.team = team ? team._id : null;
  }

  const simpleFields = [
    'name',
    'designation',
    'fathersName',
    'mobileNo',
    'email',
    'address',
    'photoUrl',
    'requiresWorkQty',
  ];
  simpleFields.forEach((field) => {
    if (body[field] !== undefined) employee[field] = body[field];
  });

  if (body.employeeType) {
    employee.employeeType = body.employeeType;
    if (body.employeeType === 'Contract') employee.shiftCategory = 'Not Applicable';
    else if (employee.shiftCategory === 'Not Applicable') employee.shiftCategory = 'Day';
  }
  if (body.shiftCategory && employee.employeeType !== 'Contract') {
    employee.shiftCategory = body.shiftCategory;
  }

  if (body.joiningDate) {
    const joiningDate = parseDateOnly(body.joiningDate);
    if (!joiningDate) throw ApiError.badRequest('Invalid joining date');
    employee.joiningDate = joiningDate;
  }

  // Sensitive fields require the sensitive-data permission to modify.
  const touchingSensitive =
    body.aadharNo !== undefined || body.accountNo !== undefined || body.ifsc !== undefined;
  if (touchingSensitive && !can(req, 'canViewSensitive')) {
    throw ApiError.forbidden('You do not have permission to modify Aadhar or bank details');
  }
  if (body.aadharNo !== undefined) employee.aadharNo = body.aadharNo;
  if (body.bankName !== undefined) employee.bankDetails.bankName = body.bankName;
  if (body.accountNo !== undefined) employee.bankDetails.accountNo = body.accountNo;
  if (body.ifsc !== undefined) employee.bankDetails.ifsc = body.ifsc;

  // Compensation / Salary Config updates
  if (body.salaryConfig || body.baseRate !== undefined || body.salaryType !== undefined) {
    const sc = employee.salaryConfig || {};
    const newRate = body.baseRate !== undefined
      ? Number(body.baseRate)
      : (body.salaryConfig?.baseRate !== undefined ? Number(body.salaryConfig.baseRate) : sc.baseRate);

    if (newRate !== undefined && newRate !== sc.baseRate && can(req, 'canManagePayroll')) {
      employee.salaryHistory.push({
        effectiveFrom: parseDateOnly(body.effectiveFrom) || new Date(),
        previousRate: sc.baseRate || 0,
        newRate,
        reason: String(body.rateChangeReason || body.salaryReason || 'Rate updated').trim(),
        changedBy: req.user._id,
        changedAt: new Date(),
      });
      sc.baseRate = newRate;
    }

    if (body.salaryType || body.salaryConfig?.salaryType) sc.salaryType = body.salaryType || body.salaryConfig?.salaryType;
    if (body.otMultiplier || body.salaryConfig?.otMultiplier) sc.otMultiplier = body.otMultiplier || body.salaryConfig?.otMultiplier;
    if (body.paymentMode || body.salaryConfig?.paymentMode) sc.paymentMode = body.paymentMode || body.salaryConfig?.paymentMode;
    if (body.standardDailyHours !== undefined || body.salaryConfig?.standardDailyHours !== undefined) {
      sc.standardDailyHours = Number(body.standardDailyHours ?? body.salaryConfig?.standardDailyHours);
    }
    if (body.paidLeavesPerMonth !== undefined || body.salaryConfig?.paidLeavesPerMonth !== undefined) {
      sc.paidLeavesPerMonth = Number(body.paidLeavesPerMonth ?? body.salaryConfig?.paidLeavesPerMonth);
    }
    employee.salaryConfig = sc;
  }

  employee.updatedBy = req.user._id;
  await employee.save();

  await recordAudit({
    req,
    action: 'UPDATE',
    entity: 'Employee',
    entityId: employee._id,
    entityLabel: `${employee.employeeId} — ${employee.name}`,
    before,
    after: {
      name: employee.name,
      department: String(employee.department),
      team: employee.team ? String(employee.team) : null,
      employeeType: employee.employeeType,
      shiftCategory: employee.shiftCategory,
      requiresWorkQty: employee.requiresWorkQty,
    },
  });

  const saved = await Employee.findById(employee._id)
    .select(SENSITIVE_SELECT)
    .populate('department', 'name isHelperPool hasTeams')
    .populate('team', 'name');

  const canViewSal = can(req, 'canViewSalary') || can(req, 'canManagePayroll');
  res.json({ success: true, employee: saved.toClientJSON(can(req, 'canViewSensitive'), canViewSal) });
});

/**
 * PATCH /api/employees/:id/status
 * Active <-> Inactive. Inactive employees vanish from every live screen and stop
 * generating absence, but their entire history is preserved and reactivation is
 * always possible. Nothing is ever deleted.
 */
const setEmployeeStatus = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id).select(SENSITIVE_SELECT);
  if (!employee) throw ApiError.notFound('Employee not found');

  const { status, reason, effectiveDate } = req.body;
  const before = { status: employee.status, inactiveSince: employee.inactiveSince };

  employee.status = status;
  if (status === 'Inactive') {
    employee.inactiveSince = parseDateOnly(effectiveDate) || parseDateOnly(new Date());
    employee.inactiveReason = reason || '';
  } else {
    employee.inactiveSince = null;
    employee.inactiveReason = '';
  }
  employee.updatedBy = req.user._id;
  await employee.save();

  await recordAudit({
    req,
    action: 'STATUS_CHANGE',
    entity: 'Employee',
    entityId: employee._id,
    entityLabel: `${employee.employeeId} — ${employee.name}`,
    before,
    after: { status: employee.status, inactiveSince: employee.inactiveSince },
    note:
      status === 'Inactive'
        ? 'Marked Inactive — hidden from live screens, history preserved'
        : 'Reactivated',
  });

  const canViewSal = can(req, 'canViewSalary') || can(req, 'canManagePayroll');
  res.json({ success: true, employee: employee.toClientJSON(can(req, 'canViewSensitive'), canViewSal) });
});

/**
 * GET /api/employees/:id/salary-preview?month=&year=&workingDaysInMonth=
 */
const getSalaryPreview = asyncHandler(async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getUTCFullYear();
  const month = Number(req.query.month) || now.getUTCMonth() + 1;
  const workingDays = Number(req.query.workingDaysInMonth) || 26;

  const preview = await calculateEmployeePreview(req.params.id, month, year, workingDays);
  res.json({ success: true, preview });
});

/**
 * GET /api/employees/:id/financial-calendar?month=&year=
 */
const getFinancialCalendar = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) throw ApiError.notFound('Employee not found');

  const now = new Date();
  const year = Number(req.query.year) || now.getUTCFullYear();
  const month = Number(req.query.month) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month);

  const [advances, entries, payroll] = await Promise.all([
    SalaryAdvance.find({
      employee: employee._id,
      $or: [
        { issuedDate: { $gte: start, $lte: end } },
        { 'repayments.deductedAt': { $gte: start, $lte: end } },
      ],
    }).lean(),
    DprEntry.find({
      employee: employee._id,
      date: { $gte: start, $lte: end },
    }).lean(),
    MonthlyPayroll.findOne({
      month,
      year,
      status: 'Paid',
    }).lean(),
  ]);

  const events = [];

  // 1. Advances Issued (RED)
  advances.forEach((adv) => {
    if (adv.issuedDate >= start && adv.issuedDate <= end) {
      events.push({
        date: formatDateOnly(adv.issuedDate),
        type: 'ADVANCE_ISSUED',
        amount: adv.totalAmount,
        label: `Advance ₹${adv.totalAmount.toLocaleString('en-IN')} issued (${adv.purpose || 'Personal'})`,
      });
    }

    // 2. Advance EMI Deducted (YELLOW)
    (adv.repayments || []).forEach((rep) => {
      if (rep.deductedAt && rep.deductedAt >= start && rep.deductedAt <= end) {
        events.push({
          date: formatDateOnly(rep.deductedAt),
          type: 'ADVANCE_DEDUCTED',
          amount: rep.amountDeducted,
          label: `Advance EMI ₹${rep.amountDeducted.toLocaleString('en-IN')} deducted (Remaining: ₹${adv.remainingBalance})`,
        });
      }
    });
  });

  // 3. Short-Time Days (PURPLE)
  entries.forEach((entry) => {
    const entryDate = formatDateOnly(entry.date);
    if (entry.shortTime && entry.shortTime > 0) {
      events.push({
        date: entryDate,
        type: 'SHORT_TIME',
        hours: entry.shortTime,
        label: `Short-time: ${entry.shortTime}h early departure recorded in DPR`,
      });
    }
  });

  // 4. Salary Paid (GREEN)
  if (payroll) {
    const rec = (payroll.records || []).find((r) => String(r.employee) === String(employee._id));
    if (rec && rec.paymentDate) {
      events.push({
        date: formatDateOnly(rec.paymentDate),
        type: 'SALARY_PAID',
        amount: rec.netPayable,
        label: `Salary of ₹${rec.netPayable.toLocaleString('en-IN')} paid on time`,
      });
    }
  }

  res.json({ success: true, events });
});

/**
 * GET /api/employees/:id/shorttime-log?month=&year=&workingDaysInMonth=
 */
const getShorttimeLog = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) throw ApiError.notFound('Employee not found');

  const now = new Date();
  const year = Number(req.query.year) || now.getUTCFullYear();
  const month = Number(req.query.month) || now.getUTCMonth() + 1;
  const { start, end } = monthRange(year, month);

  const entries = await DprEntry.find({
    employee: employee._id,
    date: { $gte: start, $lte: end },
    shortTime: { $gt: 0 },
  }).sort({ date: 1 }).lean();

  const workingDays = Number(req.query.workingDaysInMonth) || 26;
  const baseRate = employee.salaryConfig?.baseRate || 0;
  const standardDailyHours = employee.salaryConfig?.standardDailyHours || 8;
  const salaryType = employee.salaryConfig?.salaryType || 'Monthly';

  const dailyRate = salaryType === 'Monthly'
    ? (workingDays > 0 ? baseRate / workingDays : 0)
    : baseRate;
  const hourlyRate = standardDailyHours > 0 ? dailyRate / standardDailyHours : 0;

  let totalShortTimeHours = 0;
  let totalShortTimeDeduction = 0;

  const days = entries.map((e) => {
    const hours = e.shortTime || 0;
    const deductionAmount = Math.round(hours * hourlyRate * 100) / 100;
    totalShortTimeHours += hours;
    totalShortTimeDeduction += deductionAmount;
    return {
      date: formatDateOnly(e.date),
      shortTimeHours: hours,
      hourlyRate: Math.round(hourlyRate * 100) / 100,
      deductionAmount,
      inTime: e.inTime || '',
      outTime: e.outTime || '',
    };
  });

  res.json({
    success: true,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
    totalShortTimeHours: Math.round(totalShortTimeHours * 100) / 100,
    totalShortTimeDeduction: Math.round(totalShortTimeDeduction * 100) / 100,
    days,
  });
});

/**
 * GET /api/employees/:id/salary-history
 */
const getSalaryHistory = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id)
    .populate('salaryHistory.changedBy', 'name username')
    .lean();
  if (!employee) throw ApiError.notFound('Employee not found');

  res.json({
    success: true,
    salaryConfig: employee.salaryConfig || {},
    salaryHistory: employee.salaryHistory || [],
  });
});

/**
 * PUT /api/employees/:id/salary
 */
const updateSalary = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);
  if (!employee) throw ApiError.notFound('Employee not found');

  const { newBaseRate, effectiveFrom, reason = '', salaryType, otMultiplier, paymentMode, paidLeavesPerMonth, standardDailyHours } = req.body;
  const rate = Number(newBaseRate);
  if (isNaN(rate) || rate < 0) throw ApiError.badRequest('Valid base rate is required');

  const effDate = parseDateOnly(effectiveFrom) || new Date();
  const prevRate = employee.salaryConfig?.baseRate || 0;

  employee.salaryHistory.push({
    effectiveFrom: effDate,
    previousRate: prevRate,
    newRate: rate,
    reason: String(reason || 'Salary revision').trim(),
    changedBy: req.user._id,
    changedAt: new Date(),
  });

  if (!employee.salaryConfig) employee.salaryConfig = {};
  employee.salaryConfig.baseRate = rate;
  if (salaryType) employee.salaryConfig.salaryType = salaryType;
  if (otMultiplier) employee.salaryConfig.otMultiplier = otMultiplier;
  if (paymentMode) employee.salaryConfig.paymentMode = paymentMode;
  if (paidLeavesPerMonth !== undefined) employee.salaryConfig.paidLeavesPerMonth = Number(paidLeavesPerMonth);
  if (standardDailyHours !== undefined) employee.salaryConfig.standardDailyHours = Number(standardDailyHours);

  employee.updatedBy = req.user._id;
  await employee.save();

  await recordAudit({
    req,
    action: 'SALARY_REVISED',
    entity: 'Employee',
    entityId: employee._id,
    entityLabel: `${employee.employeeId} — ${employee.name}`,
    before: { baseRate: prevRate },
    after: { baseRate: rate, effectiveFrom: formatDateOnly(effDate) },
    note: `Salary updated from ₹${prevRate} to ₹${rate}. Reason: ${reason}`,
  });

  res.json({
    success: true,
    salaryConfig: employee.salaryConfig,
    salaryHistory: employee.salaryHistory,
  });
});

module.exports = {
  listEmployees,
  searchEmployees,
  getEmployee,
  getEmployeeAttendance,
  createEmployee,
  updateEmployee,
  setEmployeeStatus,
  resolveDepartmentAndTeam,
  getSalaryPreview,
  getFinancialCalendar,
  getShorttimeLog,
  getSalaryHistory,
  updateSalary,
  SENSITIVE_SELECT,
};
