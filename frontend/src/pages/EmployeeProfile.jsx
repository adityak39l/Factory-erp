import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { endpoints } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  KeyValue,
  Loading,
  Modal,
  Select,
  Stat,
  StatusBadge,
  Tabs,
} from '../components/ui';
import {
  hoursDisplay,
  isoToDisplay,
  monthOptions,
  WEEKDAYS,
  yearOptions,
} from '../utils/format';

const DAY_CLASS = {
  Present: 'present',
  Absent: 'absent',
  Holiday: 'holiday',
  Upcoming: 'future',
  'Not Joined': 'future',
  Left: 'future',
};

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, isAdmin } = useAuth();
  const canManageSalary = isAdmin || can('canManagePayroll');
  const canViewSalary = isAdmin || can('canViewSalary') || can('canManagePayroll');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState('calendar');
  const [dayDetail, setDayDetail] = useState(null);

  // Salary revision modal
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [newRateForm, setNewRateForm] = useState({
    newBaseRate: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    reason: '',
  });

  const employee = useApi(() => endpoints.employees.get(id), [id]);
  const attendance = useApi(() => endpoints.employees.attendance(id, { year, month }), [id, year, month]);
  const financialEvents = useApi(() => endpoints.employees.financialCalendar(id, { year, month }), [id, year, month]);
  const salaryPreview = useApi(() => endpoints.employees.salaryPreview(id, { year, month }), [id, year, month]);
  const shorttimeLog = useApi(() => endpoints.employees.shorttimeLog(id, { year, month }), [id, year, month]);
  const salaryHistory = useApi(() => endpoints.employees.salaryHistory(id), [id]);
  const empAdvances = useApi(() => endpoints.employees.advances(id), [id]);

  if (employee.loading && !employee.data) return <Loading text="Loading employee…" />;
  if (employee.error) return <ErrorState error={employee.error} onRetry={employee.reload} />;

  const e = employee.data.employee;
  const summary = attendance.data?.summary || {};
  const days = attendance.data?.days || [];
  const isContract = e.employeeType === 'Contract';

  // Map financial calendar events by date
  const eventsByDate = new Map();
  (financialEvents.data?.events || []).forEach((ev) => {
    if (!eventsByDate.has(ev.date)) eventsByDate.set(ev.date, []);
    eventsByDate.get(ev.date).push(ev);
  });

  // Pad calendar
  const firstWeekday = days.length ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay() : 0;

  const handleUpdateSalary = async (ev) => {
    ev.preventDefault();
    if (!newRateForm.newBaseRate) return;
    setSavingRate(true);
    try {
      await endpoints.employees.updateSalary(id, {
        newBaseRate: Number(newRateForm.newBaseRate),
        effectiveFrom: newRateForm.effectiveFrom,
        reason: newRateForm.reason,
      });
      setRateModalOpen(false);
      employee.reload();
      salaryHistory.reload();
      salaryPreview.reload();
    } catch (err) {
      alert(err.message || 'Failed to update salary');
    } finally {
      setSavingRate(false);
    }
  };

  const previewRecord = salaryPreview.data?.preview?.record;

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <div className="emp-cell">
            <Avatar name={e.name} orange />
            <div>
              <h1>{e.name}</h1>
              <div className="page-head__subtitle">
                <span className="mono">{e.employeeId}</span> · {e.designation || 'No designation'} ·{' '}
                {e.department?.name}
                {e.team?.name ? ` / ${e.team.name}` : ''}
              </div>
            </div>
          </div>
        </div>
        <div className="page-head__actions">
          <Badge tone={isContract ? 'violet' : 'navy'}>{e.employeeType}</Badge>
          <Badge tone={e.status === 'Active' ? 'green' : 'slate'} dot>
            {e.status}
          </Badge>
          <Button onClick={() => navigate('/employees')}>← All employees</Button>
        </div>
      </div>

      {e.status === 'Inactive' ? (
        <div className="mb-2">
          <Alert tone="neutral" title="This employee has left the company">
            They are hidden from every live screen and no longer accrue absence. Their complete
            history below is preserved permanently.
            {e.inactiveSince ? ` Inactive since ${isoToDisplay(e.inactiveSince)}.` : ''}
          </Alert>
        </div>
      ) : null}

      <div className="grid grid--stats mb-3">
        <Stat label="Present days" value={summary.presentDays ?? 0} icon="✅" tone="green" hint="This month" />
        <Stat label="Absent days" value={summary.absentDays ?? 0} icon="🔴" tone="red" hint="This month" />
        <Stat label="Holidays" value={summary.holidayDays ?? 0} icon="🔵" tone="blue" hint="This month" />
        <Stat
          label="Attendance"
          value={`${summary.attendancePercentage ?? 0}%`}
          icon="📊"
          tone="navy"
          hint="Present ÷ working days"
        />
        <Stat label="Total hours" value={hoursDisplay(summary.totalHours)} icon="⏱️" tone="navy" />
        {isContract ? (
          <Stat label="Overtime" value="Not applicable" icon="⚡" tone="slate" hint="Contract worker" />
        ) : (
          <>
            <Stat label="Overtime" value={hoursDisplay(summary.totalOvertime)} icon="⚡" tone="orange" />
            <Stat label="Short time" value={hoursDisplay(summary.totalShortTime)} icon="⏬" tone="amber" />
          </>
        )}
        <Stat label="Quantity produced" value={summary.totalQty ?? 0} icon="📦" tone="violet" />
      </div>

      <div className="filters">
        <Field label="Month">
          <Select value={month} onChange={(ev) => setMonth(Number(ev.target.value))}>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Year">
          <Select value={year} onChange={(ev) => setYear(Number(ev.target.value))}>
            {yearOptions(6).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <div className="filters__spacer" />
        <div className="legend" style={{ flexWrap: 'wrap' }}>
          <span className="legend__item">
            <span className="legend__swatch" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }} /> Present
          </span>
          <span className="legend__item">
            <span className="legend__swatch" style={{ background: '#fef2f2', borderColor: '#fecaca' }} /> Absent
          </span>
          <span className="legend__item">
            <span className="legend__swatch" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }} /> Holiday
          </span>
          <span className="legend__item">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#DC2626', marginRight: 4 }} /> Advance Taken
          </span>
          <span className="legend__item">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#D97706', marginRight: 4 }} /> Advance EMI
          </span>
          <span className="legend__item">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#7C3AED', marginRight: 4 }} /> Short-Time
          </span>
          <span className="legend__item">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#166534', marginRight: 4 }} /> Salary Paid
          </span>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'calendar', label: 'Attendance & Financial Calendar' },
          { key: 'register', label: 'DPR Register' },
          { key: 'salary', label: 'Salary Summary' },
          { key: 'history', label: 'Salary History' },
          { key: 'advances', label: 'Advances' },
          { key: 'details', label: 'Employee Details' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* Calendar Tab */}
      {tab === 'calendar' && (
        <Card>
          <div className="calendar">
            {WEEKDAYS.map((d) => (
              <div className="calendar__dow" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div className="calendar__day calendar__day--empty" key={`pad-${i}`} />
            ))}
            {days.map((day) => {
              const incomplete = day.workingStatus === 'Incomplete';
              const cls = incomplete ? 'incomplete' : DAY_CLASS[day.status] || '';
              const dayEvs = eventsByDate.get(day.date) || [];

              return (
                <button
                  type="button"
                  key={day.date}
                  className={`calendar__day ${cls ? `calendar__day--${cls}` : ''}`}
                  onClick={() => setDayDetail({ ...day, financialEvents: dayEvs })}
                  style={{ position: 'relative' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span className="calendar__num">{Number(day.date.slice(8))}</span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {dayEvs.map((ev, idx) => {
                        const dotColor = {
                          ADVANCE_ISSUED: '#DC2626',
                          ADVANCE_DEDUCTED: '#D97706',
                          SHORT_TIME: '#7C3AED',
                          SALARY_PAID: '#166534',
                        }[ev.type] || '#2563EB';

                        return (
                          <span
                            key={idx}
                            title={ev.label}
                            style={{
                              display: 'inline-block',
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              backgroundColor: dotColor,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <span className="calendar__meta">
                    {day.status === 'Present'
                      ? `${day.entry?.inTime || '—'}–${day.entry?.outTime || '…'}`
                      : day.status === 'Holiday'
                      ? day.holiday || 'Holiday'
                      : day.status === 'Absent'
                      ? 'Absent'
                      : ''}
                  </span>

                  {day.status === 'Present' && day.entry?.shiftName ? (
                    <span className="calendar__meta" style={{ marginTop: 'auto', fontWeight: 600 }}>
                      {day.entry.shiftName === 'Night' ? '🌙' : '☀️'} {hoursDisplay(day.entry.totalHours)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* DPR Register Tab */}
      {tab === 'register' && (
        <Card flush>
          {days.filter((d) => d.entry).length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shift</th>
                    <th>IN</th>
                    <th>OUT</th>
                    <th className="table__num">Hours</th>
                    <th className="table__num">OT</th>
                    <th className="table__num">Short</th>
                    <th>Work done</th>
                    <th className="table__num">Qty</th>
                    <th>Department</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {days
                    .filter((d) => d.entry)
                    .map((d) => (
                      <tr key={d.date}>
                        <td>{isoToDisplay(d.date)}</td>
                        <td>{d.entry.shiftName || '—'}</td>
                        <td className="mono">{d.entry.inTime || '—'}</td>
                        <td className="mono">{d.entry.outTime || '—'}</td>
                        <td className="table__num">{hoursDisplay(d.entry.totalHours)}</td>
                        <td className="table__num">{hoursDisplay(d.entry.overtime)}</td>
                        <td className="table__num">{hoursDisplay(d.entry.shortTime)}</td>
                        <td>{d.entry.workDescription || <span className="table__muted">—</span>}</td>
                        <td className="table__num">
                          {d.entry.qty !== null ? `${d.entry.qty} ${d.entry.qtyUnit || ''}` : '—'}
                        </td>
                        <td>{d.entry.workingDepartmentName}</td>
                        <td>
                          <StatusBadge status={d.workingStatus} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="📝" title="No DPR records" text="No entries exist for this month." />
          )}
        </Card>
      )}

      {/* Salary Summary Tab */}
      {tab === 'salary' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!canViewSalary ? (
            <Card>
              <EmptyState icon="🔒" title="Access Restricted" text="You do not have permission to view salary details." />
            </Card>
          ) : salaryPreview.loading && !salaryPreview.data ? (
            <Loading text="Loading salary breakdown..." />
          ) : previewRecord ? (
            <>
              <Card
                title={`Compensation Breakdown — ${new Date(2000, month - 1).toLocaleString('en-US', { month: 'long' })} ${year}`}
                subtitle={`Base Rate: ₹${previewRecord.baseRate?.toLocaleString('en-IN')} (${previewRecord.salaryType}) • Working Days: ${salaryPreview.data?.preview?.workingDaysInMonth || 26}`}
                actions={
                  <Badge tone={salaryPreview.data?.preview?.isFinalized ? 'green' : 'blue'} dot>
                    {salaryPreview.data?.preview?.payrollStatus}
                  </Badge>
                }
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
                  <div style={{ padding: 12, background: 'var(--slate-050)', borderRadius: 8 }}>
                    <div className="text-small text-muted">Daily Rate</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>₹{previewRecord.dailyRate?.toLocaleString('en-IN')}</div>
                    <div className="text-small text-muted" style={{ marginTop: 4 }}>
                      Hourly Rate: ₹{previewRecord.hourlyRate} (8 hrs)
                    </div>
                  </div>

                  <div style={{ padding: 12, background: 'var(--slate-050)', borderRadius: 8 }}>
                    <div className="text-small text-muted">Attendance Calculation</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {previewRecord.effectivePaidDays} Paid Days
                    </div>
                    <div className="text-small text-muted" style={{ marginTop: 4 }}>
                      Present: {previewRecord.presentDays}d | Absent: {previewRecord.absentDays}d
                      {previewRecord.isProRata ? ` | Pro-Rata eligible: ${previewRecord.proRataEligibleDays}d` : ''}
                    </div>
                  </div>

                  <div style={{ padding: 12, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
                    <div className="text-small" style={{ color: '#166534', fontWeight: 600 }}>Gross Salary</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#166534' }}>
                      ₹{previewRecord.grossSalary?.toLocaleString('en-IN')}
                    </div>
                    <div className="text-small text-muted" style={{ marginTop: 4 }}>
                      Basic + OT − Short-time
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
                    <h4 style={{ margin: '0 0 10px', color: '#166534', fontSize: 13, borderBottom: '1px solid #E2E8F0', paddingBottom: 6 }}>
                      EARNINGS (+)
                    </h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0' }}>
                      <span>Basic Earned ({previewRecord.effectivePaidDays}d × ₹{previewRecord.dailyRate}):</span>
                      <span style={{ fontWeight: 600 }}>₹{previewRecord.basicEarned?.toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0' }}>
                      <span>Overtime Pay ({previewRecord.overtimeHours}h × {previewRecord.otMultiplier}x):</span>
                      <span style={{ fontWeight: 600, color: '#166534' }}>+₹{previewRecord.overtimePay?.toLocaleString('en-IN')}</span>
                    </div>
                    {previewRecord.totalManualAdditions > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0' }}>
                        <span>Manual Additions / Bonus:</span>
                        <span style={{ fontWeight: 600, color: '#166534' }}>+₹{previewRecord.totalManualAdditions?.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
                    <h4 style={{ margin: '0 0 10px', color: '#DC2626', fontSize: 13, borderBottom: '1px solid #E2E8F0', paddingBottom: 6 }}>
                      DEDUCTIONS (−)
                    </h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0' }}>
                      <span>Short-Time Early Exit Cut ({previewRecord.shortTimeHours}h):</span>
                      <span style={{ fontWeight: 600, color: '#DC2626' }}>−₹{previewRecord.shortTimeDeduction?.toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0' }}>
                      <span>Advance Recovery (Loan EMI):</span>
                      <span style={{ fontWeight: 600, color: '#D97706' }}>−₹{previewRecord.advanceDeductedAmount?.toLocaleString('en-IN')}</span>
                    </div>
                    {previewRecord.totalManualDeductions > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6px 0' }}>
                        <span>Manual Deductions / Penalties:</span>
                        <span style={{ fontWeight: 600, color: '#DC2626' }}>−₹{previewRecord.totalManualDeductions?.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 16,
                    padding: '16px 20px',
                    background: '#DCFCE7',
                    border: '2px solid #86EFAC',
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                      GRAND TOTAL (NET PAYABLE TO EMPLOYEE)
                    </div>
                    <div className="text-small" style={{ color: '#15803D' }}>
                      Calculated from verified DPR attendance, OT, early exits and active advance recovery
                    </div>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#166534' }}>
                    ₹{previewRecord.netPayable?.toLocaleString('en-IN')}
                  </div>
                </div>
              </Card>

              <Card
                title={`Short-Time Early Exit Log (${shorttimeLog.data?.days?.length || 0} occurrences)`}
                subtitle={`Total Short-Time: ${shorttimeLog.data?.totalShortTimeHours || 0} hrs • Total Deduction: ₹${shorttimeLog.data?.totalShortTimeDeduction || 0}`}
                flush
              >
                {(!shorttimeLog.data?.days || shorttimeLog.data.days.length === 0) ? (
                  <div style={{ padding: 16, color: '#166534', fontWeight: 600 }}>
                    ✅ Excellent! No early exits or short-time recorded for this month.
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>IN Time</th>
                        <th>OUT Time</th>
                        <th style={{ textAlign: 'center' }}>Early Exit Hours</th>
                        <th style={{ textAlign: 'right' }}>Hourly Rate (₹)</th>
                        <th style={{ textAlign: 'right', color: '#DC2626' }}>Deduction (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shorttimeLog.data.days.map((st) => (
                        <tr key={st.date}>
                          <td>{isoToDisplay(st.date)}</td>
                          <td className="mono">{st.inTime || '—'}</td>
                          <td className="mono">{st.outTime || '—'}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: '#DC2626' }}>
                            {st.shortTimeHours} hrs
                          </td>
                          <td style={{ textAlign: 'right' }}>₹{st.hourlyRate}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#DC2626' }}>
                            −₹{st.deductionAmount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            </>
          ) : (
            <EmptyState icon="🧮" title="No Salary Preview" text="Could not generate salary preview." />
          )}
        </div>
      )}

      {/* Salary History Tab */}
      {tab === 'history' && (
        <Card
          title="Salary Structure & Revision History"
          subtitle="Append-only log of wage revisions. Historical payroll months always use their respective rate."
          actions={
            canManageSalary && (
              <Button size="sm" variant="primary" onClick={() => setRateModalOpen(true)} icon="📈">
                Update Base Rate
              </Button>
            )
          }
          flush
        >
          {salaryHistory.loading && !salaryHistory.data ? (
            <Loading text="Loading history..." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Effective Date</th>
                    <th style={{ textAlign: 'right' }}>Previous Rate (₹)</th>
                    <th style={{ textAlign: 'right' }}>New Rate (₹)</th>
                    <th>Reason for Revision</th>
                    <th>Changed By</th>
                    <th>Recorded At</th>
                  </tr>
                </thead>
                <tbody>
                  {(!salaryHistory.data?.salaryHistory || salaryHistory.data.salaryHistory.length === 0) ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24 }} className="text-muted">
                        No previous salary revisions recorded. Current rate: ₹{e.salaryConfig?.baseRate || 0}
                      </td>
                    </tr>
                  ) : (
                    salaryHistory.data.salaryHistory.map((h, i) => (
                      <tr key={h._id || i}>
                        <td style={{ fontWeight: 600 }}>{new Date(h.effectiveFrom).toLocaleDateString('en-IN')}</td>
                        <td style={{ textAlign: 'right' }}>₹{h.previousRate?.toLocaleString('en-IN')}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                          ₹{h.newRate?.toLocaleString('en-IN')}
                        </td>
                        <td>{h.reason || 'Annual increment / adjustment'}</td>
                        <td>{h.changedBy?.name || h.changedBy?.username || 'Admin'}</td>
                        <td className="text-small text-muted">{new Date(h.changedAt).toLocaleString('en-IN')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Advances Tab */}
      {tab === 'advances' && (
        <Card title={`Salary Advances for ${e.name}`} flush>
          {empAdvances.loading && !empAdvances.data ? (
            <Loading text="Loading advances..." />
          ) : (!empAdvances.data?.advances || empAdvances.data.advances.length === 0) ? (
            <EmptyState icon="💵" title="No Advances Issued" text="This employee has not taken any salary advances." />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Issued Date</th>
                  <th>Purpose</th>
                  <th style={{ textAlign: 'right' }}>Total (₹)</th>
                  <th style={{ textAlign: 'right' }}>Monthly EMI (₹)</th>
                  <th style={{ textAlign: 'right' }}>Remaining (₹)</th>
                  <th style={{ textAlign: 'center' }}>Repaid %</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {empAdvances.data.advances.map((adv) => {
                  const percent = Math.min(100, Math.round(((adv.totalAmount - adv.remainingBalance) / adv.totalAmount) * 100));
                  return (
                    <tr key={adv._id}>
                      <td>{new Date(adv.issuedDate).toLocaleDateString('en-IN')}</td>
                      <td>{adv.purpose || 'Personal'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{adv.totalAmount?.toLocaleString('en-IN')}</td>
                      <td style={{ textAlign: 'right' }}>₹{adv.installmentAmount?.toLocaleString('en-IN')} /mo</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: adv.remainingBalance > 0 ? '#DC2626' : '#166534' }}>
                        ₹{adv.remainingBalance?.toLocaleString('en-IN')}
                      </td>
                      <td style={{ textAlign: 'center', width: 100 }}>
                        <div style={{ width: '100%', background: '#E2E8F0', height: 6, borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${percent}%`, background: percent === 100 ? '#166534' : '#E28431', height: '100%' }} />
                        </div>
                        <span style={{ fontSize: 10 }}>{percent}%</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Badge tone={adv.status === 'Active' ? 'green' : adv.status === 'Completed' ? 'blue' : 'slate'} dot>
                          {adv.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Details Tab */}
      {tab === 'details' && (
        <Card title="Employee details" flush>
          <div className="section-pad">
            <KeyValue
              items={[
                { key: 'Employee ID', value: <span className="mono">{e.employeeId}</span> },
                { key: 'Full name', value: e.name },
                { key: 'Designation', value: e.designation || '—' },
                { key: 'Department', value: e.department?.name },
                { key: 'Team', value: e.team?.name || 'No team' },
                { key: 'Employee type', value: e.employeeType },
                { key: 'Default shift', value: e.shiftCategory },
                { key: 'Joining date', value: isoToDisplay(e.joiningDate) },
                { key: 'Salary type', value: e.salaryConfig?.salaryType || 'Monthly' },
                { key: 'Base rate', value: canViewSalary ? `₹${e.salaryConfig?.baseRate || 0}` : '₹ —' },
                { key: 'OT multiplier', value: e.salaryConfig?.otMultiplier || '1x' },
                { key: 'Payment mode', value: e.salaryConfig?.paymentMode || 'Cash' },
                { key: 'Mobile number', value: e.mobileNo ? <span className="mono">{e.mobileNo}</span> : '—' },
                { key: 'Email address', value: e.email || '—' },
                { key: 'Address', value: e.address || '—' },
              ]}
            />
          </div>
        </Card>
      )}

      {/* Day detail modal */}
      <Modal
        open={Boolean(dayDetail)}
        onClose={() => setDayDetail(null)}
        title={dayDetail ? `Attendance on ${isoToDisplay(dayDetail.date)}` : ''}
        subtitle={dayDetail?.status}
      >
        {dayDetail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <KeyValue
              items={[
                { key: 'Working Status', value: <StatusBadge status={dayDetail.workingStatus} /> },
                { key: 'IN Time', value: dayDetail.entry?.inTime || '—' },
                { key: 'OUT Time', value: dayDetail.entry?.outTime || '—' },
                { key: 'Total Hours', value: hoursDisplay(dayDetail.entry?.totalHours) },
                { key: 'Overtime', value: hoursDisplay(dayDetail.entry?.overtime) },
                { key: 'Short Time', value: hoursDisplay(dayDetail.entry?.shortTime) },
                { key: 'Work Done', value: dayDetail.entry?.workDescription || '—' },
              ]}
            />

            {dayDetail.financialEvents?.length > 0 && (
              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700 }}>Financial Events on this Date</h4>
                {dayDetail.financialEvents.map((fe, i) => (
                  <div key={i} style={{ padding: '6px 10px', background: 'var(--slate-050)', borderRadius: 6, margin: '4px 0', fontSize: 12 }}>
                    📌 {fe.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Update Rate Modal */}
      <Modal
        open={rateModalOpen}
        onClose={() => setRateModalOpen(false)}
        title="Update Salary Base Rate"
        subtitle={`Revise compensation for ${e.name}. Previous rate: ₹${e.salaryConfig?.baseRate || 0}`}
      >
        <form onSubmit={handleUpdateSalary} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="New Base Rate (₹)" required>
            <Input
              type="number"
              min="0"
              placeholder="e.g. 20000"
              value={newRateForm.newBaseRate}
              onChange={(ev) => setNewRateForm({ ...newRateForm, newBaseRate: ev.target.value })}
              required
            />
          </Field>

          <Field label="Effective From Date" required>
            <Input
              type="date"
              value={newRateForm.effectiveFrom}
              onChange={(ev) => setNewRateForm({ ...newRateForm, effectiveFrom: ev.target.value })}
              required
            />
          </Field>

          <Field label="Reason / Remarks" required>
            <Input
              placeholder="e.g. Annual Appraisal, Promotion, Wage adjustment"
              value={newRateForm.reason}
              onChange={(ev) => setNewRateForm({ ...newRateForm, reason: ev.target.value })}
              required
            />
          </Field>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <Button type="button" variant="default" onClick={() => setRateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingRate}>
              Confirm Revision
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
