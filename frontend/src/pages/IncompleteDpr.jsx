import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import {
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
} from '../components/ui';
import { hoursDisplay, isoToLongDisplay, todayIso } from '../utils/format';

/** Factory-wide oversight of every incomplete DPR entry, across all operators. */
export default function IncompleteDpr() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [date, setDate] = useState(todayIso());
  const [department, setDepartment] = useState('');

  const incomplete = useApi(
    () => endpoints.dpr.incomplete({ date, department: department || undefined }),
    [date, department]
  );
  const departments = useApi(() => endpoints.masters.departments(), []);

  const items = incomplete.data?.items || [];

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Incomplete DPR</h1>
          <div className="page-head__subtitle">
            {isoToLongDisplay(date)} · every operator’s entries with information still pending
          </div>
        </div>
        <div className="page-head__actions">
          <Button onClick={incomplete.reload} icon="↻">
            Refresh
          </Button>
        </div>
      </div>

      <div className="filters">
        <Field label="Date">
          <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
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
        <div className="filters__spacer" />
        <Badge tone={items.length ? 'amber' : 'green'}>
          {items.length} incomplete {items.length === 1 ? 'entry' : 'entries'}
        </Badge>
      </div>

      <Card flush>
        {incomplete.loading && !incomplete.data ? (
          <Loading />
        ) : incomplete.error ? (
          <ErrorState error={incomplete.error} onRetry={incomplete.reload} />
        ) : items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Shift</th>
                  <th>IN</th>
                  <th>OUT</th>
                  <th className="table__num">Hours</th>
                  <th>Field status</th>
                  <th>Still needed</th>
                  <th>Recorded by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="emp-cell">
                        <Avatar name={item.employeeName} />
                        <div>
                          <div className="emp-cell__name">{item.employeeName}</div>
                          <div className="emp-cell__meta">{item.employeeId}</div>
                        </div>
                      </div>
                    </td>
                    <td>{item.workingDepartment}</td>
                    <td>{item.shiftName || <span className="table__muted">—</span>}</td>
                    <td className="mono">{item.inTime || '—'}</td>
                    <td className="mono">{item.outTime || <span className="table__muted">pending</span>}</td>
                    <td className="table__num">{hoursDisplay(item.totalHours)}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <LockPill locked={item.locks?.inTime} pending={!item.inTime} label="IN" />
                        <LockPill locked={item.locks?.outTime} pending={!item.outTime} label="OUT" />
                        {item.requiresWorkQty ? (
                          <LockPill locked={item.locks?.workQty} pending={!item.workDescription} label="Work" />
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <Badge tone="amber">{item.missingLabel}</Badge>
                    </td>
                    <td className="text-small text-muted">{item.enteredByName}</td>
                    <td>
                      {can('canEnterDpr') ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => navigate(`/dpr/entry?date=${date}&employee=${item.employee}`)}
                        >
                          Complete
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="✅"
            title="Everything is complete"
            text="No DPR entry on this date is waiting for information."
          />
        )}
      </Card>
    </>
  );
}
