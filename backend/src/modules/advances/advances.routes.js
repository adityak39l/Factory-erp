'use strict';

const express = require('express');
const controller = require('./advances.controller');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { z, objectId, dateString } = require('../../utils/validators');

const router = express.Router();
router.use(authenticate);

const createSchema = z.object({
  employee: objectId,
  issuedDate: dateString,
  totalAmount: z.number().positive('Advance amount must be greater than zero'),
  purpose: z.string().trim().max(250).optional().default(''),
  repaymentType: z.enum(['FullNextMonth', 'Installments']).default('FullNextMonth'),
  totalInstallments: z.number().int().min(1).max(24).optional().default(1),
});

const cancelSchema = z.object({
  cancelReason: z.string().trim().max(250).optional().default(''),
});

router.get('/', requirePermission(['canManageAdvances', 'canViewSalary']), controller.listAdvances);
router.get('/:id', requirePermission(['canManageAdvances', 'canViewSalary']), controller.getAdvance);
router.post('/', requirePermission('canManageAdvances'), validate(createSchema), controller.createAdvance);
router.patch('/:id/cancel', requirePermission('canManageAdvances'), validate(cancelSchema), controller.cancelAdvance);

module.exports = router;
