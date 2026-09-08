'use strict';

const { parse: parseCsv } = require('csv-parse/sync');
const ExcelJS = require('exceljs');
const Employee = require('../../models/Employee');
const Department = require('../../models/Department');
const Team = require('../../models/Team');
const { ApiError, asyncHandler } = require('../../utils/ApiError');
const { recordAudit } = require('../../services/auditService');
const { generateEmployeeId } = require('../../services/employeeIdService');
const { parseDateOnly } = require('../../utils/dates');

/**
 * Bulk employee import: Upload -> Validate -> Preview -> Confirm -> Import.
 * Invalid rows are NEVER imported; the user sees exactly what is wrong per row.
 */

const COLUMNS = [
  'name',
  'designation',
  'fathersName',
  'mobileNo',
  'email',
  'address',
  'department',
  'team',
  'employeeType',
  'shiftCategory',
  'requiresWorkQty',
  'joiningDate',
  'aadharNo',
  'bankName',
  'accountNo',
  'ifsc',
];

const normaliseHeader = (h) =>
  String(h || '')
    .replace(/[\s_-]+/g, '')
    .toLowerCase();

const HEADER_ALIASES = COLUMNS.reduce((acc, col) => {
  acc[normaliseHeader(col)] = col;
  return acc;
}, {
  employeename: 'name',
  fullname: 'name',
  post: 'designation',
  designationpost: 'designation',
  father: 'fathersName',
  fathername: 'fathersName',
  mobile: 'mobileNo',
  phone: 'mobileNo',
  contact: 'mobileNo',
  dept: 'department',
  departmentname: 'department',
  type: 'employeeType',
  shift: 'shiftCategory',
  doj: 'joiningDate',
  dateofjoining: 'joiningDate',
  aadhaar: 'aadharNo',
  aadhar: 'aadharNo',
  account: 'accountNo',
  accountnumber: 'accountNo',
  ifsccode: 'ifsc',
});

async function parseUpload(file, bodyRows) {
  if (Array.isArray(bodyRows) && bodyRows.length) return bodyRows;
  if (!file) throw ApiError.badRequest('Upload a .csv or .xlsx file, or send rows in the request body');

  const name = (file.originalname || '').toLowerCase();

  if (name.endsWith('.csv') || file.mimetype === 'text/csv') {
    const records = parseCsv(file.buffer, {
      columns: (header) => header.map((h) => HEADER_ALIASES[normaliseHeader(h)] || normaliseHeader(h)),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
    return records;
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw ApiError.badRequest('The workbook has no sheets');

    const headerRow = sheet.getRow(1);
    const headers = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col] = HEADER_ALIASES[normaliseHeader(cell.text)] || normaliseHeader(cell.text);
    });

    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const record = {};
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const key = headers[col];
        if (!key) return;
        record[key] = cell.text ? String(cell.text).trim() : '';
      });
      if (Object.values(record).some((v) => v !== '')) rows.push(record);
    });
    return rows;
  }

  throw ApiError.badRequest('Unsupported file type. Upload a .csv or .xlsx file.');
}

const truthy = (v) => ['1', 'true', 'yes', 'y'].includes(String(v ?? '').trim().toLowerCase());

/**
 * Validates every row against master data and business rules.
 * Returns per-row status so the UI can show a precise preview before importing.
 */
async function validateRows(rows) {
  const departments = await Department.find({ isActive: true }).lean();
  const teams = await Team.find({ isActive: true }).lean();
  const existing = await Employee.find({}).select('name mobileNo employeeId').lean();

  const deptByName = new Map(departments.map((d) => [d.name.trim().toLowerCase(), d]));
  const existingMobiles = new Set(existing.filter((e) => e.mobileNo).map((e) => e.mobileNo));
  const existingNames = new Set(existing.map((e) => `${e.name.trim().toLowerCase()}`));

  const seenMobiles = new Set();
  const seenNames = new Set();

  return rows.map((raw, index) => {
    const row = {};
    COLUMNS.forEach((col) => {
      row[col] = raw[col] !== undefined && raw[col] !== null ? String(raw[col]).trim() : '';
    });

    const errors = [];
    const warnings = [];

    if (!row.name) errors.push('Name is required');

    const dept = deptByName.get(row.department.toLowerCase());
    if (!row.department) errors.push('Department is required');
    else if (!dept) errors.push(`Department "${row.department}" does not exist`);

    let team = null;
    if (row.team && dept) {
      team = teams.find(
        (t) =>
          String(t.department) === String(dept._id) &&
          t.name.trim().toLowerCase() === row.team.toLowerCase()
      );
      if (!team) errors.push(`Team "${row.team}" does not exist in ${dept.name}`);
      else if (!dept.hasTeams) errors.push(`${dept.name} is not configured to use teams`);
    }

    const employeeType = row.employeeType || 'Permanent';
    if (!['Permanent', 'Contract'].includes(employeeType)) {
      errors.push('Employee type must be Permanent or Contract');
    }

    let shiftCategory = row.shiftCategory || 'Day';
    if (employeeType === 'Contract') {
      shiftCategory = 'Not Applicable';
      if (row.shiftCategory && row.shiftCategory !== 'Not Applicable') {
        warnings.push('Shift ignored — Contract employees do not follow fixed shifts');
      }
    } else if (!['Day', 'Night'].includes(shiftCategory)) {
      errors.push('Shift must be Day or Night for permanent employees');
    }

    const joiningDate = parseDateOnly(row.joiningDate);
    if (!row.joiningDate) errors.push('Joining date is required (YYYY-MM-DD)');
    else if (!joiningDate) errors.push(`Joining date "${row.joiningDate}" is not a valid YYYY-MM-DD date`);

    if (row.mobileNo && !/^[6-9]\d{9}$/.test(row.mobileNo)) {
      errors.push('Mobile number must be a valid 10-digit Indian number');
    }
    if (row.mobileNo && existingMobiles.has(row.mobileNo)) {
      errors.push('An employee with this mobile number already exists');
    }
    if (row.mobileNo && seenMobiles.has(row.mobileNo)) {
      errors.push('Duplicate mobile number inside this file');
    }
    if (row.mobileNo) seenMobiles.add(row.mobileNo);

    const nameKey = row.name.toLowerCase();
    if (nameKey && seenNames.has(nameKey)) errors.push('Duplicate employee name inside this file');
    if (nameKey && existingNames.has(nameKey)) {
      warnings.push('An employee with this name already exists — check this is a different person');
    }
    if (nameKey) seenNames.add(nameKey);

    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('Email address is not valid');
    if (row.aadharNo && !/^\d{12}$/.test(row.aadharNo.replace(/\s/g, ''))) {
      errors.push('Aadhar number must be exactly 12 digits');
    }
    if (row.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(row.ifsc.toUpperCase())) {
      errors.push('IFSC code format is invalid (e.g. SBIN0001234)');
    }
    if (row.accountNo && !/^\d{6,20}$/.test(row.accountNo)) {
      errors.push('Bank account number must be 6-20 digits');
    }

    return {
      rowNumber: index + 2, // +2 = header row plus 1-based indexing, matching the spreadsheet
      valid: errors.length === 0,
      errors,
      warnings,
      data: {
        ...row,
        employeeType,
        shiftCategory,
        requiresWorkQty:
          row.requiresWorkQty === ''
            ? dept?.requiresWorkQtyByDefault ?? true
            : truthy(row.requiresWorkQty),
        departmentId: dept ? String(dept._id) : null,
        teamId: team ? String(team._id) : null,
        joiningDate: joiningDate ? joiningDate.toISOString().slice(0, 10) : row.joiningDate,
      },
    };
  });
}

/** POST /api/employees/import/validate */
const validateImport = asyncHandler(async (req, res) => {
  const rows = await parseUpload(req.file, req.body?.rows);
  if (!rows.length) throw ApiError.badRequest('No data rows found in the upload');
  if (rows.length > 1000) throw ApiError.badRequest('Please import at most 1000 employees at a time');

  const results = await validateRows(rows);
  const validCount = results.filter((r) => r.valid).length;

  res.json({
    success: true,
    summary: {
      total: results.length,
      valid: validCount,
      invalid: results.length - validCount,
      warnings: results.filter((r) => r.warnings.length).length,
    },
    rows: results,
    columns: COLUMNS,
  });
});

/** POST /api/employees/import/confirm — imports ONLY the rows that pass validation */
const confirmImport = asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) throw ApiError.badRequest('No rows supplied for import');

  const results = await validateRows(rows);
  const validRows = results.filter((r) => r.valid);
  if (!validRows.length) {
    throw ApiError.badRequest('None of the supplied rows are valid — nothing was imported');
  }

  const created = [];
  const failed = [];

  // Sequential on purpose: employee ID generation must observe previous inserts.
  for (const row of validRows) {
    const data = row.data;
    try {
      const joining = parseDateOnly(data.joiningDate);
      const year = joining.getUTCFullYear();
      const month = joining.getUTCMonth() + 1;
      const prefix = `${String(year % 100).padStart(2, '0')}${String(month).padStart(2, '0')}`;
      // eslint-disable-next-line no-await-in-loop
      const taken = await Employee.find({ employeeId: new RegExp(`^${prefix}`) })
        .select('employeeId')
        .lean();
      const employeeId = generateEmployeeId(year, month, taken.map((t) => t.employeeId));

      const employee = new Employee({
        employeeId,
        name: data.name,
        designation: data.designation,
        fathersName: data.fathersName,
        mobileNo: data.mobileNo,
        email: data.email,
        address: data.address,
        aadharNo: data.aadharNo ? data.aadharNo.replace(/\s/g, '') : '',
        bankDetails: {
          bankName: data.bankName,
          accountNo: data.accountNo,
          ifsc: data.ifsc ? data.ifsc.toUpperCase() : '',
        },
        employeeType: data.employeeType,
        shiftCategory: data.shiftCategory,
        requiresWorkQty: data.requiresWorkQty,
        department: data.departmentId,
        team: data.teamId,
        joiningDate: joining,
        joiningYear: year,
        joiningMonth: month,
        createdBy: req.user._id,
      });
      // eslint-disable-next-line no-await-in-loop
      await employee.save();
      created.push({ rowNumber: row.rowNumber, employeeId, name: employee.name });
    } catch (err) {
      failed.push({ rowNumber: row.rowNumber, name: data.name, error: err.message });
    }
  }

  await recordAudit({
    req,
    action: 'BULK_IMPORT',
    entity: 'Employee',
    entityLabel: `${created.length} employees imported`,
    after: { created: created.length, skipped: results.length - validRows.length, failed: failed.length },
  });

  res.json({
    success: true,
    imported: created.length,
    skipped: results.length - validRows.length,
    failed,
    created,
  });
});

/** GET /api/employees/import/template — downloadable CSV template with the right headers */
const downloadTemplate = asyncHandler(async (req, res) => {
  const sample = [
    COLUMNS.join(','),
    'Rahul Sharma,Welder,Ram Sharma,9876543210,rahul@example.com,"Guna, MP",Welding,Team A,Permanent,Day,true,2026-08-01,123456789012,State Bank of India,50100123456789,SBIN0001234',
    'Anand Kumar,Guard,Suresh Kumar,9876543211,,Guna,Security,,Permanent,Night,false,2026-08-01,,,,',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="employee-import-template.csv"');
  res.send(sample);
});

module.exports = { validateImport, confirmImport, downloadTemplate, validateRows, COLUMNS };
