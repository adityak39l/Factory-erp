'use strict';

const DprEntry = require('../../models/DprEntry');
const Employee = require('../../models/Employee');
const Holiday = require('../../models/Holiday');
const Settings = require('../../models/Settings');
const { ApiError, asyncHandler } = require('../../utils/ApiError');
const { recordAudit } = require('../../services/auditService');
const { can } = require('../../middleware/permissions');
const { parseDateOnly, formatDateOnly } = require('../../utils/dates');
const {
  deriveWorkingStatus,
  missingGroupsFor,
  isWeeklyOff,
} = require('../../services/attendanceService');
const { saveDprEntry } = require('./dpr.service');

const MISSING_LABELS = {
  outTime: 'OUT time missing',
  workQty: 'Work details missing',
};

function serialiseEntry(entry, now = new Date()) {
  if (!entry) return null;
  const plain = entry.toObject ? entry.toObject() : entry;
  return {
    id: plain._id,
    date: formatDateOnly(plain.date),
    employee: plain.employee,
    employeeId: plain.employeeIdCode,
    employeeName: plain.employeeName,
    employeeType: plain.employeeType,
    department: plain.departmentName,
    workingDepartment: plain.workingDepartmentName,
    workingDepartmentId: plain.workingDepartment,
    isCrossAssigned: plain.isCrossAssigned,
    team: plain.teamName,
    shiftName: plain.shiftName || null,
    shiftStartTime: plain.shiftStartTime || null,
    shiftEndTime: plain.shiftEndTime || null,
    inTime: plain.inTime,
    outTime: plain.outTime,
    totalHours: plain.totalHours,
    overtime: plain.overtime,
    shortTime: plain.shortTime,
    workDescription: plain.workDescription,
    qty: plain.qty,
    qtyUnit: plain.qtyUnit,
    requiresWorkQty: plain.requiresWorkQty,
    locks: plain.locks,
    lockedAt: plain.lockedAt,
    entryStatus: plain.entryStatus,
    workingStatus: deriveWorkingStatus(plain, { now }),
    missingGroups: missingGroupsFor(plain, { now }),
    enteredBy: plain.enteredBy,
    enteredByName: plain.enteredByName,
    editHistory: plain.editHistory || [],
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

/**
 * GET /api/dpr/control-center?date=YYYY-MM-DD
 * The central operational screen: every active employee for that date, with their
 * entry (or absence) and clear per-field lock / pending indicators.
 */
const controlCenter = asyncHandler(async (req, res) => {
  const date = parseDateOnly(req.query.date) || parseDateOnly(new Date());
  const now = new Date();

  const [holiday, settings] = await Promise.all([
    Holiday.findOne({ date }).lean(),
    Settings.getSettings(),
  ]);
  const weeklyOff = isWeeklyOff(date, settings);

  const employeeFilter = { status: 'Active' };
  if (req.query.department) employeeFilter.department = req.query.department;
  if (req.query.team) employeeFilter.team = req.query.team;
  if (req.query.employeeType) employeeFilter.employeeType = req.query.employeeType;

  const employees = await Employee.find(employeeFilter)
    .populate('department', 'name isHelperPool')
    .populate('team', 'name')
    .sort({ name: 1 })
    .lean();

  const entries = await DprEntry.find({ date }).lean();
  const entryMap = new Map(entries.map((e) => [String(e.employee), e]));

  const rows = employees
    .filter((emp) => !emp.joiningDate || parseDateOnly(emp.joiningDate) <= date)
    .map((emp) => {
      const entry = entryMap.get(String(emp._id));
      const serialised = serialiseEntry(entry, now);
      return {
        employee: {
          id: emp._id,
          employeeId: emp.employeeId,
          name: emp.name,
          designation: emp.designation,
          employeeType: emp.employeeType,
          shiftCategory: emp.shiftCategory,
          requiresWorkQty: emp.requiresWorkQty,
          department: emp.department ? { id: emp.department._id, name: emp.department.name, isHelperPool: emp.department.isHelperPool } : null,
          team: emp.team ? { id: emp.team._id, name: emp.team.name } : null,
        },
        entry: serialised,
        status: holiday || weeklyOff ? 'Holiday' : serialised ? serialised.workingStatus : 'Absent',
      };
    });

  const filtered = req.query.status
    ? rows.filter((r) => r.status === req.query.status)
    : rows;

  const summary = {
    totalEmployees: rows.length,
    present: rows.filter((r) => r.entry).length,
    absent: rows.filter((r) => !r.entry && r.status !== 'Holiday').length,
    working: rows.filter((r) => r.status === 'Working').length,
    completed: rows.filter((r) => r.status === 'Completed').length,
    incomplete: rows.filter((r) => r.status === 'Incomplete').length,
    isHoliday: Boolean(holiday || weeklyOff),
    holidayLabel: holiday?.description || (weeklyOff ? 'Weekly Off' : null),
  };

  res.json({
    success: true,
    date: formatDateOnly(date),
    summary,
    rows: filtered,
  });
});

/** GET /api/dpr/entry?employee=&date= — single entry for the DPR form */
const getEntry = asyncHandler(async (req, res) => {
  const date = parseDateOnly(req.query.date) || parseDateOnly(new Date());
  const entry = await DprEntry.findOne({ employee: req.query.employee, date });
  res.json({ success: true, date: formatDateOnly(date), entry: serialiseEntry(entry) });
});

/**
 * POST /api/dpr
 * Progressive save. Send only what you currently have — each field-group locks
 * the moment it is saved, in any order, any number of times through the day.
 */
const saveEntry = asyncHandler(async (req, res) => {
  const canOverride = can(req, 'canEditDpr');
  const { employee, date, ...payload } = req.body;

  const { entry, changedGroups, overriddenGroups, isNew } = await saveDprEntry({
    employeeId: employee,
    date,
    payload,
    user: req.user,
    canOverride,
    req,
  });

  res.status(isNew ? 201 : 200).json({
    success: true,
    entry: serialiseEntry(entry),
    changedGroups,
    overriddenGroups,
    message: overriddenGroups.length
      ? `Saved. Locked field(s) overridden: ${overriddenGroups.join(', ')}`
      : `Saved and locked: ${changedGroups.join(', ') || 'no changes'}`,
  });
});

/** POST /api/dpr/bulk — table-style entry for many employees, same locking rules */
const bulkSave = asyncHandler(async (req, res) => {
  const canOverride = can(req, 'canEditDpr');
  const { date, entries } = req.body;

  const saved = [];
  const failed = [];

  for (const row of entries) {
    const { employee, ...payload } = row;
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await saveDprEntry({
        employeeId: employee,
        date,
        payload,
        user: req.user,
        canOverride,
        req,
      });
      if (result.changedGroups.length) {
        saved.push({
          employee,
          employeeName: result.entry.employeeName,
          changedGroups: result.changedGroups,
          overriddenGroups: result.overriddenGroups,
        });
      }
    } catch (err) {
      failed.push({
        employee,
        message: err.message,
      });
    }
  }

  res.json({
    success: true,
    savedCount: saved.length,
    failedCount: failed.length,
    saved,
    failed,
    message: `${saved.length} entr${saved.length === 1 ? 'y' : 'ies'} saved${
      failed.length ? `, ${failed.length} could not be saved` : ''
    }`,
  });
});

/**
 * GET /api/dpr/my-workspace?date=
 * The logged-in operator's own "DPR Missing Information" list — informational only.
 *  - employees with no IN time are Absent and never appear here
 *  - "work details missing" is skipped for support roles (requiresWorkQty = false)
 *  - "OUT time missing" only appears after the expected shift end has passed
 */
const myWorkspace = asyncHandler(async (req, res) => {
  const date = parseDateOnly(req.query.date) || parseDateOnly(new Date());
  const now = new Date();

  const entries = await DprEntry.find({ enteredBy: req.user._id, date }).sort({ employeeName: 1 }).lean();

  const items = entries
    .map((entry) => ({ entry, missing: missingGroupsFor(entry, { now }) }))
    .filter(({ missing }) => missing.length > 0)
    .map(({ entry, missing }) => ({
      entryId: entry._id,
      employee: entry.employee,
      employeeId: entry.employeeIdCode,
      employeeName: entry.employeeName,
      department: entry.workingDepartmentName,
      shiftName: entry.shiftName || null,
      inTime: entry.inTime,
      outTime: entry.outTime,
      missingGroups: missing,
      missingLabel: missing.map((g) => MISSING_LABELS[g]).join(' + '),
    }));

  const handled = entries.length;
  res.json({
    success: true,
    date: formatDateOnly(date),
    count: items.length,
    handledToday: handled,
    completedToday: entries.filter((e) => e.entryStatus === 'Completed').length,
    items,
  });
});

/** GET /api/dpr/incomplete?date= — factory-wide oversight view (admin / supervisors) */
const incompleteEntries = asyncHandler(async (req, res) => {
  const date = parseDateOnly(req.query.date) || parseDateOnly(new Date());
  const now = new Date();

  const filter = { date };
  if (req.query.department) filter.workingDepartment = req.query.department;

  const entries = await DprEntry.find(filter).sort({ employeeName: 1 }).lean();

  const items = entries
    .map((entry) => ({ entry, missing: missingGroupsFor(entry, { now }) }))
    .filter(({ missing }) => missing.length > 0)
    .map(({ entry, missing }) => ({
      ...serialiseEntry(entry, now),
      missingGroups: missing,
      missingLabel: missing.map((g) => MISSING_LABELS[g]).join(' + '),
    }));

  res.json({ success: true, date: formatDateOnly(date), count: items.length, items });
});

/** DELETE /api/dpr/:id — admin only; the entry is removed and the day reverts to Absent */
const deleteEntry = asyncHandler(async (req, res) => {
  const entry = await DprEntry.findById(req.params.id);
  if (!entry) throw ApiError.notFound('DPR entry not found');

  const snapshot = serialiseEntry(entry);
  await entry.deleteOne();

  await recordAudit({
    req,
    action: 'DELETE',
    entity: 'DprEntry',
    entityId: entry._id,
    entityLabel: `${entry.employeeIdCode} — ${entry.employeeName} (${formatDateOnly(entry.date)})`,
    before: snapshot,
    note: req.body?.reason || 'DPR entry deleted by administrator',
  });

  res.json({ success: true, message: 'DPR entry deleted' });
});

module.exports = {
  controlCenter,
  getEntry,
  saveEntry,
  bulkSave,
  myWorkspace,
  incompleteEntries,
  deleteEntry,
  serialiseEntry,
};
