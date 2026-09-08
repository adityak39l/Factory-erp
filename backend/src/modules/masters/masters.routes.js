'use strict';

const express = require('express');
const controller = require('./masters.controller');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { z, objectId, timeString, dateString } = require('../../utils/validators');

const router = express.Router();
router.use(authenticate);

const manage = requirePermission('canManageMasters');

/* Departments */
const departmentSchema = z.object({
  name: z.string().trim().min(2, 'Department name is required').max(80),
  nameHindi: z.string().trim().max(80).optional().default(''),
  code: z.string().trim().max(16).optional().default(''),
  description: z.string().trim().max(300).optional().default(''),
  hasTeams: z.boolean().optional().default(false),
  isHelperPool: z.boolean().optional().default(false),
  requiresWorkQtyByDefault: z.boolean().optional().default(true),
});

router.get('/departments', controller.listDepartments);
router.post('/departments', manage, validate(departmentSchema), controller.createDepartment);
router.put('/departments/:id', manage, validate(departmentSchema.partial()), controller.updateDepartment);
router.delete('/departments/:id', manage, controller.archiveDepartment);

/* Teams */
const teamSchema = z.object({
  name: z.string().trim().min(1, 'Team name is required').max(60),
  department: objectId,
  description: z.string().trim().max(200).optional().default(''),
});

router.get('/teams', controller.listTeams);
router.post('/teams', manage, validate(teamSchema), controller.createTeam);
router.put('/teams/:id', manage, validate(teamSchema.partial()), controller.updateTeam);
router.delete('/teams/:id', manage, controller.archiveTeam);

/* Shifts */
const shiftSchema = z
  .object({
    name: z.enum(['Day', 'Night']),
    startTime: timeString,
    endTime: timeString,
    effectiveFrom: dateString.optional(),
    note: z.string().trim().max(200).optional().default(''),
  })
  .refine((data) => data.startTime !== data.endTime, {
    message: 'Shift start and end time cannot be identical',
    path: ['endTime'],
  });

router.get('/shifts', controller.listShifts);
router.put('/shifts', manage, validate(shiftSchema), controller.upsertShift);

/* Holidays */
const holidaySchema = z.object({
  date: dateString,
  description: z.string().trim().min(2, 'Holiday description is required').max(120),
  type: z.enum(['Weekly Off', 'Festival', 'Maintenance', 'Other']).optional().default('Festival'),
});

router.get('/holidays', controller.listHolidays);
router.post('/holidays', manage, validate(holidaySchema), controller.createHoliday);
router.delete('/holidays/:id', manage, controller.deleteHoliday);

module.exports = router;
