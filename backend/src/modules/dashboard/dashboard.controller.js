'use strict';

const Employee = require('../../models/Employee');
const Department = require('../../models/Department');
const DprEntry = require('../../models/DprEntry');
const Holiday = require('../../models/Holiday');
const Settings = require('../../models/Settings');
const { asyncHandler, ApiError } = require('../../utils/ApiError');
const { parseDateOnly, formatDateOnly, monthRange, eachDateInRange } = require('../../utils/dates');
const {
  deriveWorkingStatus,
  missingGroupsFor,
  isWeeklyOff,
} = require('../../services/attendanceService');
const { round2 } = require('../../services/timeCalculation');

/** Shared computation used by the dashboard and department views. */
async function loadDay(date) {
  const [employees, entries, holiday, settings] = await Promise.all([
    Employee.find({ status: 'Active' }).populate('department', 'name').lean(),
    DprEntry.find({ date }).lean(),
    Holiday.findOne({ date }).lean(),
    Settings.getSettings(),
  ]);

  const eligible = employees.filter(
    (e) => !e.joiningDate || parseDateOnly(e.joiningDate) <= date
  );
  const entryMap = new Map(entries.map((e) => [String(e.employee), e]));
  const weeklyOff = isWeeklyOff(date, settings);

  return { employees: eligible, entries, entryMap, holiday, weeklyOff };
}

/** GET /api/dashboard/overview?date= */
const overview = asyncHandler(async (req, res) => {
  const date = parseDateOnly(req.query.date) || parseDateOnly(new Date());
  const now = new Date();
  const { employees, entries, entryMap, holiday, weeklyOff } = await loadDay(date);

  let working = 0;
  let completed = 0;
  let incomplete = 0;
  let missingOut = 0;
  let totalHours = 0;
  let totalOvertime = 0;
  let totalShortTime = 0;
  let totalQty = 0;

  entries.forEach((entry) => {
    const status = deriveWorkingStatus(entry, { now });
    if (status === 'Working') working += 1;
    if (status === 'Completed') completed += 1;
    if (status === 'Incomplete') incomplete += 1;
    if (missingGroupsFor(entry, { now }).includes('outTime')) missingOut += 1;
    totalHours += entry.totalHours || 0;
    totalOvertime += entry.overtime || 0;
    totalShortTime += entry.shortTime || 0;
    totalQty += entry.qty || 0;
  });

  const present = entries.length;
  const absent = holiday || weeklyOff ? 0 : employees.length - present;
  const attendancePercentage =
    employees.length > 0 && !(holiday || weeklyOff)
      ? round2((present / employees.length) * 100)
      : holiday || weeklyOff
      ? 100
      : 0;

  // Month-to-date figures for the secondary tiles
  const { start } = monthRange(date.getUTCFullYear(), date.getUTCMonth() + 1);
  const monthEntries = await DprEntry.find({ date: { $gte: start, $lte: date } }).lean();
  const monthOvertime = round2(monthEntries.reduce((sum, e) => sum + (e.overtime || 0), 0));
  const monthHours = round2(monthEntries.reduce((sum, e) => sum + (e.totalHours || 0), 0));

  const [totalActive, totalInactive, permanentCount, contractCount] = await Promise.all([
    Employee.countDocuments({ status: 'Active' }),
    Employee.countDocuments({ status: 'Inactive' }),
    Employee.countDocuments({ status: 'Active', employeeType: 'Permanent' }),
    Employee.countDocuments({ status: 'Active', employeeType: 'Contract' }),
  ]);

  res.json({
    success: true,
    date: formatDateOnly(date),
    isHoliday: Boolean(holiday || weeklyOff),
    holidayLabel: holiday?.description || (weeklyOff ? 'Weekly Off' : null),
    stats: {
      totalActiveEmployees: totalActive,
      totalInactiveEmployees: totalInactive,
      permanentCount,
      contractCount,
      present,
      absent,
      attendancePercentage,
      currentlyWorking: working,
      completedDpr: completed,
      incompleteDpr: incomplete,
      missingOutTime: missingOut,
      totalHours: round2(totalHours),
      totalOvertime: round2(totalOvertime),
      totalShortTime: round2(totalShortTime),
      totalQty: round2(totalQty),
      monthToDateHours: monthHours,
      monthToDateOvertime: monthOvertime,
    },
    absentees: employees
      .filter((e) => !entryMap.has(String(e._id)))
      .slice(0, 50)
      .map((e) => ({
        id: e._id,
        employeeId: e.employeeId,
        name: e.name,
        department: e.department?.name || '',
        designation: e.designation,
      })),
  });
});

/** GET /api/dashboard/departments?date= — department-wise attendance breakdown */
const departmentBreakdown = asyncHandler(async (req, res) => {
  const date = parseDateOnly(req.query.date) || parseDateOnly(new Date());
  const now = new Date();
  const { employees, entries } = await loadDay(date);

  const departments = await Department.find({ isActive: true }).sort({ name: 1 }).lean();

  const rows = departments.map((dept) => {
    const deptEmployees = employees.filter((e) => String(e.department?._id) === String(dept._id));
    // Entries are grouped by the department actually worked in that day, so a
    // helper covering Painting counts towards Painting for the day.
    const deptEntries = entries.filter((e) => String(e.workingDepartment) === String(dept._id));

    const incomplete = deptEntries.filter(
      (e) => deriveWorkingStatus(e, { now }) === 'Incomplete'
    ).length;

    return {
      id: dept._id,
      name: dept.name,
      isHelperPool: dept.isHelperPool,
      hasTeams: dept.hasTeams,
      headcount: deptEmployees.length,
      present: deptEntries.length,
      absent: Math.max(0, deptEmployees.length - deptEntries.filter((e) => !e.isCrossAssigned).length),
      incomplete,
      totalHours: round2(deptEntries.reduce((s, e) => s + (e.totalHours || 0), 0)),
      overtime: round2(deptEntries.reduce((s, e) => s + (e.overtime || 0), 0)),
      qty: round2(deptEntries.reduce((s, e) => s + (e.qty || 0), 0)),
      attendancePercentage:
        deptEmployees.length > 0
          ? round2((deptEntries.length / deptEmployees.length) * 100)
          : 0,
    };
  });

  res.json({ success: true, date: formatDateOnly(date), departments: rows });
});

/** GET /api/dashboard/analytics?year=&month= — chart data for the analytics screen */
const analytics = asyncHandler(async (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getUTCFullYear();
  const month = Number(req.query.month) || now.getUTCMonth() + 1;
  if (month < 1 || month > 12) throw ApiError.badRequest('Month must be between 1 and 12');

  const { start, end } = monthRange(year, month);
  const today = parseDateOnly(now);
  const rangeEnd = end > today ? today : end;

  const [entries, activeCount, holidays, settings, departments] = await Promise.all([
    DprEntry.find({ date: { $gte: start, $lte: end } }).lean(),
    Employee.countDocuments({ status: 'Active' }),
    Holiday.find({ date: { $gte: start, $lte: end } }).lean(),
    Settings.getSettings(),
    Department.find({ isActive: true }).lean(),
  ]);

  const holidaySet = new Set(holidays.map((h) => formatDateOnly(h.date)));
  const byDate = new Map();
  entries.forEach((entry) => {
    const key = formatDateOnly(entry.date);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(entry);
  });

  const attendanceTrend = [];
  const overtimeTrend = [];
  const hoursTrend = [];
  const completionTrend = [];

  eachDateInRange(start, rangeEnd).forEach((date) => {
    const key = formatDateOnly(date);
    const dayEntries = byDate.get(key) || [];
    const holiday = holidaySet.has(key) || isWeeklyOff(date, settings);

    attendanceTrend.push({
      date: key,
      present: dayEntries.length,
      absent: holiday ? 0 : Math.max(0, activeCount - dayEntries.length),
      percentage: holiday
        ? null
        : activeCount
        ? round2((dayEntries.length / activeCount) * 100)
        : 0,
      isHoliday: holiday,
    });
    overtimeTrend.push({
      date: key,
      overtime: round2(dayEntries.reduce((s, e) => s + (e.overtime || 0), 0)),
      shortTime: round2(dayEntries.reduce((s, e) => s + (e.shortTime || 0), 0)),
    });
    hoursTrend.push({
      date: key,
      hours: round2(dayEntries.reduce((s, e) => s + (e.totalHours || 0), 0)),
      quantity: round2(dayEntries.reduce((s, e) => s + (e.qty || 0), 0)),
    });
    const completed = dayEntries.filter((e) => e.entryStatus === 'Completed').length;
    completionTrend.push({
      date: key,
      completion: dayEntries.length ? round2((completed / dayEntries.length) * 100) : null,
      entries: dayEntries.length,
    });
  });

  const deptMap = new Map(departments.map((d) => [String(d._id), d.name]));
  const byDepartment = new Map();
  entries.forEach((entry) => {
    const key = String(entry.workingDepartment);
    if (!byDepartment.has(key)) {
      byDepartment.set(key, { name: deptMap.get(key) || entry.workingDepartmentName, present: 0, hours: 0, overtime: 0, qty: 0 });
    }
    const bucket = byDepartment.get(key);
    bucket.present += 1;
    bucket.hours += entry.totalHours || 0;
    bucket.overtime += entry.overtime || 0;
    bucket.qty += entry.qty || 0;
  });

  const departmentComparison = [...byDepartment.values()]
    .map((d) => ({
      name: d.name,
      present: d.present,
      hours: round2(d.hours),
      overtime: round2(d.overtime),
      qty: round2(d.qty),
    }))
    .sort((a, b) => b.hours - a.hours);

  const shiftSplit = ['Day', 'Night'].map((name) => {
    const shiftEntries = entries.filter((e) => e.shiftName === name);
    return {
      shift: name,
      entries: shiftEntries.length,
      hours: round2(shiftEntries.reduce((s, e) => s + (e.totalHours || 0), 0)),
      overtime: round2(shiftEntries.reduce((s, e) => s + (e.overtime || 0), 0)),
    };
  });
  const contractEntries = entries.filter((e) => e.employeeType === 'Contract');
  shiftSplit.push({
    shift: 'Contract (no shift)',
    entries: contractEntries.length,
    hours: round2(contractEntries.reduce((s, e) => s + (e.totalHours || 0), 0)),
    overtime: 0,
  });

  res.json({
    success: true,
    period: { year, month, from: formatDateOnly(start), to: formatDateOnly(end) },
    totals: {
      entries: entries.length,
      hours: round2(entries.reduce((s, e) => s + (e.totalHours || 0), 0)),
      overtime: round2(entries.reduce((s, e) => s + (e.overtime || 0), 0)),
      shortTime: round2(entries.reduce((s, e) => s + (e.shortTime || 0), 0)),
      quantity: round2(entries.reduce((s, e) => s + (e.qty || 0), 0)),
      completionRate: entries.length
        ? round2(
            (entries.filter((e) => e.entryStatus === 'Completed').length / entries.length) * 100
          )
        : 0,
    },
    attendanceTrend,
    overtimeTrend,
    hoursTrend,
    completionTrend,
    departmentComparison,
    shiftSplit,
  });
});

/** GET /api/dashboard/notifications — factory-wide bell items, derived live */
const notifications = asyncHandler(async (req, res) => {
  const today = parseDateOnly(new Date());
  const now = new Date();
  const items = [];

  const { employees, entries, holiday, weeklyOff } = await loadDay(today);

  if (holiday || weeklyOff) {
    items.push({
      id: 'holiday-today',
      type: 'info',
      title: 'Today is a holiday',
      message: holiday?.description || 'Weekly off — DPR entry is blocked',
    });
  } else {
    const absent = employees.length - entries.length;
    if (absent > 0) {
      items.push({
        id: 'absent-today',
        type: 'warning',
        title: `${absent} employee${absent === 1 ? '' : 's'} absent today`,
        message: 'No DPR entry recorded so far',
        link: '/dpr/control-center',
      });
    }

    const incomplete = entries.filter((e) => missingGroupsFor(e, { now }).length > 0);
    if (incomplete.length) {
      items.push({
        id: 'incomplete-today',
        type: 'warning',
        title: `${incomplete.length} incomplete DPR entr${incomplete.length === 1 ? 'y' : 'ies'}`,
        message: 'Information is still pending for these employees',
        link: '/dpr/incomplete',
      });
    }

    const missingOut = entries.filter((e) => missingGroupsFor(e, { now }).includes('outTime'));
    if (missingOut.length) {
      items.push({
        id: 'missing-out',
        type: 'warning',
        title: `${missingOut.length} employee${missingOut.length === 1 ? '' : 's'} without OUT time`,
        message: 'Their shift has already ended',
        link: '/dpr/incomplete',
      });
    }
  }

  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowHoliday = await Holiday.findOne({ date: tomorrow }).lean();
  if (tomorrowHoliday) {
    items.push({
      id: 'holiday-tomorrow',
      type: 'info',
      title: 'Holiday tomorrow',
      message: `${formatDateOnly(tomorrow)} — ${tomorrowHoliday.description}`,
      link: '/holidays',
    });
  }

  res.json({ success: true, count: items.length, items });
});

/** GET /api/dashboard/search?q= — global search across employees, departments and DPR dates */
const globalSearch = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ success: true, results: { employees: [], departments: [], dprDates: [] } });
  }

  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const [employees, departments] = await Promise.all([
    Employee.find({ $or: [{ name: rx }, { employeeId: rx }, { mobileNo: rx }, { designation: rx }] })
      .populate('department', 'name')
      .limit(10)
      .lean(),
    Department.find({ name: rx, isActive: true }).limit(5).lean(),
  ]);

  // A date-like query jumps straight to that day's DPR.
  const dprDates = [];
  const asDate = parseDateOnly(q);
  if (asDate) {
    const count = await DprEntry.countDocuments({ date: asDate });
    dprDates.push({ date: formatDateOnly(asDate), entries: count });
  }

  return res.json({
    success: true,
    results: {
      employees: employees.map((e) => ({
        id: e._id,
        employeeId: e.employeeId,
        name: e.name,
        designation: e.designation,
        department: e.department?.name || '',
        status: e.status,
      })),
      departments: departments.map((d) => ({ id: d._id, name: d.name })),
      dprDates,
    },
  });
});

module.exports = { overview, departmentBreakdown, analytics, notifications, globalSearch };
