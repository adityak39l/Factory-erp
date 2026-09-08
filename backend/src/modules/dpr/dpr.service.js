'use strict';

const DprEntry = require('../../models/DprEntry');
const Employee = require('../../models/Employee');
const Department = require('../../models/Department');
const Holiday = require('../../models/Holiday');
const Settings = require('../../models/Settings');
const { ApiError } = require('../../utils/ApiError');
const { recordAudit } = require('../../services/auditService');
const { resolveShift } = require('../../services/attendanceService');
const { computeDprMetrics } = require('../../services/timeCalculation');
const { parseDateOnly, formatDateOnly } = require('../../utils/dates');

/**
 * The DPR write engine.
 *
 * PROGRESSIVE LOCK-ON-SAVE: inTime, outTime and workQty are three independent
 * field-groups. Each locks the instant it is saved. A locked group can only be
 * changed by an admin or an operator holding `canEditDpr`, and every override is
 * written to editHistory + the audit log.
 */

const FIELD_GROUP_LABELS = {
  inTime: 'IN time',
  outTime: 'OUT time',
  workQty: 'work description / quantity',
  shift: 'shift',
};

/** Guards that apply before any DPR row may be created for a date. */
async function assertDateIsOpenForEntry(date) {
  const settings = await Settings.getSettings();
  const target = parseDateOnly(date);
  if (!target) throw ApiError.badRequest('Invalid DPR date');

  const holiday = await Holiday.findOne({ date: target });
  if (holiday) {
    throw ApiError.badRequest(
      `${formatDateOnly(target)} is declared a holiday (${holiday.description}) — DPR entry is blocked`
    );
  }

  const today = parseDateOnly(new Date());
  if (target > today && !settings.dpr.allowFutureDates) {
    throw ApiError.badRequest('DPR cannot be recorded for a future date');
  }

  const limit = settings.dpr.backdateLimitDays;
  if (limit > 0) {
    const earliest = new Date(today);
    earliest.setUTCDate(earliest.getUTCDate() - limit);
    if (target < earliest) {
      throw ApiError.badRequest(
        `DPR entry is limited to the last ${limit} days. Ask the administrator to record older entries.`
      );
    }
  }

  return target;
}

/** Builds a fresh entry document (not yet saved) from employee master data. */
async function buildNewEntry({ employee, date, user, shiftName, workingDepartmentId }) {
  const department = await Department.findById(employee.department).lean();

  // Contract employees never carry a shift — hours only, no OT / short-time.
  let shift = null;
  if (employee.employeeType !== 'Contract') {
    const chosen = shiftName || employee.shiftCategory || 'Day';
    shift = await resolveShift(chosen, date);
    if (!shift) {
      throw ApiError.badRequest(
        `${chosen} shift timings are not configured yet. Set them in Shift Settings first.`
      );
    }
  }

  // Helper-pool employees may be logged against another department for the day.
  let workingDepartment = department;
  let isCrossAssigned = false;
  if (workingDepartmentId && String(workingDepartmentId) !== String(employee.department)) {
    if (!department?.isHelperPool) {
      throw ApiError.badRequest(
        `${employee.name} is not in a helper-pool department, so they cannot be logged against another department`
      );
    }
    const target = await Department.findById(workingDepartmentId).lean();
    if (!target) throw ApiError.badRequest('The selected working department does not exist');
    workingDepartment = target;
    isCrossAssigned = true;
  }

  return new DprEntry({
    date,
    employee: employee._id,
    employeeIdCode: employee.employeeId,
    employeeName: employee.name,
    employeeType: employee.employeeType,
    department: employee.department,
    departmentName: department?.name || '',
    workingDepartment: workingDepartment?._id || employee.department,
    workingDepartmentName: workingDepartment?.name || '',
    isCrossAssigned,
    team: employee.team || null,
    teamName: '',
    shift: shift ? shift._id : null,
    shiftName: shift ? shift.name : '',
    shiftStartTime: shift ? shift.startTime : '',
    shiftEndTime: shift ? shift.endTime : '',
    requiresWorkQty: employee.requiresWorkQty,
    enteredBy: user._id,
    enteredByName: user.name,
  });
}

function recomputeMetrics(entry) {
  const shift = entry.shiftStartTime
    ? { startTime: entry.shiftStartTime, endTime: entry.shiftEndTime }
    : null;
  const metrics = computeDprMetrics({
    inTime: entry.inTime,
    outTime: entry.outTime,
    employeeType: entry.employeeType,
    shift,
  });
  entry.totalHours = metrics.totalHours;
  entry.overtime = metrics.overtime;
  entry.shortTime = metrics.shortTime;
  return metrics;
}

/**
 * Applies a partial DPR payload, honouring the per-field-group locks.
 *
 * @param {object} params
 * @param {DprEntry} params.entry
 * @param {object} params.payload  { inTime?, outTime?, workDescription?, qty?, qtyUnit?, shiftName?, workingDepartment? }
 * @param {object} params.user     the authenticated user document
 * @param {boolean} params.canOverride  true for admin / canEditDpr operators
 * @returns {{changedGroups:string[], overriddenGroups:string[]}}
 */
async function applyDprPayload({ entry, payload, user, canOverride, reason = '' }) {
  const changedGroups = [];
  const overriddenGroups = [];

  const pushHistory = (fieldGroup, previousValue, newValue, wasLocked) => {
    entry.editHistory.push({
      fieldGroup,
      previousValue,
      newValue,
      changedBy: user._id,
      changedByName: user.name,
      changedAt: new Date(),
      reason,
      wasLocked,
    });
  };

  const guardLock = (group) => {
    if (entry.locks[group] && !canOverride) {
      throw ApiError.forbidden(
        `${FIELD_GROUP_LABELS[group]} is already saved and locked. Only an administrator (or an operator granted edit rights) can change it.`
      );
    }
  };

  // --- shift (only meaningful for Permanent employees) ---
  if (payload.shiftName && entry.employeeType !== 'Contract' && payload.shiftName !== entry.shiftName) {
    // Shift drives OT, so it follows the OUT-time lock.
    if (entry.locks.outTime && !canOverride) {
      throw ApiError.forbidden(
        'The shift cannot be changed once OUT time is locked. Ask an administrator to adjust it.'
      );
    }
    const shift = await resolveShift(payload.shiftName, entry.date);
    if (!shift) throw ApiError.badRequest(`${payload.shiftName} shift timings are not configured`);
    pushHistory('shift', entry.shiftName, shift.name, entry.locks.outTime);
    if (entry.locks.outTime) overriddenGroups.push('shift');
    entry.shift = shift._id;
    entry.shiftName = shift.name;
    entry.shiftStartTime = shift.startTime;
    entry.shiftEndTime = shift.endTime;
    changedGroups.push('shift');
  }

  // --- working department (Helper cross-assignment) ---
  if (payload.workingDepartment !== undefined && payload.workingDepartment !== null) {
    const targetId = String(payload.workingDepartment);
    if (targetId !== String(entry.workingDepartment)) {
      const home = await Department.findById(entry.department).lean();
      if (String(targetId) !== String(entry.department) && !home?.isHelperPool) {
        throw ApiError.badRequest(
          'Only helper-pool employees can be logged against a different department'
        );
      }
      const target = await Department.findById(targetId).lean();
      if (!target) throw ApiError.badRequest('The selected working department does not exist');
      entry.workingDepartment = target._id;
      entry.workingDepartmentName = target.name;
      entry.isCrossAssigned = String(target._id) !== String(entry.department);
    }
  }

  // --- IN time ---
  if (payload.inTime !== undefined && payload.inTime !== null && payload.inTime !== '') {
    if (payload.inTime !== entry.inTime) {
      guardLock('inTime');
      const wasLocked = entry.locks.inTime;
      pushHistory('inTime', entry.inTime, payload.inTime, wasLocked);
      if (wasLocked) overriddenGroups.push('inTime');
      entry.inTime = payload.inTime;
      entry.locks.inTime = true; // locks the instant it is saved
      entry.lockedAt.inTime = new Date();
      changedGroups.push('inTime');
    }
  }

  // --- OUT time ---
  if (payload.outTime !== undefined && payload.outTime !== null && payload.outTime !== '') {
    if (payload.outTime !== entry.outTime) {
      guardLock('outTime');
      if (!entry.inTime) {
        throw ApiError.badRequest('Record the IN time before the OUT time');
      }
      const wasLocked = entry.locks.outTime;
      pushHistory('outTime', entry.outTime, payload.outTime, wasLocked);
      if (wasLocked) overriddenGroups.push('outTime');
      entry.outTime = payload.outTime;
      entry.locks.outTime = true;
      entry.lockedAt.outTime = new Date();
      changedGroups.push('outTime');
    }
  }

  // --- work description + quantity (single group) ---
  const touchingWork =
    (payload.workDescription !== undefined && payload.workDescription !== '') ||
    (payload.qty !== undefined && payload.qty !== null && payload.qty !== '');

  if (touchingWork) {
    const nextDescription =
      payload.workDescription !== undefined ? payload.workDescription : entry.workDescription;
    const nextQty =
      payload.qty === undefined || payload.qty === '' || payload.qty === null
        ? entry.qty
        : Number(payload.qty);

    const changed = nextDescription !== entry.workDescription || nextQty !== entry.qty;
    if (changed) {
      guardLock('workQty');
      const wasLocked = entry.locks.workQty;
      pushHistory(
        'workQty',
        { workDescription: entry.workDescription, qty: entry.qty },
        { workDescription: nextDescription, qty: nextQty },
        wasLocked
      );
      if (wasLocked) overriddenGroups.push('workQty');
      entry.workDescription = nextDescription;
      entry.qty = nextQty;
      if (payload.qtyUnit) entry.qtyUnit = payload.qtyUnit;
      entry.locks.workQty = true;
      entry.lockedAt.workQty = new Date();
      changedGroups.push('workQty');
    }
  }

  if (changedGroups.length) {
    entry.lastEditedBy = user._id;
    recomputeMetrics(entry);
    entry.recomputeStatus();
  }

  return { changedGroups, overriddenGroups };
}

/**
 * Create-or-update a DPR entry for one employee on one date.
 * This single path is used by both the single-entry screen and bulk entry, so
 * the locking rules can never diverge between them.
 */
async function saveDprEntry({ employeeId, date, payload, user, canOverride, req }) {
  const targetDate = await assertDateIsOpenForEntry(date);

  const employee = await Employee.findById(employeeId);
  if (!employee) throw ApiError.notFound('Employee not found');
  if (employee.status !== 'Active') {
    throw ApiError.badRequest(
      `${employee.name} is marked Inactive and cannot be included in the DPR`
    );
  }
  if (employee.joiningDate && targetDate < parseDateOnly(employee.joiningDate)) {
    throw ApiError.badRequest(
      `${employee.name} joined on ${formatDateOnly(employee.joiningDate)} — DPR cannot be recorded before that date`
    );
  }

  let entry = await DprEntry.findOne({ employee: employee._id, date: targetDate });
  const isNew = !entry;

  if (!entry) {
    entry = await buildNewEntry({
      employee,
      date: targetDate,
      user,
      shiftName: payload.shiftName,
      workingDepartmentId: payload.workingDepartment,
    });
  }

  const { changedGroups, overriddenGroups } = await applyDprPayload({
    entry,
    payload,
    user,
    canOverride,
    reason: payload.reason || '',
  });

  if (isNew && !changedGroups.length) {
    throw ApiError.badRequest('Nothing to save — enter at least one value');
  }

  await entry.save();

  if (changedGroups.length) {
    await recordAudit({
      req,
      user,
      action: overriddenGroups.length ? 'LOCK_OVERRIDE' : isNew ? 'CREATE' : 'UPDATE',
      entity: 'DprEntry',
      entityId: entry._id,
      entityLabel: `${entry.employeeIdCode} — ${entry.employeeName} (${formatDateOnly(entry.date)})`,
      after: {
        changed: changedGroups,
        inTime: entry.inTime,
        outTime: entry.outTime,
        totalHours: entry.totalHours,
        overtime: entry.overtime,
        shortTime: entry.shortTime,
        workDescription: entry.workDescription,
        qty: entry.qty,
      },
      note: overriddenGroups.length
        ? `Locked field(s) overridden: ${overriddenGroups.join(', ')}`
        : `Saved: ${changedGroups.join(', ')}`,
    });
  }

  return { entry, changedGroups, overriddenGroups, isNew };
}

module.exports = {
  saveDprEntry,
  applyDprPayload,
  buildNewEntry,
  recomputeMetrics,
  assertDateIsOpenForEntry,
  FIELD_GROUP_LABELS,
};
