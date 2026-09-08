'use strict';

const express = require('express');
const controller = require('./operators.controller');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { z } = require('../../utils/validators');

const router = express.Router();

// Every route here is administrator-only.
router.use(authenticate, requireAdmin);

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Login ID must be at least 3 characters')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Login ID may contain letters, numbers, dot, underscore and hyphen only'),
  name: z.string().trim().min(2, 'Name is required').max(80),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  permissions: z.record(z.boolean()).optional().default({}),
});

const updateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid login ID format')
    .optional(),
  name: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).optional(),
  isActive: z.boolean().optional(),
});

const permissionsSchema = z.object({ permissions: z.record(z.boolean()) });
const passwordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

router.get('/permissions', controller.listPermissionCatalogue);
router.get('/', controller.listOperators);
router.post('/', validate(createSchema), controller.createOperator);
router.put('/:id', validate(updateSchema), controller.updateOperator);
router.put('/:id/permissions', validate(permissionsSchema), controller.updatePermissions);
router.put('/:id/password', validate(passwordSchema), controller.resetOperatorPassword);
router.delete('/:id', controller.deactivateOperator);

module.exports = router;
