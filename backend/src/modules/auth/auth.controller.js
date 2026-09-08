'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Settings = require('../../models/Settings');
const { ApiError, asyncHandler } = require('../../utils/ApiError');
const { signToken } = require('../../middleware/auth');
const { recordAudit } = require('../../services/auditService');
const { sendPasswordResetOtp } = require('../../services/emailService');
const { env } = require('../../config/env');

const OTP_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;

async function assertPasswordPolicy(password) {
  const settings = await Settings.getSettings();
  const { passwordMinLength, passwordRequireNumber, passwordRequireUppercase } = settings.security;
  const problems = [];
  if (password.length < passwordMinLength) {
    problems.push(`Password must be at least ${passwordMinLength} characters`);
  }
  if (passwordRequireNumber && !/\d/.test(password)) {
    problems.push('Password must contain at least one number');
  }
  if (passwordRequireUppercase && !/[A-Z]/.test(password)) {
    problems.push('Password must contain at least one uppercase letter');
  }
  if (problems.length) throw ApiError.badRequest(problems.join('. '));
}

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username: String(username).toLowerCase() }).select(
    '+passwordHash'
  );

  if (!user || !(await user.verifyPassword(password))) {
    await recordAudit({
      req,
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityLabel: String(username),
      note: 'Invalid login ID or password',
    });
    throw ApiError.unauthorized('Invalid login ID or password');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('This login has been disabled by the administrator');
  }

  user.lastLoginAt = new Date();
  await user.save();

  await recordAudit({
    req,
    user,
    action: 'LOGIN',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.username,
  });

  res.json({
    success: true,
    token: signToken(user),
    user: user.toSafeJSON(),
  });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toSafeJSON() });
});

/** POST /api/auth/change-password — any logged-in user changing their own password */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');

  if (!(await user.verifyPassword(currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  await assertPasswordPolicy(newPassword);

  await user.setPassword(newPassword);
  user.updatedBy = req.user._id;
  await user.save();

  await recordAudit({
    req,
    action: 'PASSWORD_RESET',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.username,
    note: 'Changed own password',
  });

  res.json({ success: true, message: 'Password updated successfully' });
});

/**
 * POST /api/auth/forgot-password
 * Admin lockout recovery: sends a one-time code to the admin's registered email.
 * The response never reveals whether an account exists.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const identifier = String(req.body.identifier || '').trim().toLowerCase();

  const user = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }],
    role: 'admin',
  }).select('+resetOtpHash +resetOtpExpiresAt +resetOtpAttempts');

  const genericResponse = {
    success: true,
    message:
      'If an administrator account matches that login ID or email, a reset code has been sent to its registered email address.',
  };

  if (!user || !user.email) {
    return res.json(genericResponse);
  }

  const otp = String(crypto.randomInt(100000, 1000000)); // 6 digits
  user.resetOtpHash = await bcrypt.hash(otp, 10);
  user.resetOtpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  user.resetOtpAttempts = 0;
  await user.save();

  await sendPasswordResetOtp({
    to: user.email,
    name: user.name,
    otp,
    expiresInMinutes: OTP_TTL_MINUTES,
  });

  await recordAudit({
    req,
    user,
    action: 'PASSWORD_RESET',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.username,
    note: 'Reset code requested',
  });

  // In development without SMTP the OTP is surfaced so the flow stays testable.
  const debugOtp = !env.isProduction && !env.smtp.host ? { devOtp: otp } : {};
  return res.json({ ...genericResponse, ...debugOtp });
});

/** POST /api/auth/reset-password — completes the OTP flow */
const resetPassword = asyncHandler(async (req, res) => {
  const { identifier, otp, newPassword } = req.body;

  const user = await User.findOne({
    $or: [
      { username: String(identifier).toLowerCase() },
      { email: String(identifier).toLowerCase() },
    ],
    role: 'admin',
  }).select('+resetOtpHash +resetOtpExpiresAt +resetOtpAttempts +passwordHash');

  if (!user || !user.resetOtpHash || !user.resetOtpExpiresAt) {
    throw ApiError.badRequest('No active reset request found. Please request a new code.');
  }
  if (user.resetOtpExpiresAt < new Date()) {
    throw ApiError.badRequest('That reset code has expired. Please request a new one.');
  }
  if (user.resetOtpAttempts >= OTP_MAX_ATTEMPTS) {
    throw ApiError.badRequest('Too many incorrect attempts. Please request a new code.');
  }

  const matches = await bcrypt.compare(String(otp), user.resetOtpHash);
  if (!matches) {
    user.resetOtpAttempts += 1;
    await user.save();
    throw ApiError.badRequest('That reset code is not correct');
  }

  await assertPasswordPolicy(newPassword);
  await user.setPassword(newPassword);
  user.resetOtpHash = null;
  user.resetOtpExpiresAt = null;
  user.resetOtpAttempts = 0;
  await user.save();

  await recordAudit({
    req,
    user,
    action: 'PASSWORD_RESET',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.username,
    note: 'Password reset via email recovery code',
  });

  res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
});

module.exports = { login, me, changePassword, forgotPassword, resetPassword, assertPasswordPolicy };
