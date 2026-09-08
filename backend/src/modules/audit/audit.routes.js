'use strict';

const express = require('express');
const AuditLog = require('../../models/AuditLog');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../utils/ApiError');
const { parseDateOnly } = require('../../utils/dates');

const router = express.Router();
router.use(authenticate, requireAdmin);

/** GET /api/audit — the accountability trail (admin only) */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const filter = {};
    if (req.query.action) filter.action = req.query.action;
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.user) filter.user = req.query.user;
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ entityLabel: rx }, { userName: rx }, { note: rx }];
    }
    const from = parseDateOnly(req.query.from);
    const to = parseDateOnly(req.query.to);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = from;
      if (to) {
        const end = new Date(to);
        end.setUTCDate(end.getUTCDate() + 1);
        filter.createdAt.$lt = end;
      }
    }

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      success: true,
      logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  })
);

/** GET /api/audit/actions — filter options for the UI */
router.get(
  '/actions',
  asyncHandler(async (req, res) => {
    const [actions, entities] = await Promise.all([
      AuditLog.distinct('action'),
      AuditLog.distinct('entity'),
    ]);
    res.json({ success: true, actions: actions.sort(), entities: entities.sort() });
  })
);

module.exports = router;
