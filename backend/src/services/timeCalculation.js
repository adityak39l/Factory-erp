'use strict';

/**
 * Core DPR time engine.
 *
 * Business rules implemented here (see requirements doc):
 *  - Total hours are ALWAYS computed, never typed by a human.
 *  - A shift that crosses midnight (e.g. 18:10 -> 02:22) is one continuous shift
 *    belonging to a single calendar date.
 *  - Overtime / short-time exist ONLY for Permanent employees, measured against
 *    the duration of the shift the entry is tagged with.
 *  - Contract employees never get overtime / short-time — total hours only,
 *    because they do not work fixed factory shifts.
 */

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MINUTES_IN_DAY = 24 * 60;

/** "9:07" or "09:07" -> 547 minutes past midnight. Returns null when invalid. */
function parseTimeToMinutes(value) {
  if (value === null || value === undefined) return null;
  const match = TIME_RE.exec(String(value).trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 547 -> "09:07" */
function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return null;
  const normalised = ((Math.round(minutes) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const h = String(Math.floor(normalised / 60)).padStart(2, '0');
  const m = String(normalised % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function isValidTime(value) {
  return parseTimeToMinutes(value) !== null;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Duration between two clock times, rolling over midnight when the end time is
 * not after the start time. 18:10 -> 02:22 yields 492 minutes (8h 12m).
 */
function durationInMinutes(startTime, endTime) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return null;
  let diff = end - start;
  if (diff <= 0) diff += MINUTES_IN_DAY; // crossed midnight
  return diff;
}

/** Scheduled length of a shift, e.g. Day 09:15-18:15 -> 540 minutes. */
function shiftDurationMinutes(shift) {
  if (!shift || !shift.startTime || !shift.endTime) return null;
  return durationInMinutes(shift.startTime, shift.endTime);
}

/**
 * Compute every derived DPR figure for one entry.
 *
 * @param {object} params
 * @param {string|null} params.inTime           "HH:MM"
 * @param {string|null} params.outTime          "HH:MM"
 * @param {'Permanent'|'Contract'} params.employeeType
 * @param {{startTime:string,endTime:string}|null} params.shift
 * @returns {{workedMinutes:number|null,totalHours:number|null,overtime:number|null,shortTime:number|null,otApplicable:boolean}}
 */
function computeDprMetrics({ inTime, outTime, employeeType = 'Permanent', shift = null }) {
  const otApplicable = employeeType !== 'Contract' && !!shift;

  const workedMinutes =
    inTime && outTime ? durationInMinutes(inTime, outTime) : null;

  if (workedMinutes === null) {
    return {
      workedMinutes: null,
      totalHours: null,
      overtime: null,
      shortTime: null,
      otApplicable,
    };
  }

  const totalHours = round2(workedMinutes / 60);

  if (!otApplicable) {
    // Contract employees (and any entry without a shift) get hours only.
    return { workedMinutes, totalHours, overtime: null, shortTime: null, otApplicable };
  }

  const scheduled = shiftDurationMinutes(shift);
  if (scheduled === null) {
    return { workedMinutes, totalHours, overtime: null, shortTime: null, otApplicable: false };
  }

  const delta = workedMinutes - scheduled;
  return {
    workedMinutes,
    totalHours,
    overtime: delta > 0 ? round2(delta / 60) : 0,
    shortTime: delta < 0 ? round2(-delta / 60) : 0,
    otApplicable: true,
  };
}

/**
 * Has the employee's expected shift end already passed?
 * Used so "OUT time missing" is only surfaced after the shift should have ended —
 * before that, IN-with-no-OUT simply means the person is still working.
 *
 * @param {{startTime:string,endTime:string}} shift
 * @param {Date} entryDate  UTC midnight of the DPR date
 * @param {Date} now
 */
function hasShiftEnded(shift, entryDate, now = new Date()) {
  if (!shift || !shift.startTime || !shift.endTime) {
    // No shift (Contract) — fall back to "the calendar day is over".
    const endOfDay = new Date(entryDate);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
    return now >= endOfDay;
  }
  const start = parseTimeToMinutes(shift.startTime);
  const duration = shiftDurationMinutes(shift);
  if (start === null || duration === null) return false;

  const endMoment = new Date(entryDate);
  endMoment.setUTCMinutes(endMoment.getUTCMinutes() + start + duration);
  return now >= endMoment;
}

module.exports = {
  TIME_RE,
  MINUTES_IN_DAY,
  parseTimeToMinutes,
  formatMinutes,
  isValidTime,
  durationInMinutes,
  shiftDurationMinutes,
  computeDprMetrics,
  hasShiftEnded,
  round2,
};
