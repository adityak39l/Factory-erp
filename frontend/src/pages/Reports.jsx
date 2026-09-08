import { useState } from 'react';
import { endpoints, downloadFile } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Select,
  Stat,
  StatusBadge,
  Tabs,
} from '../components/ui';
import { hoursDisplay, isoToDisplay, monthRangeIso, numberDisplay } from '../utils/format';

const TABS = [
  { key: 'dpr', label: 'DPR register' },
  { key: 'attendance', label: 'Attendance summary' },
  { key: 'production', label: 'Production / quantity' },
];

export default function Reports() {
  const toast = useToast();
  const now = new Date();
  const defaults = monthRangeIso(now.getFullYear(), now.getMonth() + 1);

  const [tab, setTab] = useState('dpr');
  const [filters, setFilters] = useState({
    from: defaults.from,
    to: new Date().toISOString().slice(0, 10),
    department: '',
    team: '',
    employee: '',
    employeeType: '',
    shift: '',
    status: '',
    includeInactive: 'false',
    groupBy: 'department',
  });
  const [exporting, setExporting] = useState('');

  const departments = useApi(() => endpoints.masters.departments(), []);
  const employees = useApi(() => endpoints.employees.list({ status: 'All', limit: 200 }), []);

  const params = {
    from: filters.from,
    to: filters.to,
    department: filters.department || undefined,
    team: filters.team || undefined,
    employee: filters.employee || undefined,
    employeeType: filters.employeeType || undefined,
    shift: filters.shift || undefined,
    status: filters.status || undefined,
  };

  const report = useApi(() => {
    if (tab === 'attendance') {
      return endpoints.reports.attendance({ ...params, includeInactive: filters.includeInactive });
    }
    if (tab === 'production') return endpoints.reports.production({ ...params, groupBy: filters.groupBy });
    return endpoints.reports.dpr(params);
  }, [tab, JSON.stringify(params), filters.includeInactive, filters.groupBy]);

  const exportAs = async (format) => {
    setExporting(format);
    try {
      const name = await downloadFile(
        '/reports/export',
        { ...params, type: tab === 'attendance' ? 'attendance' : 'dpr', format },
        `report.${format === 'excel' ? 'xlsx' : format}`
      );
      toast.success('Export ready', name);
    } catch (err) {
      toast.apiError(err, 'Export failed');
    } finally {
      setExporting('');
    }
  };

  const teams =
    (departments.data?.departments || []).find((d) => d._id === filters.department)?.teams || [];

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Reports &amp; Export</h1>
          <div className="page-head__subtitle">
            Any period, any department, any employee — exportable to Excel, PDF or CSV
          </div>
        </div>
        <div className="page-head__actions">
          <Button onClick={() => exportAs('excel')} loading={exporting === 'excel'} icon="📊" disabled={tab === 'production'}>
            Excel
          </Button>
          <Button onClick={() => exportAs('csv')} loading={exporting === 'csv'} icon="📄" disabled={tab === 'production'}>
            CSV
          </Button>
          <Button onClick={() => exportAs('pdf')} loading={exporting === 'pdf'} icon="🖨️" disabled={tab === 'production'}>
            PDF
          </Button>
        </div>
      </div>

      <div className="filters">
        <Field label="From">
          <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </Field>
        <Field label="To">
          <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </Field>
        <Field label="Department">
          <Select
            value={filters.department}
            onChange={(e) => setFilters({ ...filters, department: e.target.value, team: '' })}
          >
            <option value="">All</option>
            {(departments.data?.departments || []).map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        {teams.length ? (
          <Field label="Team">
            <Select value={filters.team} onChange={(e) => setFilters({ ...filters, team: e.target.value })}>
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Employee">
          <Select value={filters.employee} onChange={(e) => setFilters({ ...filters, employee: e.target.value })}>
            <option value="">All employees</option>
            {(employees.data?.employees || []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.employeeId})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select
            value={filters.employeeType}
            onChange={(e) => setFilters({ ...filters, employeeType: e.target.value })}
          >
            <option value="">All</option>
            <option value="Permanent">Permanent</option>
            <option value="Contract">Contract</option>
          </Select>
        </Field>
        <Field label="Shift">
          <Select value={filters.shift} onChange={(e) => setFilters({ ...filters, shift: e.target.value })}>
            <option value="">All</option>
            <option value="Day">Day</option>
            <option value="Night">Night</option>
          </Select>
        </Field>
        {tab === 'dpr' ? (
          <Field label="Entry status">
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All</option>
              <option value="Completed">Completed</option>
              <option value="Open">Incomplete</option>
            </Select>
          </Field>
        ) : null}
        {tab === 'attendance' ? (
          <Field label="Include inactive">
            <Select
              value={filters.includeInactive}
              onChange={(e) => setFilters({ ...filters, includeInactive: e.target.value })}
            >
              <option value="false">Active only</option>
              <option value="true">Include employees who left</option>
            </Select>
          </Field>
        ) : null}
        {tab === 'production' ? (
          <Field label="Group by">
            <Select value={filters.groupBy} onChange={(e) => setFilters({ ...filters, groupBy: e.target.value })}>
              <option value="department">Department</option>
              <option value="employee">Employee</option>
            </Select>
          </Field>
        ) : null}
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {report.loading && !report.data ? (
        <Loading text="Building the report…" />
      ) : report.error ? (
        <ErrorState error={report.error} onRetry={report.reload} />
      ) : (
        <>
          <div className="grid grid--stats mb-2">
            {tab === 'dpr' ? (
              <>
                <Stat label="DPR entries" value={report.data.totals.entries} icon="📋" tone="navy" />
                <Stat label="Total hours" value={hoursDisplay(report.data.totals.totalHours)} icon="⏱️" tone="blue" />
                <Stat label="Overtime" value={hoursDisplay(report.data.totals.overtime)} icon="⚡" tone="orange" />
                <Stat label="Short time" value={hoursDisplay(report.data.totals.shortTime)} icon="⏬" tone="amber" />
                <Stat label="Quantity" value={numberDisplay(report.data.totals.quantity)} icon="📦" tone="violet" />
              </>
            ) : tab === 'attendance' ? (
              <>
                <Stat label="Employees" value={report.data.totals.employees} icon="👷" tone="navy" />
                <Stat label="Present days" value={report.data.totals.presentDays} icon="✅" tone="green" />
                <Stat label="Absent days" value={report.data.totals.absentDays} icon="🔴" tone="red" />
                <Stat label="Total hours" value={hoursDisplay(report.data.totals.totalHours)} icon="⏱️" tone="blue" />
                <Stat label="Overtime" value={hoursDisplay(report.data.totals.totalOvertime)} icon="⚡" tone="orange" />
              </>
            ) : (
              <>
                <Stat label="Total quantity" value={numberDisplay(report.data.totals.quantity)} icon="📦" tone="violet" />
                <Stat label="Entries counted" value={report.data.totals.entries} icon="📋" tone="navy" />
              </>
            )}
          </div>

          <Card
            title={TABS.find((t) => t.key === tab)?.label}
            subtitle={`${isoToDisplay(report.data.period.from)} to ${isoToDisplay(report.data.period.to)}`}
            flush
          >
            {!report.data.rows?.length ? (
              <EmptyState icon="📭" title="No data for these filters" text="Try widening the date range." />
            ) : tab === 'dpr' ? (
              <div className="table-wrap" style={{ maxHeight: 620, overflowY: 'auto' }}>
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>ID</th>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Shift</th>
                      <th>IN</th>
                      <th>OUT</th>
                      <th className="table__num">Hours</th>
                      <th className="table__num">OT</th>
                      <th className="table__num">Short</th>
                      <th>Work done</th>
                      <th className="table__num">Qty</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.rows.map((r, i) => (
                      <tr key={`${r.employeeId}-${r.date}-${i}`}>
                        <td>{isoToDisplay(r.date)}</td>
                        <td className="mono">{r.employeeId}</td>
                        <td className="table__strong">{r.employeeName}</td>
                        <td>
                          {r.department}
                          {r.isCrossAssigned ? <Badge tone="orange">Helper</Badge> : null}
                        </td>
                        <td>{r.shift}</td>
                        <td className="mono">{r.inTime}</td>
                        <td className="mono">{r.outTime}</td>
                        <td className="table__num">{hoursDisplay(r.totalHours)}</td>
                        <td className="table__num">
                          {r.overtime === null ? <span className="table__muted">N/A</span> : hoursDisplay(r.overtime)}
                        </td>
                        <td className="table__num">
                          {r.shortTime === null ? <span className="table__muted">N/A</span> : hoursDisplay(r.shortTime)}
                        </td>
                        <td>{r.workDescription || <span className="table__muted">—</span>}</td>
                        <td className="table__num">{r.qty ?? '—'}</td>
                        <td>
                          <StatusBadge status={r.status} withIcon={false} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : tab === 'attendance' ? (
              <div className="table-wrap" style={{ maxHeight: 620, overflowY: 'auto' }}>
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Type</th>
                      <th className="table__num">Present</th>
                      <th className="table__num">Absent</th>
                      <th className="table__num">Attendance</th>
                      <th className="table__num">Day shift</th>
                      <th className="table__num">Night shift</th>
                      <th className="table__num">Hours</th>
                      <th className="table__num">OT</th>
                      <th className="table__num">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.rows.map((r) => (
                      <tr key={r.employeeId}>
                        <td className="mono">{r.employeeId}</td>
                        <td className="table__strong">
                          {r.employeeName}
                          {r.status === 'Inactive' ? <Badge tone="slate">Left</Badge> : null}
                        </td>
                        <td>{r.department}</td>
                        <td>
                          <Badge tone={r.employeeType === 'Contract' ? 'violet' : 'navy'}>{r.employeeType}</Badge>
                        </td>
                        <td className="table__num">{r.presentDays}</td>
                        <td className="table__num">{r.absentDays}</td>
                        <td className="table__num">
                          <Badge tone={r.attendancePercentage >= 85 ? 'green' : r.attendancePercentage >= 60 ? 'amber' : 'red'}>
                            {r.attendancePercentage}%
                          </Badge>
                        </td>
                        <td className="table__num">{r.dayShiftDays} d</td>
                        <td className="table__num">{r.nightShiftDays} d</td>
                        <td className="table__num">{hoursDisplay(r.totalHours)}</td>
                        <td className="table__num">
                          {r.totalOvertime === null ? (
                            <span className="table__muted">N/A</span>
                          ) : (
                            hoursDisplay(r.totalOvertime)
                          )}
                        </td>
                        <td className="table__num">{numberDisplay(r.totalQty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{filters.groupBy === 'employee' ? 'Employee' : 'Department'}</th>
                      <th className="table__num">Quantity</th>
                      <th className="table__num">Entries</th>
                      <th className="table__num">Hours</th>
                      <th>Recent work</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.rows.map((r) => (
                      <tr key={r.label}>
                        <td className="table__strong">
                          {r.label}
                          {r.employeeId ? <div className="emp-cell__meta mono">{r.employeeId}</div> : null}
                        </td>
                        <td className="table__num table__strong">{numberDisplay(r.quantity)}</td>
                        <td className="table__num">{r.entries}</td>
                        <td className="table__num">{hoursDisplay(r.hours)}</td>
                        <td className="text-small text-muted">
                          {r.items.slice(0, 3).map((i) => `${i.description} (${i.qty ?? '—'})`).join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
