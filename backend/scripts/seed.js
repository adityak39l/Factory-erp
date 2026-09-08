'use strict';

/**
 * Seeds the database so the system is usable immediately.
 *
 *   npm run seed            -> admin + settings + shifts + departments/teams
 *   npm run seed -- --demo  -> the above plus sample employees and a sample DPR day
 *   npm run seed -- --reset -> wipes existing data first (never use in production)
 */

const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/config/db');
const { env, validateEnv } = require('../src/config/env');

const User = require('../src/models/User');
const Department = require('../src/models/Department');
const Team = require('../src/models/Team');
const Shift = require('../src/models/Shift');
const Settings = require('../src/models/Settings');
const Employee = require('../src/models/Employee');
const DprEntry = require('../src/models/DprEntry');
const Holiday = require('../src/models/Holiday');
const AuditLog = require('../src/models/AuditLog');
const SalaryAdvance = require('../src/models/SalaryAdvance');
const MonthlyPayroll = require('../src/models/MonthlyPayroll');

const { generateEmployeeId } = require('../src/services/employeeIdService');
const { saveDprEntry } = require('../src/modules/dpr/dpr.service');
const { parseDateOnly, formatDateOnly } = require('../src/utils/dates');

const args = process.argv.slice(2);
const withDemo = args.includes('--demo');
const withReset = args.includes('--reset');

/** Departments mirroring the client's actual factory floor. */
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
  // Support roles: no work description / quantity is ever expected from them.
  { name: 'Anand Kumar', designation: 'Security Guard', department: 'Security & Support', type: 'Permanent', shift: 'Day', requiresWorkQty: false, mobile: '9876500026', baseSalary: 14000, salaryType: 'Monthly', otMultiplier: 1.0 },
  { name: 'Anoop Singh', designation: 'Security Guard', department: 'Security & Support', type: 'Permanent', shift: 'Night', requiresWorkQty: false, mobile: '9876500027', baseSalary: 14000, salaryType: 'Monthly', otMultiplier: 1.0 },
  { name: 'Pooja Devi', designation: 'Cook', department: 'Security & Support', type: 'Permanent', shift: 'Day', requiresWorkQty: false, mobile: '9876500028', baseSalary: 12000, salaryType: 'Monthly', otMultiplier: 1.0 },
];

async function run() {
  validateEnv();
  await connectDatabase();
  console.log(`[seed] connected to ${mongoose.connection.name}`);

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
    console.log('[seed] existing data cleared');
  }

  // --- Settings -------------------------------------------------------
  const settings = await Settings.getSettings();
  settings.company.name = 'Trading Engineers';
  settings.company.city = settings.company.city || 'Guna';
  settings.company.state = settings.company.state || 'Madhya Pradesh';
  await settings.save();

  // --- Admin ----------------------------------------------------------
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
    console.log(`[seed] admin created  ->  ${admin.username} / ${env.seed.password}`);
  } else {
    console.log(`[seed] admin already exists -> ${admin.username}`);
  }

  // --- Shifts ---------------------------------------------------------
  const shiftDefs = [
    { name: 'Day', startTime: '09:15', endTime: '18:15' },
    { name: 'Night', startTime: '18:00', endTime: '02:30' },
  ];
  for (const def of shiftDefs) {
    const existing = await Shift.findOne({ name: def.name, isCurrent: true });
    if (!existing) {
      await Shift.create({ ...def, isCurrent: true, effectiveFrom: new Date(0), createdBy: admin._id });
      console.log(`[seed] shift ${def.name} ${def.startTime}-${def.endTime}`);
    }
  }

  // --- Departments & teams --------------------------------------------
  const departmentMap = new Map();
  for (const def of DEPARTMENTS) {
    let dept = await Department.findOne({ name: def.name });
    if (!dept) {
      dept = await Department.create({ ...def, createdBy: admin._id });
      console.log(`[seed] department ${dept.name}`);
    }
    departmentMap.set(dept.name, dept);
  }

  const welding = departmentMap.get('Welding');
  for (const teamName of ['Team A', 'Team B', 'Team C']) {
    const existing = await Team.findOne({ department: welding._id, name: teamName });
    if (!existing) {
      await Team.create({ name: teamName, department: welding._id, createdBy: admin._id });
      console.log(`[seed] team Welding / ${teamName}`);
    }
  }

  if (!withDemo) {
    console.log('\n[seed] base setup complete. Re-run with --demo for sample employees and a sample DPR day.');
    await disconnectDatabase();
    return;
  }

  // --- Demo operators --------------------------------------------------
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
      console.log(`[seed] operator created -> ${def.username} / ${def.password}`);
    }
  }

  // --- Demo employees --------------------------------------------------
  const joining = parseDateOnly('2026-08-01');
  const teams = await Team.find({}).lean();

  for (const def of DEMO_EMPLOYEES) {
    const existing = await Employee.findOne({ name: def.name });
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
        baseSalary: def.baseSalary || (def.type === 'Contract' ? 650 : 18000),
        effectiveFrom: joining,
        otMultiplier: def.otMultiplier || 1.5,
        paymentMode: 'Bank Transfer',
        recalculateHistorical: false,
      },
      joiningDate: joining,
      joiningYear: 2026,
      joiningMonth: 8,
      createdBy: admin._id,
    });
  }
  console.log(`[seed] ${DEMO_EMPLOYEES.length} demo employees ensured`);

  // --- Demo Salary Advances --------------------------------------------
  const sampleAdvances = [
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
      console.log(`[seed] advance of ₹${adv.amount} issued for ${emp.name}`);
    }
  }

  // --- Demo DPR for today ----------------------------------------------
  const today = parseDateOnly(new Date());
  const holidayToday = await Holiday.findOne({ date: today });
  if (holidayToday) {
    console.log('[seed] today is a holiday — skipping sample DPR');
  } else {
    const dprOperator = (await User.findOne({ username: 'operator2' })) || admin;
    const employees = await Employee.find({ status: 'Active' }).limit(20);

    const samples = [
      { in: '09:12', out: '18:20', work: 'Pole connection plate', qty: 38 },
      { in: '09:05', out: '18:19', work: 'NNJ connection plate', qty: 15 },
      { in: '09:02', out: '18:17', work: 'CM project connection plate', qty: 30 },
      { in: '08:59', out: '18:01', work: '114 OD pipe joint + grinding', qty: 7 },
      { in: '18:10', out: '02:22', work: 'Night shift plasma cutting', qty: 12 }, // crosses midnight
      { in: '09:00', out: null, work: null, qty: null }, // still working — OUT pending
      { in: '09:15', out: '18:05', work: null, qty: null }, // work details pending
    ];

    let created = 0;
    for (let i = 0; i < employees.length; i += 1) {
      const employee = employees[i];
      if (i % 7 === 5) continue; // leave a few absent on purpose
      const sample = samples[i % samples.length];
      const payload = {};
      if (sample.in) payload.inTime = sample.in;
      if (sample.out) payload.outTime = sample.out;
      if (sample.work) {
        payload.workDescription = sample.work;
        payload.qty = sample.qty;
      }
      if (employee.employeeType !== 'Contract') {
        payload.shiftName = sample.in === '18:10' ? 'Night' : employee.shiftCategory;
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        await saveDprEntry({
          employeeId: employee._id,
          date: formatDateOnly(today),
          payload,
          user: dprOperator,
          canOverride: false,
          req: null,
        });
        created += 1;
      } catch (err) {
        console.warn(`[seed] skipped DPR for ${employee.name}: ${err.message}`);
      }
    }
    console.log(`[seed] ${created} sample DPR entries created for ${formatDateOnly(today)}`);
  }

  console.log('\n[seed] demo setup complete.');
  console.log(`       admin      : ${env.seed.username} / ${env.seed.password}`);
  console.log('       operator1  : operator1 / Operator@123   (registration only)');
  console.log('       operator2  : operator2 / Operator@123   (DPR entry only)\n');

  await disconnectDatabase();
}

run().catch(async (err) => {
  console.error('[seed] failed:', err);
  try {
    await disconnectDatabase();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
