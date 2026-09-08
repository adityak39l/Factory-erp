'use strict';

const Department = require('../../models/Department');
const Team = require('../../models/Team');
const Shift = require('../../models/Shift');
const Holiday = require('../../models/Holiday');
const Employee = require('../../models/Employee');
const DprEntry = require('../../models/DprEntry');
const { ApiError, asyncHandler } = require('../../utils/ApiError');
const { recordAudit } = require('../../services/auditService');
const { parseDateOnly, formatDateOnly } = require('../../utils/dates');
const { shiftDurationMinutes, round2 } = require('../../services/timeCalculation');

/* ------------------------------------------------------------------ */
/* Departments                                                         */
/* ------------------------------------------------------------------ */

const listDepartments = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const filter = includeInactive ? {} : { isActive: true };
  const departments = await Department.find(filter).sort({ name: 1 }).lean();

  const counts = await Employee.aggregate([
    { $match: { status: 'Active' } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  const teams = await Team.find({ isActive: true }).lean();

  res.json({
    success: true,
    departments: departments.map((d) => ({
      ...d,
      employeeCount: countMap.get(String(d._id)) || 0,
      teams: teams.filter((t) => String(t.department) === String(d._id)),
    })),
  });
});

const createDepartment = asyncHandler(async (req, res) => {
  const department = await Department.create({ ...req.body, createdBy: req.user._id });
  await recordAudit({
    req,
    action: 'CREATE',
    entity: 'Department',
    entityId: department._id,
    entityLabel: department.name,
    after: req.body,
  });
  res.status(201).json({ success: true, department });
});

const updateDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) throw ApiError.notFound('Department not found');

  const before = department.toObject();
  Object.assign(department, req.body, { updatedBy: req.user._id });
  await department.save();

  await recordAudit({
    req,
    action: 'UPDATE',
    entity: 'Department',
    entityId: department._id,
    entityLabel: department.name,
    before: { name: before.name, hasTeams: before.hasTeams, isHelperPool: before.isHelperPool },
    after: req.body,
  });
  res.json({ success: true, department });
});

/** Departments are archived, never deleted, so historical DPRs keep resolving. */
const archiveDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) throw ApiError.notFound('Department not found');

  const activeEmployees = await Employee.countDocuments({
    department: department._id,
    status: 'Active',
  });
  if (activeEmployees > 0) {
    throw ApiError.badRequest(
      `${activeEmployees} active employee(s) are still assigned to this department. Move them first.`
    );
  }

  department.isActive = false;
  department.updatedBy = req.user._id;
  await department.save();

  await recordAudit({
    req,
    action: 'STATUS_CHANGE',
    entity: 'Department',
    entityId: department._id,
    entityLabel: department.name,
    note: 'Department archived (historical DPR data preserved)',
  });

  res.json({ success: true, message: 'Department archived', department });
});

/* ------------------------------------------------------------------ */
/* Teams                                                               */
/* ------------------------------------------------------------------ */

const listTeams = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.department) filter.department = req.query.department;
  const teams = await Team.find(filter).populate('department', 'name').sort({ name: 1 }).lean();
  res.json({ success: true, teams });
});

const createTeam = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.body.department);
  if (!department) throw ApiError.notFound('Department not found');
  if (!department.hasTeams) {
    throw ApiError.badRequest(
      `${department.name} is not configured to use teams. Enable "has teams" on the department first.`
    );
  }

  const team = await Team.create({ ...req.body, createdBy: req.user._id });
  await recordAudit({
    req,
    action: 'CREATE',
    entity: 'Team',
    entityId: team._id,
    entityLabel: `${department.name} / ${team.name}`,
    after: req.body,
  });
  res.status(201).json({ success: true, team });
});

const updateTeam = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team) throw ApiError.notFound('Team not found');
  const before = { name: team.name };
  Object.assign(team, req.body, { updatedBy: req.user._id });
  await team.save();
  await recordAudit({
    req,
    action: 'UPDATE',
    entity: 'Team',
    entityId: team._id,
    entityLabel: team.name,
    before,
    after: req.body,
  });
  res.json({ success: true, team });
});

const archiveTeam = asyncHandler(async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team) throw ApiError.notFound('Team not found');
  const assigned = await Employee.countDocuments({ team: team._id, status: 'Active' });
  if (assigned > 0) {
    throw ApiError.badRequest(`${assigned} active employee(s) are still in this team. Move them first.`);
  }
  team.isActive = false;
  await team.save();
  await recordAudit({
    req,
    action: 'STATUS_CHANGE',
    entity: 'Team',
    entityId: team._id,
    entityLabel: team.name,
    note: 'Team archived',
  });
  res.json({ success: true, message: 'Team archived' });
});

/* ------------------------------------------------------------------ */
/* Shifts                                                              */
/* ------------------------------------------------------------------ */

const listShifts = asyncHandler(async (req, res) => {
  const current = await Shift.find({ isCurrent: true }).sort({ name: 1 }).lean();
  const history = await Shift.find({ isCurrent: false }).sort({ name: 1, effectiveFrom: -1 }).lean();

  const decorate = (s) => ({
    ...s,
    durationMinutes: shiftDurationMinutes(s),
    durationHours: round2((shiftDurationMinutes(s) || 0) / 60),
    crossesMidnight: shiftDurationMinutes(s) !== null && s.endTime <= s.startTime,
  });

  res.json({
    success: true,
    shifts: current.map(decorate),
    history: history.map(decorate),
  });
});

/**
 * Changing shift timings creates a NEW dated version instead of mutating the old
 * one — historical DPRs keep being evaluated against the timing that applied then.
 */
const upsertShift = asyncHandler(async (req, res) => {
  const { name, startTime, endTime, effectiveFrom, note } = req.body;
  const effective = parseDateOnly(effectiveFrom) || parseDateOnly(new Date());

  const existing = await Shift.findOne({ name, isCurrent: true });

  if (existing && existing.startTime === startTime && existing.endTime === endTime) {
    return res.json({ success: true, shift: existing, message: 'No change in timings' });
  }

  if (existing) {
    existing.isCurrent = false;
    await existing.save();
  }

  const shift = await Shift.create({
    name,
    startTime,
    endTime,
    effectiveFrom: effective,
    note: note || '',
    isCurrent: true,
    createdBy: req.user._id,
  });

  await recordAudit({
    req,
    action: existing ? 'UPDATE' : 'CREATE',
    entity: 'Shift',
    entityId: shift._id,
    entityLabel: name,
    before: existing ? { startTime: existing.startTime, endTime: existing.endTime } : null,
    after: { startTime, endTime, effectiveFrom: formatDateOnly(effective) },
    note: existing ? 'New shift timing version created' : 'Shift created',
  });

  return res.status(existing ? 200 : 201).json({ success: true, shift });
});

/* ------------------------------------------------------------------ */
/* Holidays                                                            */
/* ------------------------------------------------------------------ */

const listHolidays = asyncHandler(async (req, res) => {
  const { year } = req.query;
  const filter = {};
  if (year) {
    filter.date = {
      $gte: new Date(Date.UTC(Number(year), 0, 1)),
      $lte: new Date(Date.UTC(Number(year), 11, 31)),
    };
  }
  const holidays = await Holiday.find(filter).sort({ date: 1 }).lean();
  res.json({
    success: true,
    holidays: holidays.map((h) => ({ ...h, date: formatDateOnly(h.date) })),
  });
});

const createHoliday = asyncHandler(async (req, res) => {
  const date = parseDateOnly(req.body.date);
  if (!date) throw ApiError.badRequest('Invalid holiday date');

  const existing = await Holiday.findOne({ date });
  if (existing) throw ApiError.conflict('A holiday is already declared for that date');

  const entriesOnDate = await DprEntry.countDocuments({ date });
  if (entriesOnDate > 0) {
    throw ApiError.badRequest(
      `${entriesOnDate} DPR entries already exist on ${formatDateOnly(date)}. Remove them before declaring a holiday.`
    );
  }

  const holiday = await Holiday.create({
    date,
    description: req.body.description,
    type: req.body.type || 'Festival',
    createdBy: req.user._id,
  });

  await recordAudit({
    req,
    action: 'CREATE',
    entity: 'Holiday',
    entityId: holiday._id,
    entityLabel: `${formatDateOnly(date)} — ${holiday.description}`,
    after: { date: formatDateOnly(date), description: holiday.description },
  });

  res.status(201).json({ success: true, holiday: { ...holiday.toObject(), date: formatDateOnly(date) } });
});

const deleteHoliday = asyncHandler(async (req, res) => {
  const holiday = await Holiday.findById(req.params.id);
  if (!holiday) throw ApiError.notFound('Holiday not found');
  await holiday.deleteOne();

  await recordAudit({
    req,
    action: 'DELETE',
    entity: 'Holiday',
    entityId: holiday._id,
    entityLabel: `${formatDateOnly(holiday.date)} — ${holiday.description}`,
    before: { date: formatDateOnly(holiday.date), description: holiday.description },
  });

  res.json({ success: true, message: 'Holiday removed' });
});

module.exports = {
  listDepartments,
  createDepartment,
  updateDepartment,
  archiveDepartment,
  listTeams,
  createTeam,
  updateTeam,
  archiveTeam,
  listShifts,
  upsertShift,
  listHolidays,
  createHoliday,
  deleteHoliday,
};
