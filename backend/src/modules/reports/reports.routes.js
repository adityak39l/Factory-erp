'use strict';

const express = require('express');
const controller = require('./reports.controller');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');

const router = express.Router();
router.use(authenticate, requirePermission('canViewReports'));

router.get('/dpr', controller.dprReport);
router.get('/attendance', controller.attendanceReport);
router.get('/production', controller.productionReport);
router.get('/export', controller.exportReport);

module.exports = router;
