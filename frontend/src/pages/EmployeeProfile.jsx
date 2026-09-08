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
  isoToLongDisplay,
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
  const { can } = useAuth();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState('calendar');
  const [dayDetail, setDayDetail] = useState(null);
  const [revealed, setRevealed] = useState(false);

  const employee = useApi(() => endpoints.employees.get(id), [id]);
  const attendance = useApi(() => endpoints.employees.attendance(id, { year, month }), [id, year, month]);

  if (employee.loading && !employee.data) return <Loading text="Loading employee…" />;
  if (employee.error) return <ErrorState error={employee.error} onRetry={employee.reload} />;

  const e = employee.data.employee;
  const summary = attendance.data?.summary || {};
  const days = attendance.data?.days || [];
  const isContract = e.employeeType === 'Contract';

  // Pad the calendar so the 1st lands on the correct weekday column.
  const firstWeekday = days.length ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay() : 0;

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

      {!isContract ? (
        <Card
          title="Shift split for this month"
          subtitle="How the same person's days divide between the two shifts"
          className="mb-3"
        >
          <div className="metric-row">
            <div className="metric">
              <div className="metric__label">Day shift days</div>
              <div className="metric__value">{summary.dayShiftDays ?? 0}</div>
            </div>
            <div className="metric">
              <div className="metric__label">Day shift hours</div>
              <div className="metric__value">{hoursDisplay(summary.dayShiftHours)}</div>
            </div>
            <div className="metric">
              <div className="metric__label">Night shift days</div>
              <div className="metric__value">{summary.nightShiftDays ?? 0}</div>
            </div>
            <div className="metric">
              <div className="metric__label">Night shift hours</div>
              <div className="metric__value">{hoursDisplay(summary.nightShiftHours)}</div>
            </div>
            <div className="metric">
              <div className="metric__label">Day shift OT</div>
              <div className="metric__value">{hoursDisplay(summary.dayShiftOvertime)}</div>
            </div>
            <div className="metric">
              <div className="metric__label">Night shift OT</div>
              <div className="metric__value">{hoursDisplay(summary.nightShiftOvertime)}</div>
            </div>
          </div>
        </Card>
      ) : null}

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
        <div className="legend">
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
            <span className="legend__swatch" style={{ background: 'var(--amber-100)', borderColor: '#fde68a' }} />{' '}
            Incomplete
          </span>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: 'calendar', label: 'Attendance calendar' },
          { key: 'register', label: 'DPR register' },
          { key: 'details', label: 'Employee details' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {attendance.loading && !attendance.data ? (
        <Loading />
      ) : tab === 'calendar' ? (
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
              return (
                <button
                  type="button"
                  key={day.date}
                  className={`calendar__day ${cls ? `calendar__day--${cls}` : ''}`}
                  onClick={() => setDayDetail(day)}
                >
                  <span className="calendar__num">{Number(day.date.slice(8))}</span>
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
      ) : tab === 'register' ? (
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
                        <td className="table__strong">{isoToDisplay(d.date)}</td>
                        <td>{d.entry.shiftName || <span className="table__muted">N/A</span>}</td>
                        <td className="mono">{d.entry.inTime || '—'}</td>
                        <td className="mono">{d.entry.outTime || '—'}</td>
                        <td className="table__num">{hoursDisplay(d.entry.totalHours)}</td>
                        <td className="table__num">
                          {isContract ? <span className="table__muted">N/A</span> : hoursDisplay(d.entry.overtime)}
                        </td>
                        <td className="table__num">
                          {isContract ? <span className="table__muted">N/A</span> : hoursDisplay(d.entry.shortTime)}
                        </td>
                        <td>{d.entry.workDescription || <span className="table__muted">—</span>}</td>
                        <td className="table__num">{d.entry.qty ?? '—'}</td>
                        <td>
                          {d.entry.workingDepartmentName}
                          {d.entry.isCrossAssigned ? <Badge tone="orange">Helper</Badge> : null}
                        </td>
                        <td>
                          <StatusBadge status={d.workingStatus} />
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="📋" title="No DPR entries this month" text="Pick another month to see history." />
          )}
        </Card>
      ) : (
        <div className="grid grid--2">
          <Card title="Personal details">
            <KeyValue
              items={[
                { key: 'Employee ID', value: <span className="mono">{e.employeeId}</span> },
                { key: 'Full name', value: e.name },
                { key: 'Father’s name', value: e.fathersName },
                { key: 'Mobile', value: e.mobileNo },
                { key: 'Email', value: e.email },
                { key: 'Address', value: e.address },
                { key: 'Joined on', value: isoToDisplay(e.joiningDate) },
              ]}
            />
          </Card>

          <Card title="Employment">
            <KeyValue
              items={[
                { key: 'Type', value: e.employeeType },
                {
                  key: 'Default shift',
                  value: isContract ? 'Not applicable (contract)' : e.shiftCategory,
                },
                { key: 'Department', value: e.department?.name },
                { key: 'Team', value: e.team?.name },
                {
                  key: 'Work output tracked',
                  value: e.requiresWorkQty ? 'Yes' : 'No (support role)',
                },
                {
                  key: 'Status',
                  value: (
                    <Badge tone={e.status === 'Active' ? 'green' : 'slate'} dot>
                      {e.status}
                    </Badge>
                  ),
                },
                { key: 'Inactive since', value: e.inactiveSince ? isoToDisplay(e.inactiveSince) : null },
              ]}
            />
          </Card>

          <Card
            title="Aadhar & bank details"
            subtitle={e.sensitive?.canView ? 'You have permission to view these' : 'Masked — permission required'}
            actions={
              e.sensitive?.canView ? (
                <Button size="sm" onClick={() => setRevealed((v) => !v)}>
                  {revealed ? 'Hide' : 'Reveal'}
                </Button>
              ) : null
            }
          >
            {!e.sensitive?.canView ? (
              <Alert tone="neutral">
                Only users granted “View Aadhar &amp; bank details” can see these values. They are
                encrypted in the database.
              </Alert>
            ) : null}
            <div className="mt-2">
              <KeyValue
                items={[
                  {
                    key: 'Aadhar number',
                    value: e.sensitive?.hasAadhar
                      ? revealed || !e.sensitive.canView
                        ? e.sensitive.aadharNo
                        : 'XXXX XXXX ' + String(e.sensitive.aadharNo).slice(-4)
                      : 'Not recorded',
                  },
                  { key: 'Bank name', value: e.sensitive?.bank?.bankName },
                  {
                    key: 'Account number',
                    value: e.sensitive?.bank?.hasAccount
                      ? revealed || !e.sensitive.canView
                        ? e.sensitive.bank.accountNo
                        : '••••••' + String(e.sensitive.bank.accountNo).slice(-4)
                      : 'Not recorded',
                  },
                  { key: 'IFSC', value: e.sensitive?.bank?.ifsc },
                ]}
              />
            </div>
          </Card>
        </div>
      )}

      <Modal
        open={!!dayDetail}
        onClose={() => setDayDetail(null)}
        title={dayDetail ? isoToLongDisplay(dayDetail.date) : ''}
        subtitle={e.name}
        footer={
          <>
            <Button onClick={() => setDayDetail(null)}>Close</Button>
            {can('canEnterDpr') && dayDetail?.status !== 'Holiday' ? (
              <Button
                variant="primary"
                onClick={() => navigate(`/dpr/entry?date=${dayDetail.date}&employee=${id}`)}
              >
                Open in DPR entry
              </Button>
            ) : null}
          </>
        }
      >
        {dayDetail ? (
          dayDetail.entry ? (
            <KeyValue
              items={[
                { key: 'Status', value: <StatusBadge status={dayDetail.workingStatus} /> },
                { key: 'Shift', value: dayDetail.entry.shiftName || 'Not applicable' },
                { key: 'IN time', value: dayDetail.entry.inTime },
                { key: 'OUT time', value: dayDetail.entry.outTime },
                { key: 'Total hours', value: hoursDisplay(dayDetail.entry.totalHours) },
                {
                  key: 'Overtime',
                  value: isContract ? 'Not applicable' : hoursDisplay(dayDetail.entry.overtime),
                },
                {
                  key: 'Short time',
                  value: isContract ? 'Not applicable' : hoursDisplay(dayDetail.entry.shortTime),
                },
                { key: 'Work done', value: dayDetail.entry.workDescription },
                {
                  key: 'Quantity',
                  value:
                    dayDetail.entry.qty !== null && dayDetail.entry.qty !== undefined
                      ? `${dayDetail.entry.qty} ${dayDetail.entry.qtyUnit || ''}`
                      : null,
                },
                { key: 'Worked in', value: dayDetail.entry.workingDepartmentName },
              ]}
            />
          ) : (
            <EmptyState
              icon={dayDetail.status === 'Holiday' ? '🔵' : dayDetail.status === 'Absent' ? '🔴' : '⚪'}
              title={dayDetail.status}
              text={
                dayDetail.status === 'Holiday'
                  ? dayDetail.holiday || 'Declared holiday — no DPR is recorded.'
                  : dayDetail.status === 'Absent'
                  ? 'No DPR entry was recorded, so this day counts as absent.'
                  : 'Nothing recorded for this date.'
              }
            />
          )
        ) : null}
      </Modal>
    </>
  );
}
