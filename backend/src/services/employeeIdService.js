'use strict';

const crypto = require('crypto');
const { ApiError } = require('../utils/ApiError');

/**
 * Employee ID format: YYMM + 3 random digits — e.g. joined August 2026 -> 2608001.
 * Year and month are chosen by the admin at registration; the 3-digit suffix is
 * randomly assigned and only needs to be unique inside that year-month bucket
 * (999 slots per month, far beyond this factory's hiring rate).
 */

function buildPrefix(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 2000 || y > 2099) {
    throw ApiError.badRequest('Joining year must be between 2000 and 2099');
  }
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    throw ApiError.badRequest('Joining month must be between 1 and 12');
  }
  return `${String(y % 100).padStart(2, '0')}${String(m).padStart(2, '0')}`;
}

/** Cryptographically random integer in [0, max) — avoids Math.random bias. */
function randomInt(max) {
  return crypto.randomInt(0, max);
}

/**
 * @param {number} year  full year, e.g. 2026
 * @param {number} month 1-12
 * @param {string[]} takenIds  existing employee IDs (any prefix; filtered internally)
 * @returns {string} e.g. "2608001"
 */
function generateEmployeeId(year, month, takenIds = []) {
  const prefix = buildPrefix(year, month);
  const used = new Set(
    takenIds
      .filter((id) => typeof id === 'string' && id.startsWith(prefix) && id.length === 7)
      .map((id) => id.slice(4))
  );

  const available = [];
  for (let i = 1; i <= 999; i += 1) {
    const suffix = String(i).padStart(3, '0');
    if (!used.has(suffix)) available.push(suffix);
  }

  if (!available.length) {
    throw ApiError.conflict(
      `All 999 employee IDs for ${prefix} are already used. Pick a different joining month.`
    );
  }

  return `${prefix}${available[randomInt(available.length)]}`;
}

function isValidEmployeeId(value) {
  return typeof value === 'string' && /^\d{7}$/.test(value);
}

module.exports = { generateEmployeeId, buildPrefix, isValidEmployeeId };
