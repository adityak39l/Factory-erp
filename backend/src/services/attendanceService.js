'use strict';

const Shift = require('../models/Shift');
const Holiday = require('../models/Holiday');
const Settings = require('../models/Settings');
const { formatDateOnly, eachDateInRange, parseDateOnly } = require('../utils/dates');
const { hasShiftEnded, round2 } = require('./timeCalculation');

/**
 * Attendance is INFERRED, never stored:
 *   - holiday date                                  -> Holiday
 *   - DPR entry exists                              -> Present (Completed / Incomplete)
 *   - no entry, past date, employee Active & joined -> Absent
 *   - Inactive employees are excluded entirely from absence, from the day they left.
 */

/**
 * Resolve the shift definition that was in force on a given date.
 * Falls back to the current version when no dated version exists.
 */
async function resolveShift(shiftName, date) {
  if (!shiftName || shiftName === 'Not Applicable') return null;
  const onDate = parseDateOnly(date) || new Date();
  const versioned = await Shift.findOne({ name: shiftName, effectiveFrom: { $lte: onDate } })
    .sort({ effectiveFrom: -1 })
    .lean();
  if (versioned) return versioned;
  return Shift.findOne({ name: shiftName, isCurrent: true }).lean();
}

async function getHolidayMap(from, to) {
  const holidays = await Holiday.find({ date: { $gte: from, $lte: to } }).lean();
  const map = new Map();
  holidays.forEach((h) => map.set(formatDateOnly(h.date), h));
  return map;
}

function isWeeklyOff(date, settings) {
  if (!settings?.attendance?.treatWeeklyOffAsHoliday) return false;
  const days = settings.attendance.weeklyOffDays || [];
  return days.includes(new Date(date).getUTCDay());
}

/**
 * Live working status for a single day, derived purely from DPR data.
 *  Working   - IN recorded, OUT not yet (shift still running)
 *  Completed - IN and OUT recorded and nothing else pending
 *  Incomplete- something is still missing (and the shift has ended, for OUT)
 *  Absent    - no entry at all
 */
function deriveWorkingStatus(entry, { now = new Date() } = {}) {
  if (!entry) return 'Absent';
  const shift = entry.shiftStartTime
    ? { startTime: entry.shiftStartTime, endTime: entry.shiftEndTime }
    : null;
  const shiftOver = hasShiftEnded(shift, entry.date, now);

  const pending = [];
  if (!entry.inTime) pending.push('inTime');
  if (!entry.outTime) pending.push('outTime');
  if (entry.requiresWorkQty && !entry.workDescription) pending.push('workQty');

  if (pending.length === 0) return 'Completed';
  if (entry.inTime && !entry.outTime && !shiftOver) return 'Working';
  return 'Incomplete';
}

/**
 * Which field-groups of an entry should be reported as "missing information".
 * Respects both role applicability and shift-end timing.
 */
function missingGroupsFor(entry, { now = new Date() } = {}) {
  if (!entry || !entry.inTime) return []; // no IN time at all = Absent, never "incomplete"
  const shift = entry.shiftStartTime
    ? { startTime: entry.shiftStartTime, endTime: entry.shiftEndTime }
    : null;
  const shiftOver = hasShiftEnded(shift, entry.date, now);

  const missing = [];
  // OUT time only becomes "missing" once the shift should have ended.
  if (!entry.outTime && shiftOver) missing.push('outTime');
  // Work + Qty never applies to support roles (guard, cook, sweeper...).
  if (entry.requiresWorkQty && !entry.workDescription) missing.push('workQty');
  return missing;
}

/**
 * Day-by-day attendance for one employee across a date range, plus totals.
 * Permanent employees are split by Day/Night shift; Contract employees get hours only.
 */
async function buildEmployeeAttendance({ employee, from, to, entries, now = new Date() }) {
  const settings = await Settings.getSettings();
  const holidayMap = await getHolidayMap(from, to);
  const entryMap = new Map();
  (entries || []).forEach((e) => entryMap.set(formatDateOnly(e.date), e));

  const today = parseDateOnly(now);
  const joining = parseDateOnly(employee.joiningDate);
  const leftOn = employee.status === 'Inactive' ? parseDateOnly(employee.inactiveSince) : null;

  const days = [];
  const summary = {
    presentDays: 0,
    absentDays: 0,
    holidayDays: 0,
    incompleteDays: 0,
    totalHours: 0,
    totalOvertime: 0,
    totalShortTime: 0,
    totalQty: 0,
    dayShiftDays: 0,
    nightShiftDays: 0,
    dayShiftHours: 0,
    nightShiftHours: 0,
    dayShiftOvertime: 0,
    nightShiftOvertime: 0,
    notApplicableDays: 0,
  };

  eachDateInRange(from, to).forEach((date) => {
    const key = formatDateOnly(date);
    const entry = entryMap.get(key) || null;
    const holiday = holidayMap.get(key);
    const weeklyOff = isWeeklyOff(date, settings);

    let status;
    if (entry) {
      status = 'Present';
    } else if (holiday || weeklyOff) {
      status = 'Holiday';
    } else if (joining && date < joining) {
      status = 'Not Joined';
    } else if (leftOn && date > leftOn) {
      status = 'Left'; // Inactive employees never accrue absence after leaving
    } else if (date > today) {
      status = 'Upcoming';
    } else {
      status = 'Absent';
    }

    const workingStatus = entry ? deriveWorkingStatus(entry, { now }) : status;

    if (status === 'Present') {
      summary.presentDays += 1;
      summary.totalHours += entry.totalHours || 0;
      summary.totalOvertime += entry.overtime || 0;
      summary.totalShortTime += entry.shortTime || 0;
      summary.totalQty += entry.qty || 0;
      if (workingStatus === 'Incomplete') summary.incompleteDays += 1;

      if (entry.shiftName === 'Day') {
        summary.dayShiftDays += 1;
        summary.dayShiftHours += entry.totalHours || 0;
        summary.dayShiftOvertime += entry.overtime || 0;
      } else if (entry.shiftName === 'Night') {
        summary.nightShiftDays += 1;
        summary.nightShiftHours += entry.totalHours || 0;
        summary.nightShiftOvertime += entry.overtime || 0;
      } else {
        summary.notApplicableDays += 1; // Contract employees — hours only
      }
    } else if (status === 'Holiday') {
      summary.holidayDays += 1;
    } else if (status === 'Absent') {
      summary.absentDays += 1;
    }

    days.push({
      date: key,
      status,
      workingStatus,
      holiday: holiday ? holiday.description : weeklyOff ? 'Weekly Off' : null,
      entry: entry
        ? {
            id: entry._id,
            shiftName: entry.shiftName || null,
            inTime: entry.inTime,
            outTime: entry.outTime,
            totalHours: entry.totalHours,
            overtime: entry.overtime,
            shortTime: entry.shortTime,
            workDescription: entry.workDescription,
            qty: entry.qty,
            qtyUnit: entry.qtyUnit,
            entryStatus: entry.entryStatus,
            workingDepartmentName: entry.workingDepartmentName,
            isCrossAssigned: entry.isCrossAssigned,
            locks: entry.locks,
          }
        : null,
    });
  });

  Object.keys(summary).forEach((k) => {
    if (typeof summary[k] === 'number') summary[k] = round2(summary[k]);
  });

  const workingDays = summary.presentDays + summary.absentDays;
  summary.attendancePercentage =
    workingDays > 0 ? round2((summary.presentDays / workingDays) * 100) : 0;

  return { days, summary };
}

module.exports = {
  resolveShift,
  getHolidayMap,
  isWeeklyOff,
  deriveWorkingStatus,
  missingGroupsFor,
  buildEmployeeAttendance,
};
