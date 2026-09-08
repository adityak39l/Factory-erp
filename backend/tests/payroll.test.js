'use strict';

const {
  app,
  request,
  createAdmin,
  login,
  seedMasters,
  createEmployee,
} = require('./helpers');
const Employee = require('../src/models/Employee');
const DprEntry = require('../src/models/DprEntry');
const SalaryAdvance = require('../src/models/SalaryAdvance');
const MonthlyPayroll = require('../src/models/MonthlyPayroll');

let masters;
let adminToken;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  masters = await seedMasters();
  await createAdmin();
  adminToken = await login('admin', 'Admin@12345');
});

describe('Payroll & Salary Management System (Phase 2)', () => {
  it('registers employee with salary config and creates initial salary history', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set(auth(adminToken))
      .send({
        name: 'Vikram Singh',
        department: String(masters.welding._id),
        joiningDate: '2026-08-01',
        salaryType: 'Monthly',
        baseRate: 18000,
        otMultiplier: '1.5x',
        paymentMode: 'Bank',
        bankName: 'State Bank of India',
        accountNo: '123456789012',
        ifsc: 'SBIN0001234',
      });

    expect(res.status).toBe(201);
    expect(res.body.employee.salaryConfig.baseRate).toBe(18000);
    expect(res.body.employee.salaryConfig.salaryType).toBe('Monthly');
    expect(res.body.employee.salaryConfig.otMultiplier).toBe('1.5x');
    expect(res.body.employee.salaryHistory.length).toBe(1);
    expect(res.body.employee.salaryHistory[0].newRate).toBe(18000);
  });

  it('updates salary and appends to salary history', async () => {
    const emp = await createEmployee({
      name: 'Anil Kumar',
      department: masters.welding._id,
      joiningDate: '2026-01-01',
      salaryConfig: { salaryType: 'Monthly', baseRate: 15000 },
    });

    const res = await request(app)
      .put(`/api/employees/${emp._id}/salary`)
      .set(auth(adminToken))
      .send({
        newBaseRate: 18000,
        reason: 'Annual appraisal',
        effectiveFrom: '2026-08-01',
      });

    expect(res.status).toBe(200);
    expect(res.body.salaryConfig.baseRate).toBe(18000);
    expect(res.body.salaryHistory.length).toBe(1);
    expect(res.body.salaryHistory[0].previousRate).toBe(15000);
    expect(res.body.salaryHistory[0].newRate).toBe(18000);
  });

  it('issues an advance and tracks installments and remaining balance', async () => {
    const emp = await createEmployee({
      name: 'Sunil Verma',
      department: masters.welding._id,
      joiningDate: '2026-01-01',
    });

    const res = await request(app)
      .post('/api/advances')
      .set(auth(adminToken))
      .send({
        employee: String(emp._id),
        issuedDate: '2026-08-05',
        totalAmount: 9000,
        purpose: 'Medical emergency',
        repaymentType: 'Installments',
        totalInstallments: 3,
      });

    expect(res.status).toBe(201);
    expect(res.body.advance.totalAmount).toBe(9000);
    expect(res.body.advance.installmentAmount).toBe(3000);
    expect(res.body.advance.remainingBalance).toBe(9000);
    expect(res.body.advance.status).toBe('Active');

    const listRes = await request(app)
      .get('/api/advances')
      .set(auth(adminToken));
    expect(listRes.status).toBe(200);
    expect(listRes.body.advances.length).toBe(1);
  });

  it('calculates monthly payroll from DPR attendance, OT, short-time and advances', async () => {
    const emp = await createEmployee({
      name: 'Manoj Tiwari',
      department: masters.welding._id,
      joiningDate: '2026-01-01',
      salaryConfig: {
        salaryType: 'Monthly',
        baseRate: 26000,
        standardDailyHours: 8,
        otMultiplier: '1.5x',
      },
    });

    // Create DPR entries for August 2026 with all required snapshot fields
    await DprEntry.create([
      {
        employee: emp._id,
        employeeIdCode: emp.employeeId,
        employeeName: emp.name,
        employeeType: emp.employeeType,
        department: masters.welding._id,
        workingDepartment: masters.welding._id,
        date: new Date(Date.UTC(2026, 7, 3)),
        inTime: '08:00',
        outTime: '17:00',
        totalHours: 9,
        overtime: 1,
        shortTime: 0,
        entryStatus: 'Completed',
        shiftName: 'Day',
        enteredBy: emp._id,
      },
      {
        employee: emp._id,
        employeeIdCode: emp.employeeId,
        employeeName: emp.name,
        employeeType: emp.employeeType,
        department: masters.welding._id,
        workingDepartment: masters.welding._id,
        date: new Date(Date.UTC(2026, 7, 4)),
        inTime: '08:00',
        outTime: '15:30',
        totalHours: 7.5,
        overtime: 0,
        shortTime: 0.5,
        entryStatus: 'Completed',
        shiftName: 'Day',
        enteredBy: emp._id,
      },
    ]);

    // Issue an active advance
    await SalaryAdvance.create({
      employee: emp._id,
      issuedBy: emp._id,
      issuedDate: new Date(Date.UTC(2026, 7, 1)),
      totalAmount: 5000,
      repaymentType: 'Installments',
      totalInstallments: 5,
      installmentAmount: 1000,
      remainingBalance: 5000,
      status: 'Active',
    });

    // Calculate payroll for August 2026 (Month 8) with 26 working days
    const calcRes = await request(app)
      .post('/api/payroll/calculate')
      .set(auth(adminToken))
      .send({
        month: 8,
        year: 2026,
        workingDaysInMonth: 26,
      });

    expect(calcRes.status).toBe(200);
    const payroll = calcRes.body.payroll;
    expect(payroll.status).toBe('Calculated');
    expect(payroll.records.length).toBeGreaterThanOrEqual(1);

    const rec = payroll.records.find((r) => String(r.employee) === String(emp._id));
    expect(rec).toBeDefined();
    // Base rate: 26000, Daily rate = 26000 / 26 = 1000, Hourly rate = 1000 / 8 = 125
    expect(rec.dailyRate).toBe(1000);
    expect(rec.hourlyRate).toBe(125);
    expect(rec.presentDays).toBe(2);
    expect(rec.basicEarned).toBe(2000); // 2 days * 1000
    expect(rec.overtimeHours).toBe(1);
    expect(rec.overtimePay).toBe(187.5); // 1h * 125 * 1.5
    expect(rec.shortTimeHours).toBe(0.5);
    expect(rec.shortTimeDeduction).toBe(62.5); // 0.5h * 125
    expect(rec.grossSalary).toBe(2125); // 2000 + 187.5 - 62.5
    expect(rec.advanceDeductedAmount).toBe(1000); // 1000 EMI
    expect(rec.netPayable).toBe(1125); // 2125 - 1000

    // Test approval
    const approveRes = await request(app)
      .put(`/api/payroll/${payroll._id}/approve`)
      .set(auth(adminToken));
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.payroll.status).toBe('Approved');

    // Verify advance remaining balance was decremented to 4000
    const adv = await SalaryAdvance.findOne({ employee: emp._id });
    expect(adv.remainingBalance).toBe(4000);
    expect(adv.repayments.length).toBe(1);

    // Test mark paid
    const paidRes = await request(app)
      .put(`/api/payroll/${payroll._id}/mark-paid`)
      .set(auth(adminToken));
    expect(paidRes.status).toBe(200);
    expect(paidRes.body.payroll.status).toBe('Paid');
    expect(paidRes.body.payroll.lockedAt).toBeDefined();

    // Verify recalculation on Paid payroll is blocked with 403
    const recalcAttempt = await request(app)
      .post('/api/payroll/calculate')
      .set(auth(adminToken))
      .send({
        month: 8,
        year: 2026,
        workingDaysInMonth: 26,
      });
    expect(recalcAttempt.status).toBe(403);
  });

  it('serves financial calendar and short-time log', async () => {
    const emp = await createEmployee({
      name: 'Ramesh Patel',
      department: masters.welding._id,
      joiningDate: '2026-01-01',
      salaryConfig: { salaryType: 'Monthly', baseRate: 26000 },
    });

    await DprEntry.create({
      employee: emp._id,
      employeeIdCode: emp.employeeId,
      employeeName: emp.name,
      employeeType: emp.employeeType,
      department: masters.welding._id,
      workingDepartment: masters.welding._id,
      date: new Date(Date.UTC(2026, 7, 10)),
      inTime: '08:00',
      outTime: '16:00',
      totalHours: 8,
      overtime: 0,
      shortTime: 1,
      entryStatus: 'Completed',
      shiftName: 'Day',
      enteredBy: emp._id,
    });

    await SalaryAdvance.create({
      employee: emp._id,
      issuedBy: emp._id,
      issuedDate: new Date(Date.UTC(2026, 7, 5)),
      totalAmount: 3000,
      repaymentType: 'FullNextMonth',
      totalInstallments: 1,
      installmentAmount: 3000,
      remainingBalance: 3000,
      status: 'Active',
    });

    const calRes = await request(app)
      .get(`/api/employees/${emp._id}/financial-calendar?year=2026&month=8`)
      .set(auth(adminToken));
    expect(calRes.status).toBe(200);
    expect(calRes.body.events.some((e) => e.type === 'ADVANCE_ISSUED')).toBe(true);
    expect(calRes.body.events.some((e) => e.type === 'SHORT_TIME')).toBe(true);

    const stRes = await request(app)
      .get(`/api/employees/${emp._id}/shorttime-log?year=2026&month=8&workingDaysInMonth=26`)
      .set(auth(adminToken));
    expect(stRes.status).toBe(200);
    expect(stRes.body.totalShortTimeHours).toBe(1);
    expect(stRes.body.days.length).toBe(1);
  });
});
