import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Stat,
} from '../components/ui';
import { isoToLongDisplay, todayIso } from '../utils/format';

/**
 * The operator's own "DPR Missing Information" list.
 *
 * Informational only — no popups, no alerts, no badges shouting at anyone. It lists
 * only entries THIS operator recorded, and only genuine gaps:
 *   • employees with no IN time are Absent, so they never appear here
 *   • work details are never expected from support roles (guard, cook, sweeper)
 *   • a missing OUT time only appears once the expected shift end has passed
 */
export default function MyWorkspace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [date, setDate] = useState(todayIso());

  const workspace = useApi(() => endpoints.dpr.myWorkspace({ date }), [date]);

  const items = workspace.data?.items || [];

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>My Workspace</h1>
          <div className="page-head__subtitle">
            {isoToLongDisplay(date)} · entries you recorded
          </div>
        </div>
        <div className="page-head__actions">
          <Field style={{ marginBottom: 0 }}>
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button onClick={workspace.reload} icon="↻">
            Refresh
          </Button>
          <Button variant="primary" onClick={() => navigate(`/dpr/entry?date=${date}`)} icon="📝">
            New entry
          </Button>
        </div>
      </div>

      <div className="grid grid--stats mb-3">
        <Stat
          label="Entries you handled"
          value={workspace.data?.handledToday ?? 0}
          hint="Recorded under your login on this date"
          icon="🗂️"
          tone="navy"
        />
        <Stat
          label="Completed"
          value={workspace.data?.completedToday ?? 0}
          hint="Nothing further needed"
          icon="✅"
          tone="green"
        />
        <Stat
          label="Need completion"
          value={workspace.data?.count ?? 0}
          hint="Information still to be filled"
          icon="📋"
          tone="amber"
        />
      </div>

      <Card
        title={`DPR Missing Information${items.length ? ` — ${items.length} employee${items.length === 1 ? '' : 's'}` : ''}`}
        subtitle="Only your own entries, and only fields that are genuinely due"
        flush
      >
        {workspace.loading && !workspace.data ? (
          <Loading />
        ) : workspace.error ? (
          <ErrorState error={workspace.error} onRetry={workspace.reload} />
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
                  <th>Still needed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.entryId}>
                    <td>
                      <div className="emp-cell">
                        <Avatar name={item.employeeName} />
                        <div>
                          <div className="emp-cell__name">{item.employeeName}</div>
                          <div className="emp-cell__meta">{item.employeeId}</div>
                        </div>
                      </div>
                    </td>
                    <td>{item.department}</td>
                    <td>{item.shiftName || <span className="table__muted">—</span>}</td>
                    <td className="mono">{item.inTime || '—'}</td>
                    <td className="mono">{item.outTime || <span className="table__muted">pending</span>}</td>
                    <td>
                      <Badge tone="amber">{item.missingLabel}</Badge>
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => navigate(`/dpr/entry?date=${date}&employee=${item.employee}`)}
                      >
                        Complete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="👍"
            title="Nothing pending"
            text={
              workspace.data?.handledToday
                ? 'Every entry you recorded on this date is complete.'
                : 'You have not recorded any DPR entries for this date yet.'
            }
          />
        )}
      </Card>

      <div className="mt-2">
        <Alert tone="neutral" title="How this list is built">
          Employees with no IN time at all are treated as <strong>Absent</strong> and never appear
          here. Work details are not expected from support roles such as guards and kitchen staff. A
          missing OUT time only appears once the shift should have ended — before that, the person is
          simply still working. Signed in as {user?.name}.
        </Alert>
      </div>
    </>
  );
}
