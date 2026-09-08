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
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');

let masters;
let adminToken;
let employee;

beforeEach(async () => {
  masters = await seedMasters();
  await createAdmin();
  adminToken = await login('admin', 'Admin@12345');
  employee = await createEmployee({ name: 'Rahul Sharma', department: masters.welding._id });
});

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('Backend permission enforcement', () => {
  it('blocks an operator with no permissions from every write action', async () => {
    await createOperator({}, { username: 'no_rights' });
    const token = await login('no_rights', 'Operator@123');

    const dpr = await request(app)
      .post('/api/dpr')
      .set(auth(token))
      .send({ employee: String(employee._id), date: todayIso(), inTime: '09:00' });
    expect(dpr.status).toBe(403);

    const create = await request(app)
      .post('/api/employees')
      .set(auth(token))
      .send({ name: 'New Person', department: String(masters.welding._id), joiningDate: '2026-08-01' });
    expect(create.status).toBe(403);

    const dept = await request(app)
      .post('/api/masters/departments')
      .set(auth(token))
      .send({ name: 'Sneaky Department' });
    expect(dept.status).toBe(403);

    const reports = await request(app).get('/api/reports/dpr?from=2026-08-01&to=2026-08-31').set(auth(token));
    expect(reports.status).toBe(403);
  });

  it('allows exactly what is ticked, and nothing more', async () => {
    await createOperator({ canRegisterEmployee: true }, { username: 'registrar' });
    const token = await login('registrar', 'Operator@123');

    const create = await request(app)
      .post('/api/employees')
      .set(auth(token))
      .send({ name: 'Fresh Hire', department: String(masters.welding._id), joiningDate: '2026-08-01' });
    expect(create.status).toBe(201);

    // Registering is allowed; entering DPR is not.
    const dpr = await request(app)
      .post('/api/dpr')
      .set(auth(token))
      .send({ employee: String(employee._id), date: todayIso(), inTime: '09:00' });
    expect(dpr.status).toBe(403);
  });

  it('applies a permission change immediately, without a new login', async () => {
    const operator = await createOperator({}, { username: 'promoted' });
    const token = await login('promoted', 'Operator@123');

    const before = await request(app)
      .post('/api/dpr')
      .set(auth(token))
      .send({ employee: String(employee._id), date: todayIso(), inTime: '09:00' });
    expect(before.status).toBe(403);

    await request(app)
      .put(`/api/operators/${operator._id}/permissions`)
      .set(auth(adminToken))
      .send({ permissions: { canEnterDpr: true } });

    const after = await request(app)
      .post('/api/dpr')
      .set(auth(token))
      .send({ employee: String(employee._id), date: todayIso(), inTime: '09:00' });
    expect(after.status).toBe(201);
  });

  it('keeps operator management admin-only', async () => {
    await createOperator({ canRegisterEmployee: true, canEnterDpr: true }, { username: 'busy_op' });
    const token = await login('busy_op', 'Operator@123');

    expect((await request(app).get('/api/operators').set(auth(token))).status).toBe(403);
    expect(
      (await request(app).post('/api/operators').set(auth(token)).send({
        username: 'ghost',
        name: 'Ghost Operator',
        password: 'Ghost@1234',
      })).status
    ).toBe(403);
    expect((await request(app).get('/api/audit').set(auth(token))).status).toBe(403);
  });

  it('never lets an operator escalate their own permissions', async () => {
    const operator = await createOperator({ canEnterDpr: true }, { username: 'climber' });
    const token = await login('climber', 'Operator@123');

    const res = await request(app)
      .put(`/api/operators/${operator._id}/permissions`)
      .set(auth(token))
      .send({ permissions: { canEnterDpr: true, canEditDpr: true, canViewSensitive: true } });

    expect(res.status).toBe(403);
    const fresh = await User.findById(operator._id);
    expect(fresh.permissions.canEditDpr).toBe(false);
  });

  it('refuses to restrict the administrator', async () => {
    const admin = await User.findOne({ role: 'admin' });
    const res = await request(app)
      .put(`/api/operators/${admin._id}/permissions`)
      .set(auth(adminToken))
      .send({ permissions: { canEnterDpr: false } });

    expect(res.status).toBe(400);
    const fresh = await User.findById(admin._id);
    expect(fresh.can('canEnterDpr')).toBe(true);
  });
});

describe('Sensitive data protection', () => {
  beforeEach(async () => {
    await request(app)
      .put(`/api/employees/${employee._id}`)
      .set(auth(adminToken))
      .send({ aadharNo: '123456789012', bankName: 'SBI', accountNo: '50100123456789', ifsc: 'SBIN0001234' });
  });

  it('masks Aadhar and bank details for an operator without the permission', async () => {
    await createOperator({ canEnterDpr: true }, { username: 'plain_op' });
    const token = await login('plain_op', 'Operator@123');

    const res = await request(app).get(`/api/employees/${employee._id}`).set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.employee.sensitive.canView).toBe(false);
    expect(res.body.employee.sensitive.aadharNo).toBe('XXXX XXXX 9012');
    expect(res.body.employee.sensitive.aadharNo).not.toContain('12345678');
    expect(res.body.employee.sensitive.bank.accountNo).toBe('••••••6789');
  });

  it('reveals them to a permitted operator and to the admin', async () => {
    await createOperator({ canViewSensitive: true }, { username: 'trusted_op' });
    const token = await login('trusted_op', 'Operator@123');

    const res = await request(app).get(`/api/employees/${employee._id}`).set(auth(token));
    expect(res.body.employee.sensitive.aadharNo).toBe('123456789012');
    expect(res.body.employee.sensitive.bank.accountNo).toBe('50100123456789');

    const adminRes = await request(app).get(`/api/employees/${employee._id}`).set(auth(adminToken));
    expect(adminRes.body.employee.sensitive.aadharNo).toBe('123456789012');
  });

  it('stores the values encrypted at rest', async () => {
    const Employee = require('../src/models/Employee');
    const raw = await Employee.findById(employee._id).select('+aadharNo +bankDetails.accountNo').lean();
    expect(raw.aadharNo.startsWith('enc:v1:')).toBe(true);
    expect(raw.aadharNo).not.toContain('123456789012');
    expect(raw.bankDetails.accountNo).not.toContain('50100123456789');
  });

  it('blocks an operator without the permission from editing them', async () => {
    await createOperator({ canEditEmployee: true }, { username: 'editor_op' });
    const token = await login('editor_op', 'Operator@123');

    const res = await request(app)
      .put(`/api/employees/${employee._id}`)
      .set(auth(token))
      .send({ aadharNo: '999999999999' });

    expect(res.status).toBe(403);
  });
});

describe('Operator account management', () => {
  it('lets the admin reset a forgotten operator password', async () => {
    const operator = await createOperator({ canEnterDpr: true }, { username: 'forgetful' });

    const res = await request(app)
      .put(`/api/operators/${operator._id}/password`)
      .set(auth(adminToken))
      .send({ newPassword: 'BrandNew@123' });

    expect(res.status).toBe(200);
    expect(await login('forgetful', 'BrandNew@123')).toBeTruthy();
    expect(await AuditLog.countDocuments({ action: 'PASSWORD_RESET' })).toBeGreaterThan(0);
  });

  it('lets the admin change an operator login ID', async () => {
    const operator = await createOperator({}, { username: 'old_name' });

    const res = await request(app)
      .put(`/api/operators/${operator._id}`)
      .set(auth(adminToken))
      .send({ username: 'new_name', name: 'Renamed Operator' });

    expect(res.status).toBe(200);
    expect(await login('new_name', 'Operator@123')).toBeTruthy();
  });

  it('prevents duplicate login IDs', async () => {
    await createOperator({}, { username: 'taken_name' });
    const res = await request(app).post('/api/operators').set(auth(adminToken)).send({
      username: 'taken_name',
      name: 'Impostor',
      password: 'Another@123',
    });
    expect(res.status).toBe(409);
  });

  it('disables rather than deletes an operator', async () => {
    const operator = await createOperator({}, { username: 'departing' });
    const res = await request(app).delete(`/api/operators/${operator._id}`).set(auth(adminToken));

    expect(res.status).toBe(200);
    const fresh = await User.findById(operator._id);
    expect(fresh).toBeTruthy(); // record kept for the audit trail
    expect(fresh.isActive).toBe(false);
  });
});
