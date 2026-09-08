'use strict';

const express = require('express');
const multer = require('multer');
const controller = require('./employees.controller');
const importController = require('./employeeImport.controller');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { validate } = require('../../middleware/validate');
const {
  z,
  objectId,
  optionalObjectId,
  dateString,
  mobile,
  ifsc,
  aadhar,
  accountNo,
} = require('../../utils/validators');

const router = express.Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const employeeBase = {
  name: z.string().trim().min(2, 'Employee name is required').max(80),
  designation: z.string().trim().max(80).optional().default(''),
  fathersName: z.string().trim().max(80).optional().default(''),
  mobileNo: z.union([mobile, z.literal('')]).optional().default(''),
  email: z.union([z.string().trim().email('Enter a valid email'), z.literal('')]).optional().default(''),
  address: z.string().trim().max(300).optional().default(''),
  photoUrl: z.string().trim().max(500).optional().default(''),
  aadharNo: z.union([aadhar, z.literal('')]).optional().default(''),
  bankName: z.string().trim().max(80).optional().default(''),
  accountNo: z.union([accountNo, z.literal('')]).optional().default(''),
  ifsc: z.union([ifsc, z.literal('')]).optional().default(''),
  employeeType: z.enum(['Permanent', 'Contract']).optional().default('Permanent'),
  shiftCategory: z.enum(['Day', 'Night', 'Not Applicable']).optional().default('Day'),
  requiresWorkQty: z.boolean().optional(),
  department: objectId,
  team: optionalObjectId,
  joiningDate: dateString,
  joiningYear: z.coerce.number().int().min(2000).max(2099).optional(),
  joiningMonth: z.coerce.number().int().min(1).max(12).optional(),
  salaryType: z.enum(['Monthly', 'Daily']).optional().default('Monthly'),
  baseRate: z.coerce.number().min(0).optional().default(0),
  standardDailyHours: z.coerce.number().min(1).max(24).optional().default(8),
  otMultiplier: z.enum(['1x', '1.5x', '2x']).optional().default('1x'),
  paymentMode: z.enum(['Bank', 'Cash']).optional().default('Cash'),
  paidLeavesPerMonth: z.coerce.number().min(0).optional().default(0),
  salaryConfig: z.any().optional(),
};

const createSchema = z.object(employeeBase);
const updateSchema = z.object({ ...employeeBase, department: objectId.optional() }).partial();
const statusSchema = z.object({
  status: z.enum(['Active', 'Inactive']),
  reason: z.string().trim().max(200).optional().default(''),
  effectiveDate: dateString.optional(),
});
const updateSalarySchema = z.object({
  newBaseRate: z.coerce.number().min(0),
  effectiveFrom: dateString.optional(),
  reason: z.string().trim().max(200).optional().default(''),
  salaryType: z.enum(['Monthly', 'Daily']).optional(),
  otMultiplier: z.enum(['1x', '1.5x', '2x']).optional(),
  paymentMode: z.enum(['Bank', 'Cash']).optional(),
  paidLeavesPerMonth: z.coerce.number().min(0).optional(),
  standardDailyHours: z.coerce.number().min(1).max(24).optional(),
});

const advancesController = require('../advances/advances.controller');

// --- Import (admin / permitted operators) ---
router.get('/import/template', requirePermission('canRegisterEmployee'), importController.downloadTemplate);
router.post(
  '/import/validate',
  requirePermission('canRegisterEmployee'),
  upload.single('file'),
  importController.validateImport
);
router.post(
  '/import/confirm',
  requirePermission('canRegisterEmployee'),
  importController.confirmImport
);

// --- Standard CRUD ---
router.get('/search', controller.searchEmployees);
router.get('/', controller.listEmployees);
router.get('/:id', controller.getEmployee);
router.get('/:id/attendance', controller.getEmployeeAttendance);

// --- Salary & Financial Extensions (Phase 2) ---
router.get('/:id/salary-preview', requirePermission(['canViewSalary', 'canManagePayroll']), controller.getSalaryPreview);
router.get('/:id/financial-calendar', requirePermission(['canViewSalary', 'canManagePayroll']), controller.getFinancialCalendar);
router.get('/:id/shorttime-log', requirePermission(['canViewSalary', 'canManagePayroll']), controller.getShorttimeLog);
router.get('/:id/salary-history', requirePermission(['canViewSalary', 'canManagePayroll']), controller.getSalaryHistory);
router.put('/:id/salary', requirePermission('canManagePayroll'), validate(updateSalarySchema), controller.updateSalary);
router.get('/:id/advances', requirePermission(['canViewSalary', 'canManageAdvances']), advancesController.getEmployeeAdvances);

router.post('/', requirePermission('canRegisterEmployee'), validate(createSchema), controller.createEmployee);
router.put(
  '/:id',
  requirePermission(['canEditEmployee', 'canAssignDepartment']),
  validate(updateSchema),
  controller.updateEmployee
);
router.patch(
  '/:id/status',
  requirePermission('canChangeEmployeeStatus'),
  validate(statusSchema),
  controller.setEmployeeStatus
);

module.exports = router;
