import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Loading,
  LockPill,
  Select,
  StatusBadge,
} from '../components/ui';
import { hoursDisplay, isoToLongDisplay, todayIso } from '../utils/format';

const STATUS_FILTERS = ['All', 'Working', 'Completed', 'Incomplete', 'Absent'];

const CHIP_COLORS = {
  present: 'var(--green-500)',
  absent: 'var(--red-500)',
  working: 'var(--blue-500)',
  incomplete: 'var(--amber-500)',
  completed: 'var(--violet-500)',
};

/**
 * The central operational screen — one place to see who is present, whose DPR is
 * complete, whose OUT time is pending and who is absent, for any date.
 */
export default function DprControlCenter() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();

  const [date, setDate] = useState(params.get('date') || todayIso());
  const [status, setStatus] = useState('All');
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');

  const control = useApi(
    () => endpoints.dpr.controlCenter({ date, department: department || undefined }),
    [date, department]
  );
  const departments = useApi(() => endpoints.masters.departments(), []);

  const rows = useMemo(() => {
    let list = control.data?.rows || [];
    if (status !== 'All') list = list.filter((r) => r.status === status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.employee.name.toLowerCase().includes(q) ||
          r.employee.employeeId.includes(q) ||
          (r.employee.designation || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [control.data, status, search]);

  const summary = control.data?.summary || {};

  const changeDate = (value) => {
    setDate(value);
    setParams(value === todayIso() ? {} : { date: value });
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>DPR Control Center</h1>
          <div className="page-head__subtitle">{isoToLongDisplay(date)}</div>
        </div>
        <div className="page-head__actions">
          <Button onClick={control.reload} icon="↻">
            Refresh
          </Button>
          {can('canEnterDpr') ? (
            <>
              <Button onClick={() => navigate(`/dpr/bulk?date=${date}`)} icon="⚡">
                Bulk entry
              </Button>
              <Button variant="primary" onClick={() => navigate(`/dpr/entry?date=${date}`)} icon="📝">
                New DPR entry
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {summary.isHoliday ? (
        <div className="mb-2">
          <Alert tone="info" title={`Holiday — ${summary.holidayLabel}`}>
            DPR entry is blocked on this date and no absence is recorded.
          </Alert>
        </div>
      ) : null}

      <div className="summary-strip">
        <div className="summary-chip">
          <span className="summary-chip__dot" style={{ background: CHIP_COLORS.present }} />
          Present <span className="summary-chip__value">{summary.present ?? 0}</span>
        </div>
        <div className="summary-chip">
          <span className="summary-chip__dot" style={{ background: CHIP_COLORS.absent }} />
          Absent <span className="summary-chip__value">{summary.absent ?? 0}</span>
        </div>
        <div className="summary-chip">
          <span className="summary-chip__dot" style={{ background: CHIP_COLORS.working }} />
          Working <span className="summary-chip__value">{summary.working ?? 0}</span>
        </div>
        <div className="summary-chip">
          <span className="summary-chip__dot" style={{ background: CHIP_COLORS.incomplete }} />
          Incomplete <span className="summary-chip__value">{summary.incomplete ?? 0}</span>
        </div>
        <div className="summary-chip">
          <span className="summary-chip__dot" style={{ background: CHIP_COLORS.completed }} />
          Completed <span className="summary-chip__value">{summary.completed ?? 0}</span>
        </div>
        <div className="summary-chip">
          Total workforce <span className="summary-chip__value">{summary.totalEmployees ?? 0}</span>
        </div>
      </div>

      <div className="filters">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Department">
          <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {(departments.data?.departments || []).map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Search" style={{ flex: 1, minWidth: 190 }}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, employee ID or designation"
          />
        </Field>
      </div>

      <Card flush>
        {control.loading && !control.data ? (
          <Loading text="Loading the day’s DPR…" />
        ) : control.error ? (
          <ErrorState error={control.error} onRetry={control.reload} />
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Type / Shift</th>
                  <th>IN</th>
                  <th>OUT</th>
                  <th className="table__num">Hours</th>
                  <th className="table__num">OT</th>
                  <th className="table__num">Short</th>
                  <th>Work done</th>
                  <th className="table__num">Qty</th>
                  <th>Field status</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ employee, entry, status: rowStatus }) => (
                  <tr key={employee.id}>
                    <td>
                      <div className="emp-cell">
                        <Avatar name={employee.name} />
                        <div>
                          <div className="emp-cell__name">{employee.name}</div>
                          <div className="emp-cell__meta">
                            {employee.employeeId}
                            {employee.designation ? ` · ${employee.designation}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {entry?.workingDepartment || employee.department?.name || '—'}
                      {entry?.isCrossAssigned ? (
                        <>
                          {' '}
                          <Badge tone="orange">Helper</Badge>
                        </>
                      ) : null}
                      {employee.team?.name ? (
                        <div className="text-small text-muted">{employee.team.name}</div>
                      ) : null}
                    </td>
                    <td>
                      <Badge tone={employee.employeeType === 'Contract' ? 'violet' : 'navy'}>
                        {employee.employeeType}
                      </Badge>
                      <div className="text-small text-muted">
                        {employee.employeeType === 'Contract'
                          ? 'No fixed shift'
                          : entry?.shiftName || employee.shiftCategory}
                      </div>
                    </td>
                    <td className="mono">{entry?.inTime || <span className="table__muted">—</span>}</td>
                    <td className="mono">{entry?.outTime || <span className="table__muted">—</span>}</td>
                    <td className="table__num table__strong">{hoursDisplay(entry?.totalHours)}</td>
                    <td className="table__num">
                      {employee.employeeType === 'Contract' ? (
                        <span className="table__muted" title="Not applicable to contract workers">
                          N/A
                        </span>
                      ) : (
                        hoursDisplay(entry?.overtime)
                      )}
                    </td>
                    <td className="table__num">
                      {employee.employeeType === 'Contract' ? (
                        <span className="table__muted">N/A</span>
                      ) : (
                        hoursDisplay(entry?.shortTime)
                      )}
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      {entry?.workDescription ? (
                        <span title={entry.workDescription}>{entry.workDescription}</span>
                      ) : employee.requiresWorkQty ? (
                        <span className="table__muted">—</span>
                      ) : (
                        <span className="table__muted" title="Not expected for this role">
                          Not applicable
                        </span>
                      )}
                    </td>
                    <td className="table__num">
                      {entry?.qty !== null && entry?.qty !== undefined ? `${entry.qty} ${entry.qtyUnit || ''}` : '—'}
                    </td>
                    <td>
                      {entry ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <LockPill locked={entry.locks?.inTime} pending={!entry.inTime} label="IN" />
                          <LockPill locked={entry.locks?.outTime} pending={!entry.outTime} label="OUT" />
                          {employee.requiresWorkQty ? (
                            <LockPill
                              locked={entry.locks?.workQty}
                              pending={!entry.workDescription}
                              label="Work"
                            />
                          ) : null}
                        </div>
                      ) : (
                        <span className="table__muted">No entry</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={rowStatus} />
                    </td>
                    <td>
                      {can('canEnterDpr') && !summary.isHoliday ? (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/dpr/entry?date=${date}&employee=${employee.id}`)}
                        >
                          {entry ? 'Open' : 'Record'}
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => navigate(`/employees/${employee.id}`)}>
                          Profile
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="🔍"
            title="No employees match these filters"
            text="Try clearing the search box or choosing a different status."
          />
        )}
      </Card>

      <div className="legend mt-2">
        <div className="legend__item">🔒 Saved &amp; locked</div>
        <div className="legend__item">⏳ Still pending</div>
        <div className="legend__item">🟢 Working</div>
        <div className="legend__item">✅ Completed</div>
        <div className="legend__item">🟡 Incomplete</div>
        <div className="legend__item">🔴 Absent</div>
      </div>
    </>
  );
}
