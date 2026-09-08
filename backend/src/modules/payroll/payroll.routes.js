'use strict';

const express = require('express');
const controller = require('./payroll.controller');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { z, objectId } = require('../../utils/validators');

const router = express.Router();
router.use(authenticate);

const calculateSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  workingDaysInMonth: z.number().int().min(1).max(31),
});

const adjustmentSchema = z.object({
  label: z.string().trim().min(2).max(100),
  amount: z.number().positive(),
  type: z.enum(['Addition', 'Deduction']),
});

const overtimeSchema = z.object({
  overtimeHours: z.number().min(0),
});

router.get('/', requirePermission(['canManagePayroll', 'canViewSalary']), controller.listPayrolls);
router.get('/:id', requirePermission(['canManagePayroll', 'canViewSalary']), controller.getPayroll);
router.post('/calculate', requirePermission('canManagePayroll'), validate(calculateSchema), controller.calculate);
router.post('/:id/sync', requirePermission('canManagePayroll'), controller.syncEmployees);
router.put('/:id/approve', requirePermission('canManagePayroll'), controller.approve);
router.put('/:id/mark-paid', requirePermission('canManagePayroll'), controller.markPaid);
router.patch(
  '/:id/records/:empId/overtime',
  requirePermission('canManagePayroll'),
  validate(overtimeSchema),
  controller.setOvertime
);
router.post(
  '/:id/records/:empId/adjustments',
  requirePermission('canManagePayroll'),
  validate(adjustmentSchema),
  controller.addAdj
);
router.delete(
  '/:id/records/:empId/adjustments/:adjId',
  requirePermission('canManagePayroll'),
  controller.removeAdj
);

router.get('/:id/export/excel', requirePermission(['canManagePayroll', 'canViewSalary']), controller.exportExcel);
router.get('/:id/export/bank', requirePermission('canManagePayroll'), controller.exportBank);
router.get('/:id/payslip/:employeeId', requirePermission(['canManagePayroll', 'canViewSalary']), controller.exportPayslip);

module.exports = router;
