'use strict';

/**
 * All DPR dates are stored as UTC midnight of the calendar day they belong to.
 * A night shift that runs 20:00 -> 05:00 still belongs to the date it STARTED on,
 * so the calendar day is the anchor everywhere in the system.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-08-01" -> Date(2026-08-01T00:00:00.000Z) */
function parseDateOnly(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 10);
  if (!DATE_RE.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null; // rejects impossible dates such as 2026-02-31
  }
  return date;
}

/** Date -> "2026-08-01" */
function formatDateOnly(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function todayDateOnly() {
  return parseDateOnly(formatDateOnly(new Date()));
}

/** Inclusive list of dates between two date-only values. */
function eachDateInRange(from, to) {
  const out = [];
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (!start || !end || start > end) return out;
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** First and last day of a given year/month (month is 1-12). */
function monthRange(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

module.exports = {
  DATE_RE,
  parseDateOnly,
  formatDateOnly,
  todayDateOnly,
  eachDateInRange,
  monthRange,
};
