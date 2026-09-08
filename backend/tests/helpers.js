'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Department = require('../src/models/Department');
const Team = require('../src/models/Team');
const Shift = require('../src/models/Shift');
const Employee = require('../src/models/Employee');
const Settings = require('../src/models/Settings');
const { generateEmployeeId } = require('../src/services/employeeIdService');

const app = createApp();

async function createAdmin(overrides = {}) {
  const admin = new User({
    username: overrides.username || 'admin',
    name: overrides.name || 'System Administrator',
    email: overrides.email || 'admin@tradingengineers.com',
    role: 'admin',
  });
  await admin.setPassword(overrides.password || 'Admin@12345');
  await admin.save();
  return admin;
}

async function createOperator(permissions = {}, overrides = {}) {
  const operator = new User({
    username: overrides.username || `operator_${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name || 'Test Operator',
    role: 'operator',
    permissions,
  });
  await operator.setPassword(overrides.password || 'Operator@123');
  await operator.save();
  return operator;
}

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body.token;
}

async function tokenFor(user, password = 'Operator@123') {
  return login(user.username, password);
}

/** Standard masters used by most tests: Day + Night shifts, a few departments. */
async function seedMasters() {
  await Settings.getSettings();

  const [day, night] = await Promise.all([
    Shift.create({ name: 'Day', startTime: '09:15', endTime: '18:15', effectiveFrom: new Date(0) }),
    Shift.create({ name: 'Night', startTime: '18:00', endTime: '02:30', effectiveFrom: new Date(0) }),
  ]);

  const welding = await Department.create({ name: 'Welding', hasTeams: true });
  const painting = await Department.create({ name: 'Painting' });
  const helper = await Department.create({ name: 'Helper', isHelperPool: true });
  const support = await Department.create({
    name: 'Security & Support',
    requiresWorkQtyByDefault: false,
  });
  const teamA = await Team.create({ name: 'Team A', department: welding._id });

  return { day, night, welding, painting, helper, support, teamA };
}

async function createEmployee(overrides = {}) {
  const department = overrides.department;
  const year = overrides.joiningYear || 2026;
  const month = overrides.joiningMonth || 8;
  const taken = await Employee.find({}).select('employeeId').lean();

  return Employee.create({
    employeeId: generateEmployeeId(year, month, taken.map((t) => t.employeeId)),
    name: overrides.name || 'Test Employee',
    designation: overrides.designation || 'Operator',
    mobileNo: overrides.mobileNo || '',
    employeeType: overrides.employeeType || 'Permanent',
    shiftCategory:
      overrides.employeeType === 'Contract'
        ? 'Not Applicable'
        : overrides.shiftCategory || 'Day',
    requiresWorkQty:
      overrides.requiresWorkQty !== undefined ? overrides.requiresWorkQty : true,
    department,
    team: overrides.team || null,
    joiningDate: overrides.joiningDate || new Date(Date.UTC(year, month - 1, 1)),
    joiningYear: year,
    joiningMonth: month,
    status: overrides.status || 'Active',
    inactiveSince: overrides.inactiveSince || null,
    salaryConfig: overrides.salaryConfig || {
      salaryType: 'Monthly',
      baseRate: 0,
      standardDailyHours: 8,
      otMultiplier: '1x',
      paymentMode: 'Cash',
      paidLeavesPerMonth: 0,
    },
    salaryHistory: overrides.salaryHistory || [],
  });
}

/** Today as YYYY-MM-DD (UTC), which is what the API expects. */
const todayIso = () => new Date().toISOString().slice(0, 10);

module.exports = {
  app,
  request,
  createAdmin,
  createOperator,
  login,
  tokenFor,
  seedMasters,
  createEmployee,
  todayIso,
};
