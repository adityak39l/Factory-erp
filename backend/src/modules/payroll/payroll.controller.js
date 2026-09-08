'use strict';

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const MonthlyPayroll = require('../../models/MonthlyPayroll');
const Employee = require('../../models/Employee');
const Settings = require('../../models/Settings');
const { ApiError, asyncHandler } = require('../../utils/ApiError');
const { decrypt } = require('../../services/encryption');
const {
  calculateMonthlyPayroll,
  approvePayroll,
  markPayrollPaid,
  addAdjustment,
  removeAdjustment,
  updateEmployeeOvertime,
  syncActiveEmployeesToPayroll,
} = require('../../services/payrollService');

const BRAND = { navy: '#05054A', orange: '#E28431', green: '#166534', lightGreen: '#DCFCE7' };

/**
 * GET /api/payroll
 */
const listPayrolls = asyncHandler(async (req, res) => {
  const payrolls = await MonthlyPayroll.find({})
    .select('month year workingDaysInMonth status totalBasicEarned totalOvertimePay totalShortTimeDeduction totalAdvanceDeducted companyGrandTotal generatedAt approvedAt lockedAt records')
    .sort({ year: -1, month: -1 })
    .lean();

  const list = payrolls.map((p) => ({
    id: p._id,
    month: p.month,
    year: p.year,
    workingDaysInMonth: p.workingDaysInMonth,
    status: p.status,
    totalEmployees: (p.records || []).length,
    totalBasicEarned: p.totalBasicEarned || 0,
    totalOvertimePay: p.totalOvertimePay || 0,
    totalShortTimeDeduction: p.totalShortTimeDeduction || 0,
    totalAdvanceDeducted: p.totalAdvanceDeducted || 0,
    companyGrandTotal: p.companyGrandTotal || 0,
    generatedAt: p.generatedAt,
    approvedAt: p.approvedAt,
    lockedAt: p.lockedAt,
  }));

  res.json({ success: true, payrolls: list });
});

/**
 * GET /api/payroll/:id
 */
const getPayroll = asyncHandler(async (req, res) => {
  let payrollDoc = await MonthlyPayroll.findById(req.params.id);
  if (!payrollDoc) throw ApiError.notFound('Payroll document not found');

  if (payrollDoc.status === 'Draft' || payrollDoc.status === 'Calculated') {
    payrollDoc = await syncActiveEmployeesToPayroll(payrollDoc, req.user);
  }

  const payroll = await MonthlyPayroll.findById(payrollDoc._id)
    .populate('generatedBy', 'name username')
    .populate('approvedBy', 'name username')
    .lean();

  if (!payroll) throw ApiError.notFound('Payroll document not found');

  // Build department summary
  const deptMap = new Map();
  let proRataCount = 0;
  let activeAdvancesCount = 0;

  payroll.records.forEach((rec) => {
    if (rec.isProRata) proRataCount += 1;
    if (rec.advanceDeductedAmount > 0) activeAdvancesCount += 1;

    const deptName = rec.department || 'General';
    if (!deptMap.has(deptName)) {
      deptMap.set(deptName, {
        department: deptName,
        employeeCount: 0,
        totalBasic: 0,
        totalOT: 0,
        totalShortTimeCut: 0,
        totalAdvanceCut: 0,
        grandTotal: 0,
      });
    }

    const d = deptMap.get(deptName);
    d.employeeCount += 1;
    d.totalBasic += rec.basicEarned || 0;
    d.totalOT += rec.overtimePay || 0;
    d.totalShortTimeCut += rec.shortTimeDeduction || 0;
    d.totalAdvanceCut += rec.advanceDeductedAmount || 0;
    d.grandTotal += rec.netPayable || 0;
  });

  const summary = {
    totalBasicEarned: payroll.totalBasicEarned,
    totalOvertimePay: payroll.totalOvertimePay,
    totalShortTimeDeduction: payroll.totalShortTimeDeduction,
    totalManualAdditions: payroll.totalManualAdditions,
    totalManualDeductions: payroll.totalManualDeductions,
    totalAdvanceDeducted: payroll.totalAdvanceDeducted,
    grandTotal: payroll.companyGrandTotal,
    totalEmployees: payroll.records.length,
    proRataEmployees: proRataCount,
    activeAdvances: activeAdvancesCount,
    byDepartment: Array.from(deptMap.values()),
  };

  res.json({
    success: true,
    payroll: {
      ...payroll,
      summary,
    },
  });
});

/**
 * POST /api/payroll/calculate
 */
const calculate = asyncHandler(async (req, res) => {
  const { month, year, workingDaysInMonth } = req.body;
  const payroll = await calculateMonthlyPayroll(month, year, workingDaysInMonth, req.user);
  res.json({ success: true, payroll });
});

/**
 * PUT /api/payroll/:id/approve
 */
const approve = asyncHandler(async (req, res) => {
  const payroll = await approvePayroll(req.params.id, req.user);
  res.json({ success: true, payroll });
});

/**
 * PUT /api/payroll/:id/mark-paid
 */
const markPaid = asyncHandler(async (req, res) => {
  const payroll = await markPayrollPaid(req.params.id, req.user);
  res.json({ success: true, payroll });
});

/**
 * POST /api/payroll/:id/records/:empId/adjustments
 */
const addAdj = asyncHandler(async (req, res) => {
  const { label, amount, type } = req.body;
  const payroll = await addAdjustment(req.params.id, req.params.empId, { label, amount, type }, req.user);
  res.json({ success: true, payroll });
});

/**
 * DELETE /api/payroll/:id/records/:empId/adjustments/:adjId
 */
const removeAdj = asyncHandler(async (req, res) => {
  const payroll = await removeAdjustment(req.params.id, req.params.empId, req.params.adjId, req.user);
  res.json({ success: true, payroll });
});

/**
 * PATCH /api/payroll/:id/records/:empId/overtime
 * Updates overtime hours manually for an employee.
 */
const setOvertime = asyncHandler(async (req, res) => {
  const { id, empId } = req.params;
  const { overtimeHours } = req.body;
  const payroll = await updateEmployeeOvertime(id, empId, overtimeHours, req.user);
  res.json({ success: true, payroll });
});

/**
 * POST /api/payroll/:id/sync
 * Syncs any newly registered active employees into this payroll sheet.
 */
const syncEmployees = asyncHandler(async (req, res) => {
  let payrollDoc = await MonthlyPayroll.findById(req.params.id);
  if (!payrollDoc) throw ApiError.notFound('Payroll document not found');
  payrollDoc = await syncActiveEmployeesToPayroll(payrollDoc, req.user);
  res.json({ success: true, payroll: payrollDoc });
});

/**
 * GET /api/payroll/:id/export/excel
 * Generates 2 sheets: "Employee Records" + "Department Summary"
 */
const exportExcel = asyncHandler(async (req, res) => {
  const payroll = await MonthlyPayroll.findById(req.params.id).lean();
  if (!payroll) throw ApiError.notFound('Payroll document not found');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Trading Engineers ERP';
  workbook.created = new Date();

  // Sheet 1: Employee Records
  const ws1 = workbook.addWorksheet('Employee Records', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });

  ws1.columns = [
    { header: 'Emp ID', key: 'id', width: 12 },
    { header: 'Employee Name', key: 'name', width: 24 },
    { header: 'Department', key: 'dept', width: 18 },
    { header: 'Salary Type', key: 'type', width: 12 },
    { header: 'Base Rate (₹)', key: 'base', width: 14 },
    { header: 'Pro-Rata?', key: 'pr', width: 10 },
    { header: 'Present Days', key: 'pDays', width: 12 },
    { header: 'Absent Days', key: 'aDays', width: 12 },
    { header: 'Paid Days', key: 'effDays', width: 12 },
    { header: 'Basic Earned (₹)', key: 'basic', width: 16 },
    { header: 'OT Hours', key: 'otHrs', width: 10 },
    { header: 'OT Pay (₹)', key: 'otPay', width: 14 },
    { header: 'Short-Time Hrs', key: 'stHrs', width: 14 },
    { header: 'Short-Time Cut (₹)', key: 'stCut', width: 16 },
    { header: 'Gross Salary (₹)', key: 'gross', width: 16 },
    { header: 'Adjustments (₹)', key: 'adj', width: 14 },
    { header: 'Advance Cut (₹)', key: 'adv', width: 14 },
    { header: 'GRAND TOTAL (₹)', key: 'net', width: 18 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  // Header row style
  const hRow = ws1.getRow(1);
  hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF05054A' } };

  payroll.records.forEach((r) => {
    const row = ws1.addRow({
      id: r.employeeIdCode,
      name: r.employeeName,
      dept: r.department,
      type: r.salaryType,
      base: r.baseRate,
      pr: r.isProRata ? 'YES' : 'NO',
      pDays: r.presentDays,
      aDays: r.absentDays,
      effDays: r.effectivePaidDays,
      basic: r.basicEarned,
      otHrs: r.overtimeHours,
      otPay: r.overtimePay,
      stHrs: r.shortTimeHours,
      stCut: r.shortTimeDeduction,
      gross: r.grossSalary,
      adj: r.totalAdjustments,
      adv: r.advanceDeductedAmount,
      net: r.netPayable,
      status: r.paymentStatus,
    });

    // Highlight grand total cell
    const netCell = row.getCell('net');
    netCell.font = { bold: true, color: { argb: 'FF166534' } };
    netCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
  });

  // Total row
  const totRow = ws1.addRow({
    id: 'TOTAL',
    name: `Total (${payroll.records.length} employees)`,
    dept: '',
    type: '',
    base: '',
    pr: '',
    pDays: '',
    aDays: '',
    effDays: '',
    basic: payroll.totalBasicEarned,
    otHrs: '',
    otPay: payroll.totalOvertimePay,
    stHrs: '',
    stCut: payroll.totalShortTimeDeduction,
    gross: '',
    adj: '',
    adv: payroll.totalAdvanceDeducted,
    net: payroll.companyGrandTotal,
    status: '',
  });
  totRow.font = { bold: true };

  // Sheet 2: Department Summary
  const ws2 = workbook.addWorksheet('Department Summary');
  ws2.columns = [
    { header: 'Department', key: 'dept', width: 22 },
    { header: 'Employees', key: 'count', width: 12 },
    { header: 'Basic Earned (₹)', key: 'basic', width: 16 },
    { header: 'OT Pay (₹)', key: 'ot', width: 14 },
    { header: 'Short-Time Cut (₹)', key: 'st', width: 16 },
    { header: 'Advance Cut (₹)', key: 'adv', width: 16 },
    { header: 'Grand Total (₹)', key: 'grand', width: 18 },
  ];

  const hRow2 = ws2.getRow(1);
  hRow2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF05054A' } };

  const deptMap = new Map();
  payroll.records.forEach((rec) => {
    const d = rec.department || 'General';
    if (!deptMap.has(d)) {
      deptMap.set(d, { dept: d, count: 0, basic: 0, ot: 0, st: 0, adv: 0, grand: 0 });
    }
    const item = deptMap.get(d);
    item.count += 1;
    item.basic += rec.basicEarned || 0;
    item.ot += rec.overtimePay || 0;
    item.st += rec.shortTimeDeduction || 0;
    item.adv += rec.advanceDeductedAmount || 0;
    item.grand += rec.netPayable || 0;
  });

  deptMap.forEach((v) => {
    ws2.addRow(v);
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Payroll_${payroll.year}_${String(payroll.month).padStart(2, '0')}.xlsx"`
  );

  await workbook.xlsx.write(res);
  res.end();
});

/**
 * GET /api/payroll/:id/export/bank
 * Bank transfer CSV advice with decrypted account numbers
 */
const exportBank = asyncHandler(async (req, res) => {
  const payroll = await MonthlyPayroll.findById(req.params.id).lean();
  if (!payroll) throw ApiError.notFound('Payroll document not found');

  const empIds = payroll.records.map((r) => r.employee);
  const employees = await Employee.find({ _id: { $in: empIds } }).select('+bankDetails.accountNo').lean();
  const empMap = new Map();
  employees.forEach((e) => empMap.set(String(e._id), e));

  const rows = [];
  rows.push(['Sr No', 'Employee Name', 'Employee ID', 'Bank Name', 'Account Number', 'IFSC Code', 'Net Payable (INR)', 'Payment Month']);

  let sr = 1;
  payroll.records.forEach((rec) => {
    const emp = empMap.get(String(rec.employee));
    const mode = emp?.salaryConfig?.paymentMode || 'Cash';
    if (mode === 'Bank') {
      const encryptedAcc = emp?.bankDetails?.accountNo;
      const accPlain = encryptedAcc ? decrypt(encryptedAcc) : '';
      rows.push([
        sr++,
        `"${rec.employeeName.replace(/"/g, '""')}"`,
        `"${rec.employeeIdCode}"`,
        `"${(emp?.bankDetails?.bankName || '').replace(/"/g, '""')}"`,
        `"${accPlain}"`,
        `"${emp?.bankDetails?.ifsc || ''}"`,
        rec.netPayable,
        `"${payroll.month}/${payroll.year}"`,
      ]);
    }
  });

  const csvContent = rows.map((r) => r.join(',')).join('\r\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Bank_Transfer_${payroll.year}_${String(payroll.month).padStart(2, '0')}.csv"`
  );
  res.send(csvContent);
});

/**
 * GET /api/payroll/:id/payslip/:employeeId
 * Generates an itemized PDF payslip
 */
const exportPayslip = asyncHandler(async (req, res) => {
  const payroll = await MonthlyPayroll.findById(req.params.id).lean();
  if (!payroll) throw ApiError.notFound('Payroll document not found');

  const record = payroll.records.find((r) => String(r.employee) === String(req.params.employeeId));
  if (!record) throw ApiError.notFound('Employee record not found in this payroll');

  const settings = await Settings.getSettings();
  const companyName = settings?.company?.name || 'Trading Engineers';

  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="Payslip_${record.employeeIdCode}_${payroll.month}_${payroll.year}.pdf"`
  );

  doc.pipe(res);

  // Header
  doc.fontSize(18).fillColor(BRAND.navy).text(companyName, { align: 'center' });
  doc.fontSize(12).fillColor('#444444').text(`SALARY SLIP — ${payroll.month}/${payroll.year}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor(BRAND.navy).lineWidth(2).stroke();
  doc.moveDown(1);

  // Employee details
  doc.fontSize(10).fillColor('#111827');
  const topY = doc.y;
  doc.text(`Employee Name: ${record.employeeName}`, 40, topY);
  doc.text(`Employee ID: ${record.employeeIdCode}`, 40, topY + 16);
  doc.text(`Department: ${record.department}`, 40, topY + 32);

  doc.text(`Salary Type: ${record.salaryType}`, 320, topY);
  doc.text(`Base Rate: Rs ${record.baseRate}`, 320, topY + 16);
  if (record.isProRata) {
    doc.fillColor('#B45309').text(`[Pro-Rata Calculation Applied]`, 320, topY + 32).fillColor('#111827');
  }

  doc.moveDown(3);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#E5E7EB').lineWidth(1).stroke();
  doc.moveDown(0.5);

  // Attendance summary
  doc.fontSize(10).fillColor(BRAND.navy).text('ATTENDANCE SUMMARY', { underline: true });
  doc.fillColor('#374151').fontSize(9);
  doc.text(`Present Days: ${record.presentDays} | Absent Days: ${record.absentDays} | Paid Days: ${record.effectivePaidDays} | OT Hours: ${record.overtimeHours}h | Short-Time: ${record.shortTimeHours}h`);
  doc.moveDown(1);

  // Earnings & Deductions Tables
  const tableY = doc.y;
  doc.rect(40, tableY, 250, 140).strokeColor('#D1D5DB').stroke();
  doc.rect(305, tableY, 250, 140).strokeColor('#D1D5DB').stroke();

  // Earnings Header
  doc.fillColor(BRAND.navy).fontSize(10).text('EARNINGS', 50, tableY + 8, { width: 230 });
  doc.fontSize(9).fillColor('#111827');
  doc.text(`Basic Earned:`, 50, tableY + 28);
  doc.text(`Rs ${record.basicEarned}`, 200, tableY + 28, { align: 'right' });
  doc.text(`Overtime Pay (${record.otMultiplier}x):`, 50, tableY + 48);
  doc.text(`Rs ${record.overtimePay}`, 200, tableY + 48, { align: 'right' });
  doc.text(`Manual Additions:`, 50, tableY + 68);
  doc.text(`Rs ${record.totalManualAdditions || 0}`, 200, tableY + 68, { align: 'right' });

  // Deductions Header
  doc.fillColor('#DC2626').fontSize(10).text('DEDUCTIONS', 315, tableY + 8, { width: 230 });
  doc.fontSize(9).fillColor('#111827');
  doc.text(`Short-Time Deduction:`, 315, tableY + 28);
  doc.text(`Rs ${record.shortTimeDeduction}`, 465, tableY + 28, { align: 'right' });
  doc.text(`Advance Recovery (EMI):`, 315, tableY + 48);
  doc.text(`Rs ${record.advanceDeductedAmount}`, 465, tableY + 48, { align: 'right' });
  doc.text(`Manual Deductions:`, 315, tableY + 68);
  doc.text(`Rs ${record.totalManualDeductions || 0}`, 465, tableY + 68, { align: 'right' });

  // Totals box
  const totalY = tableY + 160;
  doc.rect(40, totalY, 515, 45).fillAndStroke('#F0FDF4', '#166534');
  doc.fontSize(12).fillColor('#166534').text('GRAND TOTAL (NET PAY IN HAND):', 60, totalY + 14);
  doc.fontSize(14).font('Helvetica-Bold').text(`Rs ${record.netPayable.toLocaleString('en-IN')}`, 400, totalY + 14, { align: 'right' });

  // Footer / Signatures
  doc.font('Helvetica').fontSize(9).fillColor('#6B7280');
  doc.text('Prepared By: ___________________', 60, totalY + 100);
  doc.text('Employee Signature: ___________________', 350, totalY + 100);

  doc.end();
});

module.exports = {
  listPayrolls,
  getPayroll,
  calculate,
  approve,
  markPaid,
  addAdj,
  removeAdj,
  setOvertime,
  syncEmployees,
  exportExcel,
  exportBank,
  exportPayslip,
};
