'use strict';

const {
  parseTimeToMinutes,
  durationInMinutes,
  shiftDurationMinutes,
  computeDprMetrics,
  hasShiftEnded,
} = require('../src/services/timeCalculation');
const { generateEmployeeId, buildPrefix } = require('../src/services/employeeIdService');
const { encrypt, decrypt, maskAadhar, maskAccount } = require('../src/services/encryption');

const DAY_SHIFT = { startTime: '09:15', endTime: '18:15' }; // 9h 00m
const NIGHT_SHIFT = { startTime: '18:00', endTime: '02:30' }; // 8h 30m

describe('time parsing', () => {
  it('parses single and double digit hours', () => {
    expect(parseTimeToMinutes('09:15')).toBe(555);
    expect(parseTimeToMinutes('9:07')).toBe(547);
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });

  it('rejects invalid values', () => {
    ['24:00', '9:60', 'abc', '', null, undefined, '9', '09-15'].forEach((value) => {
      expect(parseTimeToMinutes(value)).toBeNull();
    });
  });
});

describe('duration and midnight rollover', () => {
  it('computes a normal same-day duration', () => {
    expect(durationInMinutes('09:15', '18:15')).toBe(540);
  });

  it('rolls over midnight for night shifts', () => {
    // Real rows from the client's sheet: 18:10 -> 02:22 and 21:03 -> 03:40
    expect(durationInMinutes('18:10', '02:22')).toBe(492); // 8h 12m
    expect(durationInMinutes('21:03', '03:40')).toBe(397); // 6h 37m
  });

  it('treats an identical in/out time as a full 24 hours rather than zero', () => {
    expect(durationInMinutes('09:00', '09:00')).toBe(1440);
  });

  it('computes scheduled shift durations', () => {
    expect(shiftDurationMinutes(DAY_SHIFT)).toBe(540);
    expect(shiftDurationMinutes(NIGHT_SHIFT)).toBe(510);
  });
});

describe('DPR metrics — Permanent employees', () => {
  it('gives zero overtime and short time for an exact shift', () => {
    const m = computeDprMetrics({ inTime: '09:15', outTime: '18:15', employeeType: 'Permanent', shift: DAY_SHIFT });
    expect(m.totalHours).toBe(9);
    expect(m.overtime).toBe(0);
    expect(m.shortTime).toBe(0);
  });

  it('computes overtime beyond the scheduled shift', () => {
    const m = computeDprMetrics({ inTime: '09:00', outTime: '19:30', employeeType: 'Permanent', shift: DAY_SHIFT });
    expect(m.totalHours).toBe(10.5);
    expect(m.overtime).toBe(1.5);
    expect(m.shortTime).toBe(0);
  });

  it('computes short time for a partial day', () => {
    const m = computeDprMetrics({ inTime: '08:49', outTime: '13:00', employeeType: 'Permanent', shift: DAY_SHIFT });
    expect(m.totalHours).toBe(4.18);
    expect(m.overtime).toBe(0);
    expect(m.shortTime).toBe(4.82);
  });

  it('handles a night shift crossing midnight', () => {
    const m = computeDprMetrics({ inTime: '18:10', outTime: '02:22', employeeType: 'Permanent', shift: NIGHT_SHIFT });
    expect(m.totalHours).toBe(8.2);
    expect(m.shortTime).toBe(0.3); // 8h 12m worked against an 8h 30m shift
    expect(m.overtime).toBe(0);
  });
});

describe('DPR metrics — Contract employees', () => {
  it('reports total hours only, never overtime or short time', () => {
    const m = computeDprMetrics({ inTime: '10:10', outTime: '18:15', employeeType: 'Contract', shift: null });
    expect(m.totalHours).toBe(8.08);
    expect(m.overtime).toBeNull();
    expect(m.shortTime).toBeNull();
    expect(m.otApplicable).toBe(false);
  });

  it('ignores a shift even if one is supplied', () => {
    const m = computeDprMetrics({ inTime: '08:58', outTime: '19:42', employeeType: 'Contract', shift: DAY_SHIFT });
    expect(m.totalHours).toBe(10.73);
    expect(m.overtime).toBeNull();
  });
});

describe('incomplete entries', () => {
  it('returns nulls until both times are present', () => {
    const m = computeDprMetrics({ inTime: '09:00', outTime: null, employeeType: 'Permanent', shift: DAY_SHIFT });
    expect(m.totalHours).toBeNull();
    expect(m.overtime).toBeNull();
  });
});

describe('hasShiftEnded', () => {
  const date = new Date(Date.UTC(2026, 8, 5)); // 2026-09-05

  it('is false during the shift and true after it', () => {
    expect(hasShiftEnded(DAY_SHIFT, date, new Date(Date.UTC(2026, 8, 5, 14, 0)))).toBe(false);
    expect(hasShiftEnded(DAY_SHIFT, date, new Date(Date.UTC(2026, 8, 5, 18, 20)))).toBe(true);
  });

  it('accounts for a night shift ending the next morning', () => {
    // Night shift 18:00 -> 02:30, so at 23:00 the same day it has NOT ended.
    expect(hasShiftEnded(NIGHT_SHIFT, date, new Date(Date.UTC(2026, 8, 5, 23, 0)))).toBe(false);
    expect(hasShiftEnded(NIGHT_SHIFT, date, new Date(Date.UTC(2026, 8, 6, 3, 0)))).toBe(true);
  });
});

describe('employee ID generation', () => {
  it('builds YYMM prefixes', () => {
    expect(buildPrefix(2026, 8)).toBe('2608');
    expect(buildPrefix(2026, 12)).toBe('2612');
    expect(buildPrefix(2030, 1)).toBe('3001');
  });

  it('produces a 7 digit ID with the right prefix', () => {
    const id = generateEmployeeId(2026, 8, []);
    expect(id).toMatch(/^2608\d{3}$/);
  });

  it('never reuses a suffix inside the same month bucket', () => {
    const taken = [];
    for (let i = 0; i < 60; i += 1) {
      const id = generateEmployeeId(2026, 8, taken);
      expect(taken).not.toContain(id);
      taken.push(id);
    }
    expect(new Set(taken).size).toBe(60);
  });

  it('ignores IDs from other months when checking uniqueness', () => {
    const id = generateEmployeeId(2026, 9, ['2608001', '2608002']);
    expect(id.startsWith('2609')).toBe(true);
  });

  it('rejects impossible year/month values', () => {
    expect(() => generateEmployeeId(1999, 8, [])).toThrow();
    expect(() => generateEmployeeId(2026, 13, [])).toThrow();
  });
});

describe('sensitive field encryption', () => {
  it('round-trips a value', () => {
    const cipher = encrypt('123456789012');
    expect(cipher).not.toContain('123456789012');
    expect(cipher.startsWith('enc:v1:')).toBe(true);
    expect(decrypt(cipher)).toBe('123456789012');
  });

  it('does not double-encrypt', () => {
    const once = encrypt('50100123456789');
    expect(encrypt(once)).toBe(once);
  });

  it('masks values for display', () => {
    expect(maskAadhar('123456789012')).toBe('XXXX XXXX 9012');
    expect(maskAccount('50100123456789')).toBe('••••••6789');
  });
});
