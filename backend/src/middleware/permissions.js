'use strict';

const { ApiError } = require('../utils/ApiError');
const { PERMISSIONS } = require('../utils/permissions');

const labelFor = (key) => PERMISSIONS.find((p) => p.key === key)?.label || key;

/**
 * Backend permission gate. This is the real enforcement point — the frontend only
 * hides buttons, it never decides access. Admin always passes.
 *
 * requirePermission('canEnterDpr')            -> single permission
 * requirePermission(['canA','canB'])          -> ANY of them is enough
 */
function requirePermission(permission) {
  const keys = Array.isArray(permission) ? permission : [permission];
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role === 'admin') return next();

    const allowed = keys.some((key) => req.user.can(key));
    if (!allowed) {
      return next(
        ApiError.forbidden(
          `You do not have permission to ${keys.map(labelFor).join(' / ').toLowerCase()}`
        )
      );
    }
    return next();
  };
}

/** Convenience helper for controllers that need a conditional (not a hard gate). */
function can(req, permission) {
  return Boolean(req.user && req.user.can(permission));
}

module.exports = { requirePermission, can };
