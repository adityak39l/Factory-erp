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
const DprEntry = require('../src/models/DprEntry');
const Holiday = require('../src/models/Holiday');
const AuditLog = require('../src/models/AuditLog');
const { parseDateOnly } = require('../src/utils/dates');

const DPR_ONLY = { canEnterDpr: true };
const DPR_WITH_EDIT = { canEnterDpr: true, canEditDpr: true };

let masters;
let adminToken;
let operatorToken;
let permanentDay;
let contractWorker;

async function setup() {
  masters = await seedMasters();
  await createAdmin();
  adminToken = await login('admin', 'Admin@12345');

  await createOperator(DPR_ONLY, { username: 'dpr_operator' });
  operatorToken = await login('dpr_operator', 'Operator@123');

  permanentDay = await createEmployee({
    name: 'Rahul Sharma',
    department: masters.welding._id,
    team: masters.teamA._id,
    employeeType: 'Permanent',
    shiftCategory: 'Day',
  });

  contractWorker = await createEmployee({
    name: 'Manish Jha',
    department: masters.welding._id,
    employeeType: 'Contract',
  });
}

const save = (token, body) =>
  request(app).post('/api/dpr').set('Authorization', `Bearer ${token}`).send(body);

beforeEach(setup);

describe('Progressive lock-on-save', () => {
  it('saves IN time alone, locks it, and leaves the entry open', async () => {
    const res = await save(operatorToken, {
      employee: String(permanentDay._id),
      date: todayIso(),
      inTime: '09:15',
    });

    expect(res.status).toBe(201);
    expect(res.body.entry.inTime).toBe('09:15');
    expect(res.body.entry.locks.inTime).toBe(true);
    expect(res.body.entry.locks.outTime).toBe(false);
    expect(res.body.entry.locks.workQty).toBe(false);
    expect(res.body.entry.entryStatus).toBe('Open');
    // Nothing derived yet — OUT time has not been recorded.
    expect(res.body.entry.totalHours).toBeNull();
  });

  it('locks OUT time independently, hours later, and computes the figures', async () => {
    await save(operatorToken, { employee: String(permanentDay._id), date: todayIso(), inTime: '09:15' });

    const res = await save(operatorToken, {
      employee: String(permanentDay._id),
      date: todayIso(),
      outTime: '19:15',
    });

    expect(res.status).toBe(200);
    expect(res.body.entry.locks.inTime).toBe(true);
    expect(res.body.entry.locks.outTime).toBe(true);
    expect(res.body.entry.totalHours).toBe(10);
    expect(res.body.entry.overtime).toBe(1); // 10h worked against a 9h day shift
    expect(res.body.entry.shortTime).toBe(0);
    expect(res.body.entry.entryStatus).toBe('Open'); // work details still pending
  });

  it('locks work description + quantity as its own group and completes the entry', async () => {
    const employee = String(permanentDay._id);
    await save(operatorToken, { employee, date: todayIso(), inTime: '09:15' });
    await save(operatorToken, { employee, date: todayIso(), outTime: '18:15' });

    const res = await save(operatorToken, {
      employee,
      date: todayIso(),
      workDescription: 'NNJ pole connection plate',
      qty: 38,
    });

    expect(res.status).toBe(200);
    expect(res.body.entry.locks.workQty).toBe(true);
    expect(res.body.entry.qty).toBe(38);
    expect(res.body.entry.entryStatus).toBe('Completed');
  });

  it('accepts the three groups in any order', async () => {
    const employee = String(permanentDay._id);
    await save(operatorToken, { employee, date: todayIso(), workDescription: 'Grinding', qty: 5 });
    await save(operatorToken, { employee, date: todayIso(), inTime: '09:00' });
    const res = await save(operatorToken, { employee, date: todayIso(), outTime: '18:00' });

    expect(res.body.entry.entryStatus).toBe('Completed');
    expect(res.body.entry.totalHours).toBe(9);
  });

  it('refuses to change a locked IN time for an operator without edit rights', async () => {
    const employee = String(permanentDay._id);
    await save(operatorToken, { employee, date: todayIso(), inTime: '09:15' });

    const res = await save(operatorToken, { employee, date: todayIso(), inTime: '08:00' });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/locked/i);

    const entry = await DprEntry.findOne({ employee: permanentDay._id });
    expect(entry.inTime).toBe('09:15'); // the original clock-in is untouched
  });

  it('refuses to change locked OUT time and locked work details too', async () => {
    const employee = String(permanentDay._id);
    await save(operatorToken, { employee, date: todayIso(), inTime: '09:15', outTime: '18:15' });
    await save(operatorToken, { employee, date: todayIso(), workDescription: 'Plates', qty: 10 });

    const out = await save(operatorToken, { employee, date: todayIso(), outTime: '20:00' });
    expect(out.status).toBe(403);

    const work = await save(operatorToken, { employee, date: todayIso(), qty: 99 });
    expect(work.status).toBe(403);
  });

  it('lets an admin override a locked field and records it in history and audit', async () => {
    const employee = String(permanentDay._id);
    await save(operatorToken, { employee, date: todayIso(), inTime: '09:15' });

    const res = await save(adminToken, {
      employee,
      date: todayIso(),
      inTime: '08:45',
      reason: 'Corrected from the gate register',
    });

    expect(res.status).toBe(200);
    expect(res.body.entry.inTime).toBe('08:45');
    expect(res.body.overriddenGroups).toContain('inTime');

    const entry = await DprEntry.findOne({ employee: permanentDay._id });
    const history = entry.editHistory.find((h) => h.fieldGroup === 'inTime' && h.wasLocked);
    expect(history).toBeTruthy();
    expect(history.previousValue).toBe('09:15');
    expect(history.newValue).toBe('08:45');
    expect(history.reason).toBe('Corrected from the gate register');

    const audit = await AuditLog.findOne({ action: 'LOCK_OVERRIDE' });
    expect(audit).toBeTruthy();
  });

  it('lets an operator granted edit rights override a lock', async () => {
    await createOperator(DPR_WITH_EDIT, { username: 'senior_operator' });
    const seniorToken = await login('senior_operator', 'Operator@123');
    const employee = String(permanentDay._id);

    await save(operatorToken, { employee, date: todayIso(), inTime: '09:15' });
    const res = await save(seniorToken, { employee, date: todayIso(), inTime: '09:05' });

    expect(res.status).toBe(200);
    expect(res.body.entry.inTime).toBe('09:05');
  });

  it('re-saving the same value is a no-op rather than an error', async () => {
    const employee = String(permanentDay._id);
    await save(operatorToken, { employee, date: todayIso(), inTime: '09:15' });
    const res = await save(operatorToken, { employee, date: todayIso(), inTime: '09:15' });
    expect(res.status).toBe(200);
    expect(res.body.changedGroups).toHaveLength(0);
  });

  it('requires IN time before OUT time', async () => {
    const res = await save(operatorToken, {
      employee: String(permanentDay._id),
      date: todayIso(),
      outTime: '18:15',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/IN time/i);
  });

  it('keeps one entry per employee per date', async () => {
    const employee = String(permanentDay._id);
    await save(operatorToken, { employee, date: todayIso(), inTime: '09:15' });
    await save(operatorToken, { employee, date: todayIso(), outTime: '18:15' });

    const count = await DprEntry.countDocuments({ employee: permanentDay._id, date: parseDateOnly(todayIso()) });
    expect(count).toBe(1);
  });
});

describe('Permanent vs Contract calculation', () => {
  it('gives a Contract employee total hours with no overtime or short time', async () => {
    const res = await save(operatorToken, {
      employee: String(contractWorker._id),
      date: todayIso(),
      inTime: '10:10',
      outTime: '18:15',
    });

    expect(res.status).toBe(201);
    expect(res.body.entry.employeeType).toBe('Contract');
    expect(res.body.entry.shiftName).toBeNull();
    expect(res.body.entry.totalHours).toBe(8.08);
    expect(res.body.entry.overtime).toBeNull();
    expect(res.body.entry.shortTime).toBeNull();
  });

  it('computes short time for a Permanent employee leaving early', async () => {
    const res = await save(operatorToken, {
      employee: String(permanentDay._id),
      date: todayIso(),
      inTime: '08:49',
      outTime: '13:00',
    });

    expect(res.body.entry.totalHours).toBe(4.18);
    expect(res.body.entry.shortTime).toBe(4.82);
    expect(res.body.entry.overtime).toBe(0);
  });
});

describe('Shifts', () => {
  it('handles a night shift that crosses midnight as one continuous shift', async () => {
    const nightWorker = await createEmployee({
      name: 'Mohit Yadav',
      department: masters.cutting?._id || masters.painting._id,
      shiftCategory: 'Night',
    });

    const res = await save(operatorToken, {
      employee: String(nightWorker._id),
      date: todayIso(),
      shiftName: 'Night',
      inTime: '18:10',
      outTime: '02:22',
    });

    expect(res.status).toBe(201);
    expect(res.body.entry.shiftName).toBe('Night');
    expect(res.body.entry.totalHours).toBe(8.2); // not negative, not 15.8
    expect(res.body.entry.shortTime).toBe(0.3); // against the 8h30m night shift
  });

  it('lets the same employee work a different shift on a given day', async () => {
    const res = await save(operatorToken, {
      employee: String(permanentDay._id), // default shift is Day
      date: todayIso(),
      shiftName: 'Night',
      inTime: '18:00',
      outTime: '02:30',
    });

    expect(res.body.entry.shiftName).toBe('Night');
    expect(res.body.entry.totalHours).toBe(8.5);
    expect(res.body.entry.overtime).toBe(0);
  });
});

describe('Holidays and date rules', () => {
  it('blocks DPR entry on a declared holiday', async () => {
    await Holiday.create({ date: parseDateOnly(todayIso()), description: 'Diwali' });

    const res = await save(operatorToken, {
      employee: String(permanentDay._id),
      date: todayIso(),
      inTime: '09:15',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/holiday/i);
  });

  it('blocks future dates', async () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 3);

    const res = await save(operatorToken, {
      employee: String(permanentDay._id),
      date: future.toISOString().slice(0, 10),
      inTime: '09:15',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/future/i);
  });

  it('blocks entries before the employee joined', async () => {
    const newJoiner = await createEmployee({
      name: 'Late Joiner',
      department: masters.painting._id,
      joiningDate: new Date(Date.now() + 0),
    });
    newJoiner.joiningDate = parseDateOnly(new Date());
    await newJoiner.save();

    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 2);

    const res = await save(operatorToken, {
      employee: String(newJoiner._id),
      date: yesterday.toISOString().slice(0, 10),
      inTime: '09:15',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/joined/i);
  });
});

describe('Inactive employees', () => {
  it('cannot be added to the DPR', async () => {
    const leaver = await createEmployee({
      name: 'Former Employee',
      department: masters.painting._id,
      status: 'Inactive',
    });

    const res = await save(operatorToken, {
      employee: String(leaver._id),
      date: todayIso(),
      inTime: '09:15',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/inactive/i);
  });
});

describe('Helper cross-assignment', () => {
  it('lets a helper-pool employee be logged against another department for the day', async () => {
    const helper = await createEmployee({
      name: 'Abhishek Kushwaha',
      department: masters.helper._id,
    });

    const res = await save(operatorToken, {
      employee: String(helper._id),
      date: todayIso(),
      workingDepartment: String(masters.painting._id),
      inTime: '09:00',
      outTime: '18:00',
    });

    expect(res.status).toBe(201);
    expect(res.body.entry.workingDepartment).toBe('Painting');
    expect(res.body.entry.department).toBe('Helper'); // home department is preserved
    expect(res.body.entry.isCrossAssigned).toBe(true);
  });

  it('refuses cross-assignment for a regular department employee', async () => {
    const res = await save(operatorToken, {
      employee: String(permanentDay._id), // Welding, not a helper pool
      date: todayIso(),
      workingDepartment: String(masters.painting._id),
      inTime: '09:00',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/helper/i);
  });
});

describe('Bulk entry', () => {
  it('saves many rows and applies the same locking rules', async () => {
    const second = await createEmployee({ name: 'Second Worker', department: masters.painting._id });

    const res = await request(app)
      .post('/api/dpr/bulk')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        date: todayIso(),
        entries: [
          { employee: String(permanentDay._id), inTime: '09:10' },
          { employee: String(second._id), inTime: '09:20', outTime: '18:20' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.savedCount).toBe(2);

    const entry = await DprEntry.findOne({ employee: permanentDay._id });
    expect(entry.locks.inTime).toBe(true);

    // A second bulk pass may not silently rewrite a locked value.
    const retry = await request(app)
      .post('/api/dpr/bulk')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ date: todayIso(), entries: [{ employee: String(permanentDay._id), inTime: '07:00' }] });

    expect(retry.body.failedCount).toBe(1);
    expect(retry.body.failed[0].message).toMatch(/locked/i);

    const unchanged = await DprEntry.findOne({ employee: permanentDay._id });
    expect(unchanged.inTime).toBe('09:10');
  });
});

describe('Validation', () => {
  it('rejects a malformed time', async () => {
    const res = await save(operatorToken, {
      employee: String(permanentDay._id),
      date: todayIso(),
      inTime: '25:99',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a negative quantity', async () => {
    const res = await save(operatorToken, {
      employee: String(permanentDay._id),
      date: todayIso(),
      workDescription: 'Plates',
      qty: -5,
    });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown employee id format', async () => {
    const res = await save(operatorToken, { employee: 'not-an-id', date: todayIso(), inTime: '09:00' });
    expect(res.status).toBe(400);
  });
});

describe('Deletion', () => {
  it('is admin-only and audited', async () => {
    await save(operatorToken, { employee: String(permanentDay._id), date: todayIso(), inTime: '09:15' });
    const entry = await DprEntry.findOne({ employee: permanentDay._id });

    const denied = await request(app)
      .delete(`/api/dpr/${entry._id}`)
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .delete(`/api/dpr/${entry._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(allowed.status).toBe(200);

    expect(await DprEntry.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: 'DELETE', entity: 'DprEntry' })).toBe(1);
  });
});
