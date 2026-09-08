'use strict';

const { app, request, createAdmin, createOperator, login } = require('./helpers');
const AuditLog = require('../src/models/AuditLog');
const User = require('../src/models/User');

describe('Authentication', () => {
  it('signs an admin in and returns full permissions', async () => {
    await createAdmin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@12345' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('admin');
    // Admin implicitly holds every permission and can never be restricted.
    expect(res.body.user.permissions.canEditDpr).toBe(true);
    expect(res.body.user.permissions.canViewSensitive).toBe(true);
  });

  it('is case-insensitive on the login ID', async () => {
    await createAdmin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ADMIN', password: 'Admin@12345' });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong password and records the attempt', async () => {
    await createAdmin();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);

    const log = await AuditLog.findOne({ action: 'LOGIN_FAILED' });
    expect(log).toBeTruthy();
  });

  it('blocks a disabled operator login', async () => {
    const operator = await createOperator({ canEnterDpr: true }, { username: 'op_disabled' });
    operator.isActive = false;
    await operator.save();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'op_disabled', password: 'Operator@123' });

    expect(res.status).toBe(403);
  });

  it('rejects protected routes without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    await createAdmin();
    const token = await login('admin', 'Admin@12345');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('admin');
  });

  it('lets a user change their own password', async () => {
    await createAdmin();
    const token = await login('admin', 'Admin@12345');

    const bad = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'nope', newPassword: 'NewPass@123' });
    expect(bad.status).toBe(400);

    const good = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Admin@12345', newPassword: 'NewPass@123' });
    expect(good.status).toBe(200);

    expect(await login('admin', 'NewPass@123')).toBeTruthy();
  });

  it('enforces the configured password policy', async () => {
    await createAdmin();
    const token = await login('admin', 'Admin@12345');
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Admin@12345', newPassword: 'nodigits' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/number/i);
  });

  describe('admin lockout recovery', () => {
    it('completes the OTP reset flow', async () => {
      await createAdmin({ email: 'boss@tradingengineers.com' });

      const forgot = await request(app)
        .post('/api/auth/forgot-password')
        .send({ identifier: 'boss@tradingengineers.com' });

      expect(forgot.status).toBe(200);
      // SMTP is not configured in tests, so the code is returned for verification.
      const otp = forgot.body.devOtp;
      expect(otp).toMatch(/^\d{6}$/);

      const wrong = await request(app)
        .post('/api/auth/reset-password')
        .send({ identifier: 'admin', otp: '000000', newPassword: 'Recovered@123' });
      expect(wrong.status).toBe(400);

      const reset = await request(app)
        .post('/api/auth/reset-password')
        .send({ identifier: 'admin', otp, newPassword: 'Recovered@123' });
      expect(reset.status).toBe(200);

      expect(await login('admin', 'Recovered@123')).toBeTruthy();

      // The one-time code cannot be replayed.
      const replay = await request(app)
        .post('/api/auth/reset-password')
        .send({ identifier: 'admin', otp, newPassword: 'Another@123' });
      expect(replay.status).toBe(400);
    });

    it('never reveals whether an account exists', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ identifier: 'nobody@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.devOtp).toBeUndefined();
    });

    it('does not offer recovery for operator accounts', async () => {
      await createOperator({}, { username: 'op_recovery' });
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ identifier: 'op_recovery' });
      expect(res.status).toBe(200);
      expect(res.body.devOtp).toBeUndefined(); // only admins have the email recovery path
    });
  });

  it('stores passwords hashed, never in plain text', async () => {
    await createAdmin();
    const user = await User.findOne({ username: 'admin' }).select('+passwordHash');
    expect(user.passwordHash).not.toContain('Admin@12345');
    expect(user.passwordHash.startsWith('$2')).toBe(true);
  });
});
