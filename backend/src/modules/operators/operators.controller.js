'use strict';

const User = require('../../models/User');
const { ApiError, asyncHandler } = require('../../utils/ApiError');
const { recordAudit } = require('../../services/auditService');
const { sanitisePermissions, PERMISSIONS } = require('../../utils/permissions');
const { assertPasswordPolicy } = require('../auth/auth.controller');

/**
 * Operator account management — ADMIN ONLY (enforced by the route layer).
 * The admin creates operator logins, ticks their individual permissions, and can
 * reset their login ID / name / password at any time.
 */

/** GET /api/operators/permissions — the permission catalogue for the UI checklist */
const listPermissionCatalogue = asyncHandler(async (req, res) => {
  res.json({ success: true, permissions: PERMISSIONS });
});

/** GET /api/operators */
const listOperators = asyncHandler(async (req, res) => {
  const users = await User.find({}).sort({ role: 1, name: 1 });
  res.json({ success: true, operators: users.map((u) => u.toSafeJSON()) });
});

/** POST /api/operators */
const createOperator = asyncHandler(async (req, res) => {
  const { username, name, password, permissions, email } = req.body;

  const exists = await User.findOne({ username: username.toLowerCase() });
  if (exists) throw ApiError.conflict('That login ID is already taken');

  await assertPasswordPolicy(password);

  const operator = new User({
    username: username.toLowerCase(),
    name,
    email: email || '',
    role: 'operator',
    permissions: sanitisePermissions(permissions),
    createdBy: req.user._id,
  });
  await operator.setPassword(password);
  await operator.save();

  await recordAudit({
    req,
    action: 'CREATE',
    entity: 'Operator',
    entityId: operator._id,
    entityLabel: operator.username,
    after: { username: operator.username, name: operator.name, permissions: operator.permissions },
  });

  res.status(201).json({ success: true, operator: operator.toSafeJSON() });
});

/** PUT /api/operators/:id — name, login ID, email, active state */
const updateOperator = asyncHandler(async (req, res) => {
  const operator = await User.findById(req.params.id);
  if (!operator) throw ApiError.notFound('Operator not found');

  const before = {
    username: operator.username,
    name: operator.name,
    email: operator.email,
    isActive: operator.isActive,
  };

  if (req.body.username && req.body.username.toLowerCase() !== operator.username) {
    const taken = await User.findOne({ username: req.body.username.toLowerCase() });
    if (taken) throw ApiError.conflict('That login ID is already taken');
    operator.username = req.body.username.toLowerCase();
  }
  if (req.body.name !== undefined) operator.name = req.body.name;
  if (req.body.email !== undefined) operator.email = req.body.email;
  if (req.body.isActive !== undefined) {
    if (operator.role === 'admin' && req.body.isActive === false) {
      throw ApiError.badRequest('The administrator account cannot be disabled');
    }
    operator.isActive = req.body.isActive;
  }
  operator.updatedBy = req.user._id;
  await operator.save();

  await recordAudit({
    req,
    action: 'UPDATE',
    entity: 'Operator',
    entityId: operator._id,
    entityLabel: operator.username,
    before,
    after: {
      username: operator.username,
      name: operator.name,
      email: operator.email,
      isActive: operator.isActive,
    },
  });

  res.json({ success: true, operator: operator.toSafeJSON() });
});

/** PUT /api/operators/:id/permissions */
const updatePermissions = asyncHandler(async (req, res) => {
  const operator = await User.findById(req.params.id);
  if (!operator) throw ApiError.notFound('Operator not found');
  if (operator.role === 'admin') {
    throw ApiError.badRequest('The administrator always has full access and cannot be restricted');
  }

  const before = operator.permissions ? { ...operator.permissions.toObject?.() } : {};
  operator.permissions = sanitisePermissions(req.body.permissions);
  operator.updatedBy = req.user._id;
  await operator.save();

  await recordAudit({
    req,
    action: 'PERMISSION_CHANGE',
    entity: 'Operator',
    entityId: operator._id,
    entityLabel: operator.username,
    before,
    after: operator.effectivePermissions(),
  });

  res.json({ success: true, operator: operator.toSafeJSON() });
});

/** PUT /api/operators/:id/password — admin resets an operator's forgotten password */
const resetOperatorPassword = asyncHandler(async (req, res) => {
  const operator = await User.findById(req.params.id);
  if (!operator) throw ApiError.notFound('Operator not found');

  await assertPasswordPolicy(req.body.newPassword);
  await operator.setPassword(req.body.newPassword);
  operator.updatedBy = req.user._id;
  await operator.save();

  await recordAudit({
    req,
    action: 'PASSWORD_RESET',
    entity: 'Operator',
    entityId: operator._id,
    entityLabel: operator.username,
    note: `Password reset by administrator (${req.user.username})`,
  });

  res.json({ success: true, message: `Password for ${operator.username} has been reset` });
});

/** DELETE /api/operators/:id — deactivates rather than destroys (history is preserved) */
const deactivateOperator = asyncHandler(async (req, res) => {
  const operator = await User.findById(req.params.id);
  if (!operator) throw ApiError.notFound('Operator not found');
  if (operator.role === 'admin') throw ApiError.badRequest('The administrator account cannot be removed');

  operator.isActive = false;
  operator.updatedBy = req.user._id;
  await operator.save();

  await recordAudit({
    req,
    action: 'STATUS_CHANGE',
    entity: 'Operator',
    entityId: operator._id,
    entityLabel: operator.username,
    after: { isActive: false },
    note: 'Operator login disabled',
  });

  res.json({ success: true, message: 'Operator login disabled', operator: operator.toSafeJSON() });
});

module.exports = {
  listPermissionCatalogue,
  listOperators,
  createOperator,
  updateOperator,
  updatePermissions,
  resetOperatorPassword,
  deactivateOperator,
};
