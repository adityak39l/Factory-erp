'use strict';

const {
  app,
  request,
  createAdmin,
  login,
  seedMasters,
  createEmployee,
  todayIso,
} = require('./helpers');
const Employee = require('../src/models/Employee');
const Shift = require('../src/models/Shift');
const AuditLog = require('../src/models/AuditLog');

let masters;
let adminToken;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  masters = await seedMasters();
  await createAdmin();
  adminToken = await login('admin', 'Admin@12345');
});

describe('Employee registration', () => {
  const base = () => ({
    name: 'Rahul Sharma',
    designation: 'Welder',
    fathersName: 'Ram Sharma',
    mobileNo: '9876543210',
    department: String(masters.welding._id),
    joiningDate: '2026-08-01',
  });

  it('generates a YYMM + 3-digit employee ID from the joining month', async () => {
    const res = await request(app).post('/api/employees').set(auth(adminToken)).send(base());

    expect(res.status).toBe(201);
    expect(res.body.employee.employeeId).toMatch(/^2608\d{3}$/);
    expect(res.body.employee.status).toBe('Active');
  });

  it('honours an explicitly selected joining year and month', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set(auth(adminToken))
      .send({ ...base(), joiningDate: '2026-08-01', joiningYear: 2027, joiningMonth: 3 });

    expect(res.body.employee.employeeId).toMatch(/^2703\d{3}$/);
  });

  it('never issues the same ID twice in a month', async () => {
    const ids = new Set();
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/employees')
        .set(auth(adminToken))
        .send({ ...base(), name: `Worker ${i}`, mobileNo: '' });
      expect(res.status).toBe(201);
      ids.add(res.body.employee.employeeId);
    }
    expect(ids.size).toBe(12);
  });

  it('forces Contract employees to have no shift', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set(auth(adminToken))
      .send({ ...base(), name: 'Contract Welder', employeeType: 'Contract', shiftCategory: 'Day' });

    expect(res.body.employee.employeeType).toBe('Contract');
    expect(res.body.employee.shiftCategory).toBe('Not Applicable');
  });

  it('defaults requiresWorkQty from the department (support departments opt out)', async () => {
    const production = await request(app).post('/api/employees').set(auth(adminToken)).send(base());
    expect(production.body.employee.requiresWorkQty).toBe(true);

    const guard = await request(app)
      .post('/api/employees')
      .set(auth(adminToken))
      .send({ ...base(), name: 'Anand Guard', mobileNo: '', department: String(masters.support._id) });
    expect(guard.body.employee.requiresWorkQty).toBe(false);
  });

  it('validates mobile, email, Aadhar and IFSC formats', async () => {
    const cases = [
      { mobileNo: '12345' },
      { email: 'not-an-email' },
      { aadharNo: '123' },
      { ifsc: 'BADCODE' },
    ];
    for (const patch of cases) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/employees')
        .set(auth(adminToken))
        .send({ ...base(), ...patch });
      expect(res.status).toBe(400);
    }
  });

  it('rejects a team that belongs to another department', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set(auth(adminToken))
      .send({ ...base(), department: String(masters.painting._id), team: String(masters.teamA._id) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/team/i);
  });
});

describe('Employee lifecycle', () => {
  it('hides Inactive employees from the DPR search but keeps them findable', async () => {
    const active = await createEmployee({ name: 'Active Person', department: masters.painting._id });
    const inactive = await createEmployee({
      name: 'Inactive Person',
      department: masters.painting._id,
      status: 'Inactive',
    });

    const search = await request(app).get('/api/employees/search?q=Person').set(auth(adminToken));
    const names = search.body.employees.map((e) => e.name);
    expect(names).toContain('Active Person');
    expect(names).not.toContain('Inactive Person');

    const list = await request(app).get('/api/employees?status=Inactive').set(auth(adminToken));
    expect(list.body.employees.map((e) => e.name)).toContain('Inactive Person');

    const all = await request(app).get('/api/employees?status=All').set(auth(adminToken));
    expect(all.body.employees).toHaveLength(2);
    expect(active && inactive).toBeTruthy();
  });

  it('records a status change in the audit trail', async () => {
    const employee = await createEmployee({ name: 'Leaver', department: masters.painting._id });

    await request(app)
      .patch(`/api/employees/${employee._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'Inactive', reason: 'Resigned' });

    const log = await AuditLog.findOne({ action: 'STATUS_CHANGE', entity: 'Employee' });
    expect(log).toBeTruthy();
    expect(log.after.status).toBe('Inactive');
  });

  it('preserves DPR history when the department changes', async () => {
    const employee = await createEmployee({ name: 'Mover', department: masters.welding._id });

    await request(app)
      .post('/api/dpr')
      .set(auth(adminToken))
      .send({ employee: String(employee._id), date: todayIso(), inTime: '09:00', outTime: '18:00' });

    await request(app)
      .put(`/api/employees/${employee._id}`)
      .set(auth(adminToken))
      .send({ department: String(masters.painting._id), team: null });

    const DprEntry = require('../src/models/DprEntry');
    const entry = await DprEntry.findOne({ employee: employee._id });
    // The entry keeps the department it was recorded against.
    expect(entry.departmentName).toBe('Welding');

    const fresh = await Employee.findById(employee._id);
    expect(String(fresh.department)).toBe(String(masters.painting._id));
  });
});

describe('Bulk import', () => {
  const csv = [
    'name,designation,mobileNo,department,employeeType,shiftCategory,joiningDate',
    'Valid Person,Welder,9876500101,Welding,Permanent,Day,2026-08-01',
    'Bad Department,Fitter,9876500102,Nonexistent,Permanent,Day,2026-08-01',
    'Bad Mobile,Fitter,123,Painting,Permanent,Day,2026-08-01',
    ',Missing Name,9876500103,Painting,Permanent,Day,2026-08-01',
    'Duplicate Mobile,Fitter,9876500101,Painting,Permanent,Day,2026-08-01',
  ].join('\n');

  it('validates every row and flags the problems precisely', async () => {
    const res = await request(app)
      .post('/api/employees/import/validate')
      .set(auth(adminToken))
      .attach('file', Buffer.from(csv), 'employees.csv');

    expect(res.status).toBe(200);
    expect(res.body.summary.total).toBe(5);
    expect(res.body.summary.valid).toBe(1);

    const errors = res.body.rows.flatMap((r) => r.errors);
    expect(errors.join(' ')).toMatch(/Department "Nonexistent" does not exist/);
    expect(errors.join(' ')).toMatch(/Mobile number/);
    expect(errors.join(' ')).toMatch(/Name is required/);
    expect(errors.join(' ')).toMatch(/Duplicate mobile number inside this file/);
  });

  it('imports only the valid rows', async () => {
    const validated = await request(app)
      .post('/api/employees/import/validate')
      .set(auth(adminToken))
      .attach('file', Buffer.from(csv), 'employees.csv');

    const res = await request(app)
      .post('/api/employees/import/confirm')
      .set(auth(adminToken))
      .send({ rows: validated.body.rows.filter((r) => r.valid).map((r) => r.data) });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(await Employee.countDocuments()).toBe(1);

    const created = await Employee.findOne();
    expect(created.name).toBe('Valid Person');
    expect(created.employeeId).toMatch(/^2608\d{3}$/);
  });

  it('offers a downloadable template', async () => {
    const res = await request(app).get('/api/employees/import/template').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.text).toContain('name,designation');
  });
});

describe('Shift configuration', () => {
  it('creates a new dated version instead of rewriting history', async () => {
    const before = await Shift.findOne({ name: 'Day', isCurrent: true });
    expect(before.startTime).toBe('09:15');

    const res = await request(app)
      .put('/api/masters/shifts')
      .set(auth(adminToken))
      .send({ name: 'Day', startTime: '09:00', endTime: '18:00', effectiveFrom: todayIso() });

    expect(res.status).toBe(200);

    const current = await Shift.findOne({ name: 'Day', isCurrent: true });
    expect(current.startTime).toBe('09:00');

    // The previous version is retained so older DPRs still resolve correctly.
    const versions = await Shift.find({ name: 'Day' });
    expect(versions).toHaveLength(2);
    expect(versions.filter((v) => v.isCurrent)).toHaveLength(1);
  });

  it('rejects identical start and end times', async () => {
    const res = await request(app)
      .put('/api/masters/shifts')
      .set(auth(adminToken))
      .send({ name: 'Day', startTime: '09:00', endTime: '09:00' });
    expect(res.status).toBe(400);
  });
});

describe('Departments and holidays', () => {
  it('will not archive a department that still has active employees', async () => {
    await createEmployee({ name: 'Still Assigned', department: masters.painting._id });

    const res = await request(app)
      .delete(`/api/masters/departments/${masters.painting._id}`)
      .set(auth(adminToken));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/active employee/i);
  });

  it('will not declare a holiday on a date that already has DPR entries', async () => {
    const employee = await createEmployee({ name: 'Worked Today', department: masters.painting._id });
    await request(app)
      .post('/api/dpr')
      .set(auth(adminToken))
      .send({ employee: String(employee._id), date: todayIso(), inTime: '09:00' });

    const res = await request(app)
      .post('/api/masters/holidays')
      .set(auth(adminToken))
      .send({ date: todayIso(), description: 'Surprise holiday' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/DPR entries already exist/i);
  });

  it('only allows teams in departments configured for them', async () => {
    const res = await request(app)
      .post('/api/masters/teams')
      .set(auth(adminToken))
      .send({ name: 'Team X', department: String(masters.painting._id) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not configured to use teams/i);
  });
});

describe('Reports', () => {
  it('produces a DPR register and an attendance summary', async () => {
    const employee = await createEmployee({ name: 'Reported Worker', department: masters.welding._id });
    await request(app)
      .post('/api/dpr')
      .set(auth(adminToken))
      .send({
        employee: String(employee._id),
        date: todayIso(),
        inTime: '09:15',
        outTime: '19:15',
        workDescription: 'Pole plates',
        qty: 25,
      });

    const dpr = await request(app)
      .get(`/api/reports/dpr?from=${todayIso()}&to=${todayIso()}`)
      .set(auth(adminToken));

    expect(dpr.status).toBe(200);
    expect(dpr.body.rows).toHaveLength(1);
    expect(dpr.body.totals.totalHours).toBe(10);
    expect(dpr.body.totals.overtime).toBe(1);
    expect(dpr.body.totals.quantity).toBe(25);

    const attendance = await request(app)
      .get(`/api/reports/attendance?from=${todayIso()}&to=${todayIso()}`)
      .set(auth(adminToken));

    expect(attendance.body.rows[0].presentDays).toBe(1);
    expect(attendance.body.rows[0].dayShiftDays).toBe(1);
  });

  it('exports CSV and Excel files', async () => {
    const employee = await createEmployee({ name: 'Export Worker', department: masters.welding._id });
    await request(app)
      .post('/api/dpr')
      .set(auth(adminToken))
      .send({ employee: String(employee._id), date: todayIso(), inTime: '09:15', outTime: '18:15' });

    const csv = await request(app)
      .get(`/api/reports/export?type=dpr&format=csv&from=${todayIso()}&to=${todayIso()}`)
      .set(auth(adminToken));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/csv/);
    expect(csv.text).toContain('Export Worker');

    const excel = await request(app)
      .get(`/api/reports/export?type=attendance&format=excel&from=${todayIso()}&to=${todayIso()}`)
      .set(auth(adminToken))
      .buffer()
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(excel.status).toBe(200);
    expect(excel.body.length).toBeGreaterThan(1000);

    expect(await AuditLog.countDocuments({ action: 'EXPORT' })).toBe(2);
  });

  it('requires the reporting permission', async () => {
    const { createOperator } = require('./helpers');
    await createOperator({ canEnterDpr: true }, { username: 'no_reports' });
    const token = await login('no_reports', 'Operator@123');

    const res = await request(app)
      .get(`/api/reports/dpr?from=${todayIso()}&to=${todayIso()}`)
      .set(auth(token));
    expect(res.status).toBe(403);
  });
});
