import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
} from '../components/ui';
import { hoursDisplay, isoToLongDisplay, numberDisplay, todayIso } from '../utils/format';

/** One card per department for a chosen date — the shop-floor view of the day. */
export default function DepartmentOverview() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());

  const breakdown = useApi(() => endpoints.dashboard.departments({ date }), [date]);
  const departments = breakdown.data?.departments || [];
  const active = departments.filter((d) => d.headcount > 0 || d.present > 0);

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Department View</h1>
          <div className="page-head__subtitle">{isoToLongDisplay(date)}</div>
        </div>
        <div className="page-head__actions">
          <Field style={{ marginBottom: 0 }}>
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button onClick={breakdown.reload} icon="↻">
            Refresh
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <Alert tone="neutral" title="Helper cross-assignment">
          A helper covering another department for the day is counted in the department they actually
          worked in, not their home department.
        </Alert>
      </div>

      {breakdown.loading && !breakdown.data ? (
        <Loading />
      ) : breakdown.error ? (
        <ErrorState error={breakdown.error} onRetry={breakdown.reload} />
      ) : active.length ? (
        <div className="grid grid--3">
          {active.map((d) => (
            <Card
              key={d.id}
              title={d.name}
              subtitle={`${d.headcount} employee${d.headcount === 1 ? '' : 's'} on strength`}
              actions={
                <Button size="sm" onClick={() => navigate(`/dpr/control-center?date=${date}`)}>
                  Open DPR
                </Button>
              }
            >
              <div className="flex-gap mb-2">
                {d.isHelperPool ? <Badge tone="orange">Helper pool</Badge> : null}
                {d.hasTeams ? <Badge tone="blue">Teams</Badge> : null}
                <Badge tone={d.attendancePercentage >= 80 ? 'green' : d.attendancePercentage >= 50 ? 'amber' : 'red'}>
                  {d.attendancePercentage}% attendance
                </Badge>
              </div>

              <div className="metric-row" style={{ padding: 12 }}>
                <div className="metric">
                  <div className="metric__label">Present</div>
                  <div className="metric__value" style={{ color: 'var(--green-600)' }}>
                    {d.present}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric__label">Absent</div>
                  <div className="metric__value" style={{ color: d.absent ? 'var(--red-600)' : undefined }}>
                    {d.absent}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric__label">Incomplete</div>
                  <div className="metric__value" style={{ color: d.incomplete ? 'var(--amber-600)' : undefined }}>
                    {d.incomplete}
                  </div>
                </div>
              </div>

              <div className="metric-row mt-2" style={{ padding: 12, background: 'var(--surface-muted)' }}>
                <div className="metric">
                  <div className="metric__label">Hours</div>
                  <div className="metric__value" style={{ fontSize: 16 }}>
                    {hoursDisplay(d.totalHours)}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric__label">Overtime</div>
                  <div className="metric__value" style={{ fontSize: 16 }}>
                    {hoursDisplay(d.overtime)}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric__label">Quantity</div>
                  <div className="metric__value" style={{ fontSize: 16 }}>
                    {numberDisplay(d.qty)}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon="🏭" title="No department activity" text="No employees or DPR entries for this date." />
        </Card>
      )}
    </>
  );
}
