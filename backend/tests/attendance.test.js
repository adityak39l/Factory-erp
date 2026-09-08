'use strict';

const {
  app,
  request,
  createAdmin,
  createOperator,
  login,
  seedMasters,
  createEmployee,
  todayIso,
} = require('./helpers');
const Holiday = require('../src/models/Holiday');
const DprEntry = require('../src/models/DprEntry');
const Employee = require('../src/models/Employee');
const { parseDateOnly } = require('../src/utils/dates');
const { missingGroupsFor, deriveWorkingStatus } = require('../src/services/attendanceService');

let masters;
let adminToken;
let operatorToken;
let operator;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  masters = await seedMasters();
  await createAdmin();
  adminToken = await login('admin', 'Admin@12345');
  operator = await createOperator({ canEnterDpr: true }, { username: 'dpr_op' });
  operatorToken = await login('dpr_op', 'Operator@123');
});

describe('Automatic absence inference', () => {
  it('marks an active employee with no entry as Absent', async () => {
    await createEmployee({ name: 'Absent Person', department: masters.painting._id });

    const res = await request(app)
      .get(`/api/dpr/control-center?date=${todayIso()}`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    const row = res.body.rows.find((r) => r.employee.name === 'Absent Person');
    expect(row.status).toBe('Absent');
    expect(row.entry).toBeNull();
    expect(res.body.summary.absent).toBe(1);
  });

  it('marks the day Holiday for everyone when one is declared', async () => {
    await createEmployee({ name: 'Anyone', department: masters.painting._id });
    await Holiday.create({ date: parseDateOnly(todayIso()), description: 'Holi' });

    const res = await request(app)
      .get(`/api/dpr/control-center?date=${todayIso()}`)
      .set(auth(adminToken));

    expect(res.body.summary.isHoliday).toBe(true);
    expect(res.body.summary.holidayLabel).toBe('Holi');
    expect(res.body.rows[0].status).toBe('Holiday');
  });

  it('excludes Inactive employees from the live screen entirely', async () => {
    await createEmployee({ name: 'Still Here', department: masters.painting._id });
    await createEmployee({
      name: 'Already Left',
      department: masters.painting._id,
      status: 'Inactive',
      inactiveSince: parseDateOnly(todayIso()),
    });

    const res = await request(app)
      .get(`/api/dpr/control-center?date=${todayIso()}`)
      .set(auth(adminToken));

    const names = res.body.rows.map((r) => r.employee.name);
    expect(names).toContain('Still Here');
    expect(names).not.toContain('Already Left');
    // An employee who has left never accrues further absence.
    expect(res.body.summary.absent).toBe(1);
  });

  it('does not count an employee before their joining date', async () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 5);
    const joiner = await createEmployee({ name: 'Future Joiner', department: masters.painting._id });
    joiner.joiningDate = parseDateOnly(future);
    await joiner.save();

    const res = await request(app)
      .get(`/api/dpr/control-center?date=${todayIso()}`)
      .set(auth(adminToken));

    expect(res.body.rows.map((r) => r.employee.name)).not.toContain('Future Joiner');
  });
});

describe('Missing information rules', () => {
  const dayShift = { shiftStartTime: '09:15', shiftEndTime: '18:15' };
  const date = parseDateOnly(todayIso());

  const entry = (overrides) => ({
    date,
    requiresWorkQty: true,
    ...dayShift,
    ...overrides,
  });

  it('never reports an employee with no IN time (that is Absence, not incompleteness)', () => {
    const result = missingGroupsFor(entry({ inTime: null, outTime: null }), {
      now: new Date(`${todayIso()}T20:00:00Z`),
    });
    expect(result).toEqual([]);
  });

  it('does not report a missing OUT time before the shift has ended', () => {
    const result = missingGroupsFor(entry({ inTime: '09:15', outTime: null, workDescription: 'Plates' }), {
      now: new Date(`${todayIso()}T13:00:00Z`),
    });
    expect(result).toEqual([]);
  });

  it('reports a missing OUT time once the shift end has passed', () => {
    const result = missingGroupsFor(entry({ inTime: '09:15', outTime: null, workDescription: 'Plates' }), {
      now: new Date(`${todayIso()}T19:00:00Z`),
    });
    expect(result).toEqual(['outTime']);
  });

  it('reports missing work details for a production role', () => {
    const result = missingGroupsFor(entry({ inTime: '09:15', outTime: '18:15', workDescription: '' }), {
      now: new Date(`${todayIso()}T19:00:00Z`),
    });
    expect(result).toEqual(['workQty']);
  });

  it('never reports work details for a support role (guard, cook, sweeper)', () => {
    const result = missingGroupsFor(
      entry({ inTime: '09:15', outTime: '18:15', workDescription: '', requiresWorkQty: false }),
      { now: new Date(`${todayIso()}T19:00:00Z`) }
    );
    expect(result).toEqual([]);
  });

  it('derives the live working status from DPR data alone', () => {
    const midShift = { now: new Date(`${todayIso()}T13:00:00Z`) };
    expect(deriveWorkingStatus(null, midShift)).toBe('Absent');
    expect(deriveWorkingStatus(entry({ inTime: '09:15', outTime: null }), midShift)).toBe('Working');
    expect(
      deriveWorkingStatus(entry({ inTime: '09:15', outTime: '18:15', workDescription: 'Plates' }), midShift)
    ).toBe('Completed');
    expect(
      deriveWorkingStatus(entry({ inTime: '09:15', outTime: null }), {
        now: new Date(`${todayIso()}T21:00:00Z`),
      })
    ).toBe('Incomplete');
  });
});

describe('Operator personal workspace', () => {
  it('lists only the entries that operator recorded, and only real gaps', async () => {
    const [a, b, c] = await Promise.all([
      createEmployee({ name: 'Worker A', department: masters.painting._id }),
      createEmployee({ name: 'Worker B', department: masters.painting._id }),
      createEmployee({ name: 'Guard C', department: masters.support._id, requiresWorkQty: false }),
    ]);

    const save = (body) =>
      request(app).post('/api/dpr').set(auth(operatorToken)).send({ date: todayIso(), ...body });

    await save({ employee: String(a._id), inTime: '09:00' }); // OUT + work pending
    await save({ employee: String(b._id), inTime: '09:00', outTime: '18:00', workDescription: 'Plates', qty: 5 }); // complete
    await save({ employee: String(c._id), inTime: '09:00', outTime: '18:00' }); // guard: complete, no work expected

    // Another operator's entry must not appear in this operator's list.
    await createOperator({ canEnterDpr: true }, { username: 'other_op' });
    const otherToken = await login('other_op', 'Operator@123');
    const d = await createEmployee({ name: 'Worker D', department: masters.painting._id });
    await request(app)
      .post('/api/dpr')
      .set(auth(otherToken))
      .send({ date: todayIso(), employee: String(d._id), inTime: '09:00' });

    // Force the shift to be over so the OUT gap is reportable.
    await DprEntry.updateMany({}, { $set: { shiftStartTime: '01:00', shiftEndTime: '02:00' } });

    const res = await request(app)
      .get(`/api/dpr/my-workspace?date=${todayIso()}`)
      .set(auth(operatorToken));

    expect(res.status).toBe(200);
    const names = res.body.items.map((i) => i.employeeName);
    expect(names).toContain('Worker A');
    expect(names).not.toContain('Worker B'); // complete
    expect(names).not.toContain('Guard C'); // support role, nothing missing
    expect(names).not.toContain('Worker D'); // belongs to another operator
    expect(res.body.handledToday).toBe(3);
  });
});

describe('Monthly employee history', () => {
  it('splits totals by Day and Night shift for a Permanent employee', async () => {
    const employee = await createEmployee({ name: 'Ankit Verma', department: masters.welding._id });
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    // Two day-shift days and one night-shift day, written directly for determinism.
    const mkEntry = (day, shift, inT, outT, hours, ot) => ({
      date: new Date(Date.UTC(year, month - 1, day)),
      employee: employee._id,
      employeeIdCode: employee.employeeId,
      employeeName: employee.name,
      employeeType: 'Permanent',
      department: masters.welding._id,
      workingDepartment: masters.welding._id,
      shiftName: shift,
      shiftStartTime: shift === 'Day' ? '09:15' : '18:00',
      shiftEndTime: shift === 'Day' ? '18:15' : '02:30',
      inTime: inT,
      outTime: outT,
      totalHours: hours,
      overtime: ot,
      shortTime: 0,
      workDescription: 'Welding',
      qty: 10,
      requiresWorkQty: true,
      entryStatus: 'Completed',
      enteredBy: operator._id,
    });

    await DprEntry.create([
      mkEntry(1, 'Day', '09:15', '18:15', 9, 0),
      mkEntry(2, 'Day', '09:15', '19:15', 10, 1),
      mkEntry(3, 'Night', '18:00', '03:00', 9, 0.5),
    ]);

    const res = await request(app)
      .get(`/api/employees/${employee._id}/attendance?year=${year}&month=${month}`)
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.summary.presentDays).toBe(3);
    expect(res.body.summary.dayShiftDays).toBe(2);
    expect(res.body.summary.nightShiftDays).toBe(1);
    expect(res.body.summary.dayShiftHours).toBe(19);
    expect(res.body.summary.nightShiftHours).toBe(9);
    expect(res.body.summary.totalOvertime).toBe(1.5);
    expect(res.body.days.length).toBeGreaterThanOrEqual(28);
    expect(res.body.days.find((d) => d.date.endsWith('-01')).status).toBe('Present');
  });

  it('keeps the full history of an employee after they are marked Inactive', async () => {
    const employee = await createEmployee({ name: 'Departed Worker', department: masters.painting._id });
    await request(app)
      .post('/api/dpr')
      .set(auth(operatorToken))
      .send({ date: todayIso(), employee: String(employee._id), inTime: '09:00', outTime: '18:00' });

    await request(app)
      .patch(`/api/employees/${employee._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'Inactive', reason: 'Resigned' });

    // The record and its DPR history both survive.
    expect(await Employee.countDocuments({ _id: employee._id })).toBe(1);
    expect(await DprEntry.countDocuments({ employee: employee._id })).toBe(1);

    const history = await request(app)
      .get(`/api/employees/${employee._id}/attendance`)
      .set(auth(adminToken));
    expect(history.status).toBe(200);
    expect(history.body.summary.presentDays).toBe(1);

    // And they can be brought back.
    const reactivated = await request(app)
      .patch(`/api/employees/${employee._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'Active' });
    expect(reactivated.body.employee.status).toBe('Active');
  });
});

describe('Dashboard', () => {
  it('reports live headline figures', async () => {
    const [a, b] = await Promise.all([
      createEmployee({ name: 'Present Worker', department: masters.painting._id }),
      createEmployee({ name: 'Absent Worker', department: masters.painting._id }),
    ]);

    await request(app)
      .post('/api/dpr')
      .set(auth(operatorToken))
      .send({ date: todayIso(), employee: String(a._id), inTime: '09:15', outTime: '19:15' });

    const res = await request(app).get(`/api/dashboard/overview?date=${todayIso()}`).set(auth(adminToken));

    expect(res.status).toBe(200);
    expect(res.body.stats.totalActiveEmployees).toBe(2);
    expect(res.body.stats.present).toBe(1);
    expect(res.body.stats.absent).toBe(1);
    expect(res.body.stats.attendancePercentage).toBe(50);
    expect(res.body.stats.totalHours).toBe(10);
    expect(res.body.stats.totalOvertime).toBe(1);
    expect(res.body.absentees.map((x) => x.name)).toContain('Absent Worker');
    expect(b).toBeTruthy();
  });

  it('finds employees through global search', async () => {
    await createEmployee({ name: 'Searchable Person', department: masters.painting._id, mobileNo: '9876543210' });

    const byName = await request(app).get('/api/dashboard/search?q=Searchable').set(auth(adminToken));
    expect(byName.body.results.employees).toHaveLength(1);

    const byMobile = await request(app).get('/api/dashboard/search?q=9876543210').set(auth(adminToken));
    expect(byMobile.body.results.employees).toHaveLength(1);
  });
});
