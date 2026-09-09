'use strict';

const mongoose = require('mongoose');
const { env } = require('./env');

const User = require('../models/User');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Shift = require('../models/Shift');
const Settings = require('../models/Settings');
const Employee = require('../models/Employee');
const DprEntry = require('../models/DprEntry');
const Holiday = require('../models/Holiday');
const AuditLog = require('../models/AuditLog');
const SalaryAdvance = require('../models/SalaryAdvance');
const MonthlyPayroll = require('../models/MonthlyPayroll');

const { generateEmployeeId } = require('../services/employeeIdService');
const { saveDprEntry } = require('../modules/dpr/dpr.service');
const { parseDateOnly, formatDateOnly } = require('../utils/dates');

const DEPARTMENTS = [
  { name: 'Office', nameHindi: 'कार्यालय', requiresWorkQtyByDefault: false },
  { name: 'Human Resources', nameHindi: 'मानव संसाधन', requiresWorkQtyByDefault: false },
  { name: 'Procurement', nameHindi: 'प्रोक्योरमेंट', requiresWorkQtyByDefault: false },
  { name: 'Marketing', nameHindi: 'मार्केटिंग', requiresWorkQtyByDefault: false },
  { name: 'Quality', nameHindi: 'क्वालिटी', requiresWorkQtyByDefault: true },
  { name: 'Store', nameHindi: 'स्टोर', requiresWorkQtyByDefault: false },
  { name: 'Logistics & Final Finishing', nameHindi: 'लोजिस्टिक्स अंतिम फिनिशिंग', requiresWorkQtyByDefault: true },
  { name: 'LED Section', nameHindi: 'एलईडी सेक्शन', requiresWorkQtyByDefault: true },
  { name: 'Cutting', nameHindi: 'कटिंग', requiresWorkQtyByDefault: true },
  { name: 'Bending', nameHindi: 'बेंडिंग', requiresWorkQtyByDefault: true },
  { name: 'Grinding', nameHindi: 'ग्राइंडिंग', requiresWorkQtyByDefault: true },
  { name: 'Welding', nameHindi: 'वेल्डिंग', requiresWorkQtyByDefault: true, hasTeams: true },
  { name: 'Straightening & Threading', nameHindi: 'स्ट्रेटनिंग एवं थ्रेडिंग', requiresWorkQtyByDefault: true },
  { name: 'Painting', nameHindi: 'पेंटिंग', requiresWorkQtyByDefault: true },
  { name: 'Helper', nameHindi: 'हेल्पर', requiresWorkQtyByDefault: true, isHelperPool: true },
  { name: 'Security & Support', nameHindi: 'सुरक्षा एवं सहायक', requiresWorkQtyByDefault: false },
];

const DEMO_EMPLOYEES = [
  { name: 'ADITYA KUMAR', designation: 'Bending Specialist', department: 'Bending', type: 'Permanent', shift: 'Day', mobile: '8423674966', baseSalary: 25000, salaryType: 'Monthly', otMultiplier: 1.5, customJoining: '2026-08-05' },
  { name: 'Parth Agrawal', designation: 'Procurement Manager', department: 'Procurement', type: 'Permanent', shift: 'Day', mobile: '9876500001', baseSalary: 38000, salaryType: 'Monthly', otMultiplier: 1.0 },
  { name: 'Ishu Vishwakarma', designation: 'HR Executive', department: 'Human Resources', type: 'Permanent', shift: 'Day', mobile: '9876500002', baseSalary: 32000, salaryType: 'Monthly', otMultiplier: 1.0 },
  { name: 'Gaurav Sharma', designation: 'Quality Inspector', department: 'Quality', type: 'Permanent', shift: 'Day', mobile: '9876500003', baseSalary: 24000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Amresh Singh', designation: 'Marketing Executive', department: 'Marketing', type: 'Permanent', shift: 'Day', mobile: '9876500004', baseSalary: 28000, salaryType: 'Monthly', otMultiplier: 1.0 },
  { name: 'Surendra Ahirwar', designation: 'Store Manager', department: 'Store', type: 'Permanent', shift: 'Day', mobile: '9876500005', baseSalary: 26000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Om Prakash Raikwar', designation: 'Logistics Operator', department: 'Logistics & Final Finishing', type: 'Permanent', shift: 'Day', mobile: '9876500006', baseSalary: 21000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Sanjay Kushwaha', designation: 'LED Technician', department: 'LED Section', type: 'Permanent', shift: 'Day', mobile: '9876500007', baseSalary: 22000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Rajpal Singh', designation: 'CNC Tube Operator', department: 'Cutting', type: 'Permanent', shift: 'Day', mobile: '9876500008', baseSalary: 23000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Uday Kumar', designation: 'CNC Laser Operator', department: 'Cutting', type: 'Permanent', shift: 'Day', mobile: '9876500009', baseSalary: 25000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Dharmendra Kushwaha', designation: 'Cutting Operator', department: 'Cutting', type: 'Permanent', shift: 'Night', mobile: '9876500010', baseSalary: 20000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Mohit Yadav', designation: 'Cutting Operator', department: 'Cutting', type: 'Permanent', shift: 'Night', mobile: '9876500011', baseSalary: 19500, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Karan Singh', designation: 'Bending Operator', department: 'Bending', type: 'Permanent', shift: 'Day', mobile: '9876500012', baseSalary: 21000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Umendra Yadav', designation: 'Bending Helper', department: 'Bending', type: 'Permanent', shift: 'Night', mobile: '9876500013', baseSalary: 15000, salaryType: 'Monthly', otMultiplier: 1.0 },
  { name: 'Sandeep Kushwaha', designation: 'Grinder Man', department: 'Grinding', type: 'Permanent', shift: 'Day', mobile: '9876500014', baseSalary: 18500, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Suresh Kumar Jha', designation: 'Welder', department: 'Welding', team: 'Team A', type: 'Permanent', shift: 'Day', mobile: '9876500015', baseSalary: 22000, salaryType: 'Monthly', otMultiplier: 2.0 },
  { name: 'Jitendra Kushwaha', designation: 'Welder', department: 'Welding', team: 'Team A', type: 'Permanent', shift: 'Day', mobile: '9876500016', baseSalary: 21000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Shivam Vishwakarma', designation: 'Welder', department: 'Welding', team: 'Team B', type: 'Permanent', shift: 'Day', mobile: '9876500017', baseSalary: 21500, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Krishna Mohan Gautam', designation: 'Contract Welder', department: 'Welding', team: 'Team C', type: 'Contract', mobile: '9876500018', baseSalary: 750, salaryType: 'Daily', otMultiplier: 1.5 },
  { name: 'Manish Jha', designation: 'Contract Welder', department: 'Welding', team: 'Team C', type: 'Contract', mobile: '9876500019', baseSalary: 700, salaryType: 'Daily', otMultiplier: 1.5 },
  { name: 'Nilesh Kumar', designation: 'Contract Grinder', department: 'Grinding', type: 'Contract', mobile: '9876500020', baseSalary: 650, salaryType: 'Daily', otMultiplier: 1.5 },
  { name: 'Washim Khan', designation: 'Straightening Operator', department: 'Straightening & Threading', type: 'Permanent', shift: 'Day', mobile: '9876500021', baseSalary: 20000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Ashraf Khan', designation: 'Painter', department: 'Painting', type: 'Permanent', shift: 'Day', mobile: '9876500022', baseSalary: 19000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Rakesh Kumar', designation: 'Painter', department: 'Painting', type: 'Permanent', shift: 'Night', mobile: '9876500023', baseSalary: 19000, salaryType: 'Monthly', otMultiplier: 1.5 },
  { name: 'Abhishek Kushwaha', designation: 'Helper', department: 'Helper', type: 'Permanent', shift: 'Day', mobile: '9876500024', baseSalary: 13500, salaryType: 'Monthly', otMultiplier: 1.0 },
  { name: 'Sanjeev Kumar', designation: 'Helper', department: 'Helper', type: 'Permanent', shift: 'Day', mobile: '9876500025', baseSalary: 13500, salaryType: 'Monthly', otMultiplier: 1.0 },
  { name: 'Anand Kumar', designation: 'Security Guard', department: 'Security & Support', type: 'Permanent', shift: 'Day', requiresWorkQty: false, mobile: '9876500026', baseSalary: 14000, salaryType: 'Monthly', otMultiplier: 1.0 },
  { name: 'Anoop Singh', designation: 'Security Guard', department: 'Security & Support', type: 'Permanent', shift: 'Night', requiresWorkQty: false, mobile: '9876500027', baseSalary: 14000, salaryType: 'Monthly', otMultiplier: 1.0 },
  { name: 'Pooja Devi', designation: 'Cook', department: 'Security & Support', type: 'Permanent', shift: 'Day', requiresWorkQty: false, mobile: '9876500028', baseSalary: 12000, salaryType: 'Monthly', otMultiplier: 1.0 },
];

async function seedData({ withDemo = true, withReset = false } = {}) {
  if (withReset) {
    if (env.isProduction) throw new Error('Refusing to --reset in production');
    await Promise.all([
      User.deleteMany({}),
      Employee.deleteMany({}),
      Department.deleteMany({}),
      Team.deleteMany({}),
      Shift.deleteMany({}),
      Holiday.deleteMany({}),
      DprEntry.deleteMany({}),
      AuditLog.deleteMany({}),
      SalaryAdvance.deleteMany({}),
      MonthlyPayroll.deleteMany({}),
      Settings.deleteMany({}),
    ]);
  }

  // --- Settings ---
  const settings = await Settings.getSettings();
  settings.company.name = 'Trading Engineers';
  settings.company.city = settings.company.city || 'Guna';
  settings.company.state = settings.company.state || 'Madhya Pradesh';
  await settings.save();

  // --- Admin ---
  let admin = await User.findOne({ username: env.seed.username.toLowerCase() });
  if (!admin) {
    admin = new User({
      username: env.seed.username.toLowerCase(),
      name: env.seed.name,
      email: env.seed.email,
      role: 'admin',
    });
    await admin.setPassword(env.seed.password);
    await admin.save();
    console.log(`[seed] admin created -> ${admin.username} / ${env.seed.password}`);
  }

  // --- Shifts ---
  const shiftDefs = [
    { name: 'Day', startTime: '09:15', endTime: '18:15' },
    { name: 'Night', startTime: '18:00', endTime: '02:30' },
  ];
  for (const def of shiftDefs) {
    const existing = await Shift.findOne({ name: def.name, isCurrent: true });
    if (!existing) {
      await Shift.create({ ...def, isCurrent: true, effectiveFrom: new Date(0), createdBy: admin._id });
    }
  }

  // --- Departments & teams ---
  const departmentMap = new Map();
  for (const def of DEPARTMENTS) {
    let dept = await Department.findOne({ name: def.name });
    if (!dept) {
      dept = await Department.create({ ...def, createdBy: admin._id });
    }
    departmentMap.set(dept.name, dept);
  }

  const welding = departmentMap.get('Welding');
  for (const teamName of ['Team A', 'Team B', 'Team C']) {
    const existing = await Team.findOne({ department: welding._id, name: teamName });
    if (!existing) {
      await Team.create({ name: teamName, department: welding._id, createdBy: admin._id });
    }
  }

  if (!withDemo) return;

  // --- Demo operators ---
  const operatorDefs = [
    {
      username: 'operator1',
      name: 'Registration Operator',
      password: 'Operator@123',
      permissions: {
        canRegisterEmployee: true,
        canEditEmployee: true,
        canAssignDepartment: true,
        canViewReports: true,
      },
    },
    {
      username: 'operator2',
      name: 'DPR Operator',
      password: 'Operator@123',
      permissions: { canEnterDpr: true, canViewReports: true },
    },
  ];
  for (const def of operatorDefs) {
    let operator = await User.findOne({ username: def.username });
    if (!operator) {
      operator = new User({
        username: def.username,
        name: def.name,
        role: 'operator',
        permissions: def.permissions,
        createdBy: admin._id,
      });
      await operator.setPassword(def.password);
      await operator.save();
    }
  }

  // --- Demo employees ---
  const defaultJoining = parseDateOnly('2026-08-01');
  const teams = await Team.find({}).lean();

  for (const def of DEMO_EMPLOYEES) {
    const existing = await Employee.findOne({ name: def.name });
    const joining = def.customJoining ? parseDateOnly(def.customJoining) : defaultJoining;

    if (existing) {
      if (!existing.salaryConfig || !existing.salaryConfig.baseSalary) {
        existing.salaryConfig = {
          salaryType: def.salaryType || (def.type === 'Contract' ? 'Daily' : 'Monthly'),
          baseSalary: def.baseSalary || (def.type === 'Contract' ? 650 : 18000),
          effectiveFrom: joining,
          otMultiplier: def.otMultiplier || 1.5,
          paymentMode: 'Bank Transfer',
          recalculateHistorical: false,
        };
        await existing.save();
      }
      continue;
    }

    const dept = departmentMap.get(def.department);
    const team = def.team ? teams.find((t) => t.name === def.team && String(t.department) === String(dept._id)) : null;

    const taken = await Employee.find({ employeeId: /^2608/ }).select('employeeId').lean();
    const employeeId = generateEmployeeId(2026, 8, taken.map((t) => t.employeeId));

    const otMultMap = { 2: '2x', 1.5: '1.5x', 1: '1x', '2': '2x', '1.5': '1.5x', '1': '1x', '2x': '2x', '1.5x': '1.5x', '1x': '1x' };

    await Employee.create({
      employeeId,
      name: def.name,
      designation: def.designation,
      fathersName: '',
      mobileNo: def.mobile || '',
      address: 'Guna, Madhya Pradesh',
      employeeType: def.type,
      shiftCategory: def.type === 'Contract' ? 'Not Applicable' : def.shift || 'Day',
      requiresWorkQty:
        def.requiresWorkQty !== undefined ? def.requiresWorkQty : dept.requiresWorkQtyByDefault,
      department: dept._id,
      team: team ? team._id : null,
      salaryConfig: {
        salaryType: def.salaryType || (def.type === 'Contract' ? 'Daily' : 'Monthly'),
        baseRate: def.baseSalary || (def.type === 'Contract' ? 650 : 18000),
        standardDailyHours: 8,
        otMultiplier: otMultMap[def.otMultiplier] || '1.5x',
        paymentMode: 'Bank Transfer',
        paidLeavesPerMonth: 0,
      },
      joiningDate: joining,
      joiningYear: 2026,
      joiningMonth: 8,
      createdBy: admin._id,
    });
  }

  // --- Demo Salary Advances ---
  const sampleAdvances = [
    { name: 'ADITYA KUMAR', amount: 4000, installments: 1, reason: 'Emergency personal advance' },
    { name: 'Suresh Kumar Jha', amount: 6000, installments: 3, reason: 'Family medical expense' },
    { name: 'Rajpal Singh', amount: 4000, installments: 2, reason: 'Home repairs' },
    { name: 'Abhishek Kushwaha', amount: 3000, installments: 3, reason: 'Festival advance' },
  ];

  for (const adv of sampleAdvances) {
    const emp = await Employee.findOne({ name: adv.name });
    if (!emp) continue;
    const existingAdv = await SalaryAdvance.findOne({ employee: emp._id, status: 'Active' });
    if (!existingAdv) {
      const emi = Math.round(adv.amount / adv.installments);
      await SalaryAdvance.create({
        employee: emp._id,
        issuedBy: admin._id,
        issuedDate: new Date('2026-08-15'),
        totalAmount: adv.amount,
        purpose: adv.reason,
        repaymentType: adv.installments > 1 ? 'Installments' : 'FullNextMonth',
        totalInstallments: adv.installments,
        installmentAmount: emi,
        remainingBalance: adv.amount,
        status: 'Active',
      });
    }
  }

  console.log('[seed] Seeding completed successfully.');
}

module.exports = { seedData };
