'use strict';

const express = require('express');
const controller = require('./dashboard.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/overview', controller.overview);
router.get('/departments', controller.departmentBreakdown);
router.get('/analytics', controller.analytics);
router.get('/notifications', controller.notifications);
router.get('/search', controller.globalSearch);

module.exports = router;
