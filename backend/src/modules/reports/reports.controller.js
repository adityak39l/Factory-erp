'use strict';

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const DprEntry = require('../../models/DprEntry');
const Employee = require('../../models/Employee');
const Department = require('../../models/Department');
const Settings = require('../../models/Settings');
const { asyncHandler, ApiError } = require('../../utils/ApiError');
const { recordAudit } = require('../../services/auditService');
const { parseDateOnly, formatDateOnly } = require('../../utils/dates');
const { round2 } = require('../../services/timeCalculation');
const { buildEmployeeAttendance } = require('../../services/attendanceService');

const BRAND = { navy: '#05054A', orange: '#E28431' };

/** Shared filter builder for every report type. */
async function buildFilters(query) {
  const from = parseDateOnly(query.from);
  const to = parseDateOnly(query.to);
  if (!from || !to) throw ApiError.badRequest('Both "from" and "to" dates are required (YYYY-MM-DD)');
  if (from > to) throw ApiError.badRequest('"from" date cannot be after "to" date');

  const filter = { date: { $gte: from, $lte: to } };
  if (query.department) filter.workingDepartment = query.department;
  if (query.team) filter.team = query.team;
  if (query.employee) filter.employee = query.employee;
  if (query.employeeType) filter.employeeType = query.employeeType;
  if (query.shift) filter.shiftName = query.shift;
  if (query.status) filter.entryStatus = query.status;

  return { filter, from, to };
}

/**
 * Detailed DPR register (the digital replacement for the old daily sheet).
 * Kept as a plain function so both the API response and the file exports use
 * exactly the same data — they can never drift apart.
 */
async function collectDprReport(query) {
  const { filter, from, to } = await buildFilters(query);

  const entries = await DprEntry.find(filter).sort({ date: 1, employeeName: 1 }).lean();

  const rows = entries.map((e) => ({
    date: formatDateOnly(e.date),
    employeeId: e.employeeIdCode,
    employeeName: e.employeeName,
    employeeType: e.employeeType,
    department: e.workingDepartmentName,
    isCrossAssigned: e.isCrossAssigned,
    team: e.teamName,
    shift: e.shiftName || '—',
    inTime: e.inTime || '—',
    outTime: e.outTime || '—',
    totalHours: e.totalHours,
    overtime: e.employeeType === 'Contract' ? null : e.overtime,
    shortTime: e.employeeType === 'Contract' ? null : e.shortTime,
    workDescription: e.workDescription,
    qty: e.qty,
    qtyUnit: e.qtyUnit,
    status: e.entryStatus,
  }));

  const totals = {
    entries: rows.length,
    totalHours: round2(rows.reduce((s, r) => s + (r.totalHours || 0), 0)),
    overtime: round2(rows.reduce((s, r) => s + (r.overtime || 0), 0)),
    shortTime: round2(rows.reduce((s, r) => s + (r.shortTime || 0), 0)),
    quantity: round2(rows.reduce((s, r) => s + (r.qty || 0), 0)),
  };

  return {
    period: { from: formatDateOnly(from), to: formatDateOnly(to) },
    totals,
    rows,
  };
}

const dprReport = asyncHandler(async (req, res) => {
  const data = await collectDprReport(req.query);
  res.json({ success: true, ...data });
});

/**
 * Per-employee attendance summary over a period, with the Day-shift / Night-shift
 * split for Permanent employees and hours-only totals for Contract employees.
 */
async function collectAttendanceReport(query) {
  const { filter, from, to } = await buildFilters(query);

  const employeeFilter = {};
  if (query.status === 'Inactive') employeeFilter.status = 'Inactive';
  else if (query.includeInactive !== 'true') employeeFilter.status = 'Active';
  if (query.department) employeeFilter.department = query.department;
  if (query.team) employeeFilter.team = query.team;
  if (query.employeeType) employeeFilter.employeeType = query.employeeType;
  if (query.employee) employeeFilter._id = query.employee;

  const employees = await Employee.find(employeeFilter)
    .populate('department', 'name')
    .sort({ name: 1 })
    .lean();

  const entries = await DprEntry.find({
    ...filter,
    employee: { $in: employees.map((e) => e._id) },
  }).lean();

  const byEmployee = new Map();
  entries.forEach((entry) => {
    const key = String(entry.employee);
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key).push(entry);
  });

  const rows = [];
  for (const employee of employees) {
    // eslint-disable-next-line no-await-in-loop
    const { summary } = await buildEmployeeAttendance({
      employee,
      from,
      to,
      entries: byEmployee.get(String(employee._id)) || [],
    });
    rows.push({
      employeeId: employee.employeeId,
      employeeName: employee.name,
      designation: employee.designation,
      department: employee.department?.name || '',
      employeeType: employee.employeeType,
      status: employee.status,
      presentDays: summary.presentDays,
      absentDays: summary.absentDays,
      holidayDays: summary.holidayDays,
      incompleteDays: summary.incompleteDays,
      attendancePercentage: summary.attendancePercentage,
      totalHours: summary.totalHours,
      totalOvertime: employee.employeeType === 'Contract' ? null : summary.totalOvertime,
      totalShortTime: employee.employeeType === 'Contract' ? null : summary.totalShortTime,
      dayShiftDays: summary.dayShiftDays,
      nightShiftDays: summary.nightShiftDays,
      dayShiftHours: summary.dayShiftHours,
      nightShiftHours: summary.nightShiftHours,
      totalQty: summary.totalQty,
    });
  }

  return {
    period: { from: formatDateOnly(from), to: formatDateOnly(to) },
    totals: {
      employees: rows.length,
      presentDays: rows.reduce((s, r) => s + r.presentDays, 0),
      absentDays: rows.reduce((s, r) => s + r.absentDays, 0),
      totalHours: round2(rows.reduce((s, r) => s + r.totalHours, 0)),
      totalOvertime: round2(rows.reduce((s, r) => s + (r.totalOvertime || 0), 0)),
    },
    rows,
  };
}

const attendanceReport = asyncHandler(async (req, res) => {
  const data = await collectAttendanceReport(req.query);
  res.json({ success: true, ...data });
});

/** GET /api/reports/production — quantity produced, grouped by department or employee */
const productionReport = asyncHandler(async (req, res) => {
  const { filter, from, to } = await buildFilters(req.query);
  const groupBy = req.query.groupBy === 'employee' ? 'employee' : 'department';

  const entries = await DprEntry.find({ ...filter, qty: { $gt: 0 } }).lean();

  const buckets = new Map();
  entries.forEach((entry) => {
    const key =
      groupBy === 'employee'
        ? `${entry.employeeIdCode}|${entry.employeeName}`
        : entry.workingDepartmentName || 'Unassigned';
    if (!buckets.has(key)) buckets.set(key, { key, qty: 0, entries: 0, hours: 0, items: [] });
    const bucket = buckets.get(key);
    bucket.qty += entry.qty || 0;
    bucket.hours += entry.totalHours || 0;
    bucket.entries += 1;
    if (entry.workDescription) {
      bucket.items.push({
        date: formatDateOnly(entry.date),
        description: entry.workDescription,
        qty: entry.qty,
        unit: entry.qtyUnit,
      });
    }
  });

  const rows = [...buckets.values()]
    .map((b) => ({
      label: groupBy === 'employee' ? b.key.split('|')[1] : b.key,
      employeeId: groupBy === 'employee' ? b.key.split('|')[0] : null,
      quantity: round2(b.qty),
      entries: b.entries,
      hours: round2(b.hours),
      items: b.items.slice(0, 100),
    }))
    .sort((a, b) => b.quantity - a.quantity);

  res.json({
    success: true,
    period: { from: formatDateOnly(from), to: formatDateOnly(to) },
    groupBy,
    totals: { quantity: round2(rows.reduce((s, r) => s + r.quantity, 0)), entries: entries.length },
    rows,
  });
});

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

const COLUMN_SETS = {
  dpr: [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Employee ID', key: 'employeeId', width: 13 },
    { header: 'Employee Name', key: 'employeeName', width: 24 },
    { header: 'Type', key: 'employeeType', width: 12 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Team', key: 'team', width: 12 },
    { header: 'Shift', key: 'shift', width: 10 },
    { header: 'IN', key: 'inTime', width: 8 },
    { header: 'OUT', key: 'outTime', width: 8 },
    { header: 'Total Hours', key: 'totalHours', width: 12 },
    { header: 'Overtime', key: 'overtime', width: 11 },
    { header: 'Short Time', key: 'shortTime', width: 11 },
    { header: 'Work Done', key: 'workDescription', width: 34 },
    { header: 'Qty', key: 'qty', width: 9 },
    { header: 'Status', key: 'status', width: 12 },
  ],
  attendance: [
    { header: 'Employee ID', key: 'employeeId', width: 13 },
    { header: 'Employee Name', key: 'employeeName', width: 24 },
    { header: 'Designation', key: 'designation', width: 20 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Type', key: 'employeeType', width: 12 },
    { header: 'Present', key: 'presentDays', width: 10 },
    { header: 'Absent', key: 'absentDays', width: 10 },
    { header: 'Holidays', key: 'holidayDays', width: 10 },
    { header: 'Attendance %', key: 'attendancePercentage', width: 13 },
    { header: 'Day Shift Days', key: 'dayShiftDays', width: 14 },
    { header: 'Night Shift Days', key: 'nightShiftDays', width: 15 },
    { header: 'Total Hours', key: 'totalHours', width: 12 },
    { header: 'Overtime', key: 'totalOvertime', width: 11 },
    { header: 'Short Time', key: 'totalShortTime', width: 11 },
    { header: 'Quantity', key: 'totalQty', width: 11 },
  ],
};

/** GET /api/reports/export?type=dpr|attendance&format=excel|csv|pdf */
const exportReport = asyncHandler(async (req, res) => {
  const type = req.query.type === 'attendance' ? 'attendance' : 'dpr';
  const format = ['excel', 'csv', 'pdf'].includes(req.query.format) ? req.query.format : 'excel';

  const data =
    type === 'attendance'
      ? await collectAttendanceReport(req.query)
      : await collectDprReport(req.query);
  const rows = data.rows || [];
  const columns = COLUMN_SETS[type];
  const settings = await Settings.getSettings();
  const companyName = settings.company.name || 'Trading Engineers';
  const title = type === 'attendance' ? 'Attendance Summary' : 'Daily Production Report';
  const periodLabel = `${data.period.from} to ${data.period.to}`;
  const baseName = `${type}-report-${data.period.from}-to-${data.period.to}`;

  await recordAudit({
    req,
    action: 'EXPORT',
    entity: 'Report',
    entityLabel: `${title} (${periodLabel}) as ${format}`,
    note: `${rows.length} rows exported`,
  });

  if (format === 'csv') {
    const header = columns.map((c) => c.header).join(',');
    const body = rows
      .map((row) =>
        columns
          .map((c) => {
            const value = row[c.key];
            const text = value === null || value === undefined ? '' : String(value);
            return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
          })
          .join(',')
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
    return res.send(`${header}\n${body}`);
  }

  if (format === 'excel') {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = companyName;
    const sheet = workbook.addWorksheet(title);

    sheet.mergeCells(1, 1, 1, columns.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `${companyName} — ${title}`;
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF05054A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 26;

    sheet.mergeCells(2, 1, 2, columns.length);
    const periodCell = sheet.getCell(2, 1);
    periodCell.value = `Period: ${periodLabel}   |   Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    periodCell.font = { size: 10, color: { argb: 'FF64748B' } };
    periodCell.alignment = { horizontal: 'center' };

    sheet.addRow([]);
    const headerRow = sheet.addRow(columns.map((c) => c.header));
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF05054A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE28431' } } };
    });
    columns.forEach((c, i) => {
      sheet.getColumn(i + 1).width = c.width;
    });

    rows.forEach((row) => {
      sheet.addRow(columns.map((c) => (row[c.key] === null || row[c.key] === undefined ? '' : row[c.key])));
    });

    sheet.autoFilter = {
      from: { row: headerRow.number, column: 1 },
      to: { row: headerRow.number, column: columns.length },
    };
    sheet.views = [{ state: 'frozen', ySplit: headerRow.number }];

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
    await workbook.xlsx.write(res);
    return res.end();
  }

  // PDF
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}.pdf"`);
  doc.pipe(res);

  doc.fillColor(BRAND.navy).fontSize(18).text(companyName, { continued: false });
  doc.fillColor(BRAND.orange).fontSize(12).text(title);
  doc.fillColor('#64748b').fontSize(9).text(`Period: ${periodLabel}    Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
  doc.moveDown(0.6);

  const pdfColumns = columns.slice(0, type === 'attendance' ? 10 : 12);
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = usableWidth / pdfColumns.length;

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(doc.page.margins.left, y, usableWidth, 18).fill(BRAND.navy);
    doc.fillColor('#ffffff').fontSize(8);
    pdfColumns.forEach((col, i) => {
      doc.text(col.header, doc.page.margins.left + i * colWidth + 3, y + 5, {
        width: colWidth - 6,
        ellipsis: true,
      });
    });
    doc.y = y + 20;
    doc.fillColor('#0f172a');
  };

  drawHeader();
  doc.fontSize(7.5);

  rows.forEach((row, index) => {
    if (doc.y > doc.page.height - 50) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 });
      drawHeader();
      doc.fontSize(7.5);
    }
    const y = doc.y;
    if (index % 2 === 1) {
      doc.rect(doc.page.margins.left, y - 2, usableWidth, 14).fill('#F8FAFC');
      doc.fillColor('#0f172a');
    }
    pdfColumns.forEach((col, i) => {
      const value = row[col.key];
      doc.text(
        value === null || value === undefined ? '—' : String(value),
        doc.page.margins.left + i * colWidth + 3,
        y,
        { width: colWidth - 6, ellipsis: true, lineBreak: false }
      );
    });
    doc.y = y + 13;
  });

  doc.moveDown(0.8);
  doc.fillColor(BRAND.navy).fontSize(9).text(`Total rows: ${rows.length}`);
  doc.end();
  return undefined;
});

module.exports = { dprReport, attendanceReport, productionReport, exportReport };
