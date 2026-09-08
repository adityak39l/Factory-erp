'use strict';

const Employee = require('../../models/Employee');
const Department = require('../../models/Department');
const Team = require('../../models/Team');
const DprEntry = require('../../models/DprEntry');
const { ApiError, asyncHandler } = require('../../utils/ApiError');
const { recordAudit } = require('../../services/auditService');
const { generateEmployeeId } = require('../../services/employeeIdService');
const { can } = require('../../middleware/permissions');
const { parseDateOnly, formatDateOnly, monthRange } = require('../../utils/dates');
const { buildEmployeeAttendance } = require('../../services/attendanceService');

const SENSITIVE_SELECT = '+aadharNo +bankDetails.accountNo';

/** Shared shape for list responses. */
function toListItem(employee, canViewSensitive) {
  const json = employee.toClientJSON(canViewSensitive);
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

  res.json({
    success: true,
    employees: employees.map((e) => toListItem(e, canView)),
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

  res.json({ success: true, employee: employee.toClientJSON(can(req, 'canViewSensitive')) });
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
    },
  });

  const saved = await Employee.findById(employee._id)
    .select(SENSITIVE_SELECT)
    .populate('department', 'name isHelperPool hasTeams')
    .populate('team', 'name');

  res.status(201).json({ success: true, employee: saved.toClientJSON(can(req, 'canViewSensitive')) });
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

  res.json({ success: true, employee: saved.toClientJSON(can(req, 'canViewSensitive')) });
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

  res.json({ success: true, employee: employee.toClientJSON(can(req, 'canViewSensitive')) });
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
  SENSITIVE_SELECT,
};
