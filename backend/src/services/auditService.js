'use strict';

const AuditLog = require('../models/AuditLog');

/**
 * Central audit writer. Never throws into the request path — an audit failure
 * must not roll back a legitimate business action, but it is logged loudly.
 */
async function recordAudit({
  req = null,
  user = null,
  action,
  entity,
  entityId = null,
  entityLabel = '',
  before = null,
  after = null,
  note = '',
}) {
  try {
    const actor = user || req?.user || null;
    await AuditLog.create({
      user: actor?._id || null,
      userName: actor?.name || actor?.username || 'system',
      userRole: actor?.role || '',
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      entityLabel,
      before,
      after,
      note,
      ip: req?.ip || '',
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to record entry:', err.message);
  }
}

/** Strips noisy/sensitive keys before an object is stored in the audit trail. */
function auditSnapshot(doc, fields) {
  if (!doc) return null;
  const source = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const out = {};
  fields.forEach((field) => {
    const value = field.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), source);
    if (value !== undefined) out[field] = value;
  });
  return out;
}

module.exports = { recordAudit, auditSnapshot };
