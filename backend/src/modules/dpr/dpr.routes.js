'use strict';

const express = require('express');
const controller = require('./dpr.controller');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const { z, objectId, optionalObjectId, timeString, dateString } = require('../../utils/validators');

const router = express.Router();
router.use(authenticate);

const entryPayload = {
  shiftName: z.enum(['Day', 'Night']).optional(),
  workingDepartment: optionalObjectId,
  inTime: z.union([timeString, z.literal('')]).optional(),
  outTime: z.union([timeString, z.literal('')]).optional(),
  workDescription: z.string().trim().max(500).optional(),
  qty: z.union([z.coerce.number().min(0, 'Quantity cannot be negative'), z.literal('')]).optional(),
  qtyUnit: z.string().trim().max(16).optional(),
  reason: z.string().trim().max(200).optional(),
};

const saveSchema = z
  .object({ employee: objectId, date: dateString, ...entryPayload })
  .refine(
    (data) =>
      data.inTime !== undefined ||
      data.outTime !== undefined ||
      data.workDescription !== undefined ||
      data.qty !== undefined ||
      data.shiftName !== undefined ||
      data.workingDepartment !== undefined,
    { message: 'Provide at least one value to save' }
  );

const bulkSchema = z.object({
  date: dateString,
  entries: z
    .array(z.object({ employee: objectId, ...entryPayload }))
    .min(1, 'Send at least one row')
    .max(200, 'Save at most 200 rows at a time'),
});

router.get('/control-center', controller.controlCenter);
router.get('/entry', controller.getEntry);
router.get('/my-workspace', controller.myWorkspace);
router.get('/incomplete', controller.incompleteEntries);

router.post('/', requirePermission('canEnterDpr'), validate(saveSchema), controller.saveEntry);
router.post('/bulk', requirePermission('canEnterDpr'), validate(bulkSchema), controller.bulkSave);
router.delete('/:id', requireAdmin, controller.deleteEntry);

module.exports = router;
