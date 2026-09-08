'use strict';

const SalaryAdvance = require('../../models/SalaryAdvance');
const Employee = require('../../models/Employee');
const { ApiError, asyncHandler } = require('../../utils/ApiError');
const { recordAudit } = require('../../services/auditService');
const { parseDateOnly, formatDateOnly } = require('../../utils/dates');

/**
 * GET /api/advances
 * Query: employee, status, fromDate, toDate, page, limit
 */
const listAdvances = asyncHandler(async (req, res) => {
  const { employee, status, fromDate, toDate, page = 1, limit = 50 } = req.query;

  const filter = {};
  if (employee) filter.employee = employee;
  if (status && status !== 'All') filter.status = status;
  if (fromDate || toDate) {
    filter.issuedDate = {};
    if (fromDate) filter.issuedDate.$gte = parseDateOnly(fromDate);
    if (toDate) filter.issuedDate.$lte = parseDateOnly(toDate);
  }

  const pageNum = Math.max(1, Number(page));
  const perPage = Math.min(200, Math.max(1, Number(limit)));

  const [total, advances] = await Promise.all([
    SalaryAdvance.countDocuments(filter),
    SalaryAdvance.find(filter)
      .populate('employee', 'name employeeId designation department')
      .populate('issuedBy', 'name username')
      .sort({ issuedDate: -1, createdAt: -1 })
      .skip((pageNum - 1) * perPage)
      .limit(perPage)
      .lean(),
  ]);

  res.json({
    success: true,
    advances,
    pagination: {
      page: pageNum,
      limit: perPage,
      total,
      pages: Math.ceil(total / perPage) || 1,
    },
  });
});

/**
 * GET /api/advances/:id
 */
const getAdvance = asyncHandler(async (req, res) => {
  const advance = await SalaryAdvance.findById(req.params.id)
    .populate('employee', 'name employeeId designation department')
    .populate('issuedBy', 'name username')
    .populate('cancelledBy', 'name username')
    .lean();

  if (!advance) throw ApiError.notFound('Salary advance not found');

  res.json({ success: true, advance });
});

/**
 * POST /api/advances
 */
const createAdvance = asyncHandler(async (req, res) => {
  const {
    employee,
    issuedDate,
    totalAmount,
    purpose = '',
    repaymentType = 'FullNextMonth',
    totalInstallments = 1,
  } = req.body;

  const emp = await Employee.findById(employee);
  if (!emp) throw ApiError.notFound('Employee not found');
  if (emp.status === 'Inactive') {
    throw ApiError.badRequest('Cannot issue salary advance to an inactive employee');
  }

  const amount = Number(totalAmount);
  if (isNaN(amount) || amount <= 0) {
    throw ApiError.badRequest('Advance amount must be a positive number');
  }

  const date = parseDateOnly(issuedDate);
  if (!date) throw ApiError.badRequest('Valid issue date is required');

  const installments = repaymentType === 'FullNextMonth' ? 1 : Math.max(1, Number(totalInstallments) || 1);
  const installmentAmount = Math.ceil(amount / installments);

  const advance = new SalaryAdvance({
    employee: emp._id,
    issuedBy: req.user._id,
    issuedDate: date,
    totalAmount: amount,
    purpose: String(purpose || '').trim(),
    repaymentType,
    totalInstallments: installments,
    installmentAmount,
    remainingBalance: amount,
    status: 'Active',
    repayments: [],
  });

  await advance.save();

  await recordAudit({
    req,
    action: 'SALARY_ADVANCE_ISSUED',
    entity: 'SalaryAdvance',
    entityId: advance._id,
    entityLabel: `Advance for ${emp.name}`,
    after: {
      employee: emp.name,
      amount,
      installments,
      installmentAmount,
      issuedDate: formatDateOnly(date),
    },
    note: `Issued ₹${amount} advance to ${emp.name} (${emp.employeeId})`,
  });

  res.status(201).json({ success: true, advance });
});

/**
 * PATCH /api/advances/:id/cancel
 */
const cancelAdvance = asyncHandler(async (req, res) => {
  const advance = await SalaryAdvance.findById(req.params.id).populate('employee', 'name employeeId');
  if (!advance) throw ApiError.notFound('Salary advance not found');

  if (advance.status !== 'Active') {
    throw ApiError.badRequest(`Cannot cancel an advance that is already ${advance.status}`);
  }

  const { cancelReason = '' } = req.body;

  advance.status = 'Cancelled';
  advance.cancelledBy = req.user._id;
  advance.cancelledAt = new Date();
  advance.cancelReason = String(cancelReason || 'Cancelled by admin').trim();

  await advance.save();

  await recordAudit({
    req,
    action: 'SALARY_ADVANCE_CANCELLED',
    entity: 'SalaryAdvance',
    entityId: advance._id,
    entityLabel: `Advance for ${advance.employee?.name || 'Employee'}`,
    note: `Cancelled advance with remaining balance ₹${advance.remainingBalance}. Reason: ${advance.cancelReason}`,
  });

  res.json({ success: true, advance });
});

/**
 * GET /api/employees/:id/advances
 */
const getEmployeeAdvances = asyncHandler(async (req, res) => {
  const advances = await SalaryAdvance.find({ employee: req.params.id })
    .populate('issuedBy', 'name')
    .sort({ issuedDate: -1 })
    .lean();

  res.json({ success: true, advances });
});

module.exports = {
  listAdvances,
  getAdvance,
  createAdvance,
  cancelAdvance,
  getEmployeeAdvances,
};
