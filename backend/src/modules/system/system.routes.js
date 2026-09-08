'use strict';

const os = require('os');
const express = require('express');
const mongoose = require('mongoose');
const Settings = require('../../models/Settings');
const Employee = require('../../models/Employee');
const DprEntry = require('../../models/DprEntry');
const AuditLog = require('../../models/AuditLog');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/ApiError');
const { recordAudit } = require('../../services/auditService');
const { databaseStatus } = require('../../config/db');
const { z, timeString } = require('../../utils/validators');
const { env } = require('../../config/env');
const { getTransporter } = require('../../services/emailService');

const router = express.Router();

/** Public liveness probe used by hosting platforms. */
router.get('/health', (req, res) => {
  const db = databaseStatus();
  res.status(db.readyState === 1 ? 200 : 503).json({
    success: db.readyState === 1,
    status: db.readyState === 1 ? 'ok' : 'degraded',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

router.use(authenticate);

/** GET /api/system/settings */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const settings = await Settings.getSettings();
    res.json({ success: true, settings });
  })
);

const settingsSchema = z.object({
  company: z
    .object({
      name: z.string().trim().max(120).optional(),
      addressLine1: z.string().trim().max(160).optional(),
      addressLine2: z.string().trim().max(160).optional(),
      city: z.string().trim().max(60).optional(),
      state: z.string().trim().max(60).optional(),
      pincode: z.string().trim().max(10).optional(),
      phone: z.string().trim().max(30).optional(),
      email: z.union([z.string().trim().email(), z.literal('')]).optional(),
      gstin: z.string().trim().max(20).optional(),
    })
    .optional(),
  attendance: z
    .object({
      weeklyOffDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
      graceMinutes: z.number().int().min(0).max(120).optional(),
      treatWeeklyOffAsHoliday: z.boolean().optional(),
    })
    .optional(),
  dpr: z
    .object({
      backdateLimitDays: z.number().int().min(0).max(365).optional(),
      allowFutureDates: z.boolean().optional(),
      defaultQtyUnit: z.string().trim().max(16).optional(),
    })
    .optional(),
  security: z
    .object({
      sessionTimeoutMinutes: z.number().int().min(15).max(10080).optional(),
      passwordMinLength: z.number().int().min(6).max(64).optional(),
      passwordRequireNumber: z.boolean().optional(),
      passwordRequireUppercase: z.boolean().optional(),
      maxLoginAttempts: z.number().int().min(3).max(50).optional(),
    })
    .optional(),
  notifications: z
    .object({
      emailEnabled: z.boolean().optional(),
      notifyOnAbsence: z.boolean().optional(),
      notifyOnIncompleteDpr: z.boolean().optional(),
      dailySummaryTime: timeString.optional(),
    })
    .optional(),
});

/** PUT /api/system/settings — admin only */
router.put(
  '/settings',
  requireAdmin,
  validate(settingsSchema),
  asyncHandler(async (req, res) => {
    const settings = await Settings.getSettings();
    const before = settings.toObject();

    ['company', 'attendance', 'dpr', 'security', 'notifications'].forEach((section) => {
      if (req.body[section]) {
        Object.entries(req.body[section]).forEach(([key, value]) => {
          if (value !== undefined) settings[section][key] = value;
        });
      }
    });
    settings.updatedBy = req.user._id;
    await settings.save();

    await recordAudit({
      req,
      action: 'UPDATE',
      entity: 'Settings',
      entityId: settings._id,
      entityLabel: 'System settings',
      before: {
        company: before.company,
        attendance: before.attendance,
        dpr: before.dpr,
        security: before.security,
      },
      after: req.body,
    });

    res.json({ success: true, settings });
  })
);

/** GET /api/system/status — admin-only health panel (never exposes credentials) */
router.get(
  '/status',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const db = databaseStatus();
    const [employees, entries, logs, lastEntry, lastAudit] = await Promise.all([
      Employee.countDocuments(),
      DprEntry.countDocuments(),
      AuditLog.countDocuments(),
      DprEntry.findOne().sort({ createdAt: -1 }).select('createdAt').lean(),
      AuditLog.findOne().sort({ createdAt: -1 }).select('createdAt').lean(),
    ]);

    let storage = null;
    try {
      const stats = await mongoose.connection.db.stats();
      storage = {
        dataSizeMb: Math.round((stats.dataSize / 1024 / 1024) * 100) / 100,
        storageSizeMb: Math.round((stats.storageSize / 1024 / 1024) * 100) / 100,
        indexSizeMb: Math.round((stats.indexSize / 1024 / 1024) * 100) / 100,
        collections: stats.collections,
      };
    } catch (err) {
      storage = null; // db.stats() is not permitted on some managed tiers
    }

    const isAtlas = /mongodb\+srv|mongodb\.net/i.test(env.mongoUri);

    res.json({
      success: true,
      application: {
        status: 'running',
        environment: env.nodeEnv,
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
        hostMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
        startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      },
      database: {
        ...db,
        hosting: isAtlas ? 'MongoDB Atlas (managed, automatic backups)' : 'Self-managed MongoDB',
        automaticBackups: isAtlas,
        backupNote: isAtlas
          ? 'Snapshots are managed by MongoDB Atlas. Verify the schedule in the Atlas console under Backup.'
          : 'No managed backup detected — schedule mongodump backups for this deployment.',
        storage,
      },
      email: {
        configured: Boolean(getTransporter()),
        note: getTransporter()
          ? 'SMTP configured — password reset codes will be emailed.'
          : 'SMTP not configured — reset codes are printed to the server console.',
      },
      records: {
        employees,
        dprEntries: entries,
        auditLogs: logs,
        lastDprEntryAt: lastEntry?.createdAt || null,
        lastAuditAt: lastAudit?.createdAt || null,
      },
    });
  })
);

module.exports = router;
