import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
import { hoursDisplay, isoToLongDisplay, todayIso } from '../utils/format';

const CHART_COLORS = { navy: '#05054A', orange: '#E28431', green: '#16a34a', red: '#ef4444' };

export default function Dashboard() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());

  const overview = useApi(() => endpoints.dashboard.overview({ date }), [date]);
  const departments = useApi(() => endpoints.dashboard.departments({ date }), [date]);
  const analytics = useApi(
    () =>
      endpoints.dashboard.analytics({
        year: Number(date.slice(0, 4)),
        month: Number(date.slice(5, 7)),
      }),
    [date],
    { immediate: can('canViewReports') }
  );

  if (overview.loading && !overview.data) return <Loading text="Loading today’s figures…" />;
  if (overview.error) return <ErrorState error={overview.error} onRetry={overview.reload} />;

  const stats = overview.data?.stats || {};
  const isHoliday = overview.data?.isHoliday;

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Good day, {user?.name}</h1>
          <div className="page-head__subtitle">{isoToLongDisplay(date)}</div>
        </div>
        <div className="page-head__actions">
          <Field style={{ marginBottom: 0 }}>
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button onClick={() => { overview.reload(); departments.reload(); }} icon="↻">
            Refresh
          </Button>
          <Button variant="primary" onClick={() => navigate('/dpr/control-center')} icon="🎛️">
            DPR Control Center
          </Button>
        </div>
      </div>

      {isHoliday ? (
        <div className="mb-2">
          <Alert tone="info" title={`Holiday — ${overview.data.holidayLabel}`}>
            DPR entry is blocked for this date and nobody is marked absent.
          </Alert>
        </div>
      ) : null}

      <div className="grid grid--stats mb-3">
        <Stat
          label="Active employees"
          value={stats.totalActiveEmployees ?? 0}
          hint={`${stats.permanentCount ?? 0} permanent · ${stats.contractCount ?? 0} contract`}
          icon="👷"
          tone="navy"
          onClick={() => navigate('/employees')}
        />
        <Stat
          label="Present today"
          value={stats.present ?? 0}
          hint={`${stats.attendancePercentage ?? 0}% attendance`}
          icon="✅"
          tone="green"
        />
        <Stat
          label="Absent today"
          value={stats.absent ?? 0}
          hint={isHoliday ? 'Holiday — not counted' : 'No DPR entry recorded'}
          icon="🔴"
          tone="red"
        />
        {/* <Stat
          label="Currently working"
          value={stats.currentlyWorking ?? 0}
          hint="IN recorded, OUT still pending"
          icon="🟢"
          tone="blue"
        /> */}
        <Stat
          label="Incomplete DPR"
          value={stats.incompleteDpr ?? 0}
          hint={`${stats.missingOutTime ?? 0} missing OUT time`}
          icon="🟡"
          tone="amber"
          onClick={() => navigate('/dpr/incomplete')}
        />
        <Stat
          label="Completed DPR"
          value={stats.completedDpr ?? 0}
          hint="All information recorded"
          icon="📋"
          tone="violet"
        />
        <Stat
          label="Total Man Power Hours of The Day"
          value={hoursDisplay(stats.totalHours)}
          hint={`Month to date: ${hoursDisplay(stats.monthToDateHours)}`}
          icon="⏱️"
          tone="navy"
        />
        <Stat
          label="Total overtime"
          value={hoursDisplay(stats.totalOvertime)}
          hint={`Short time: ${hoursDisplay(stats.totalShortTime)}`}
          icon="⚡"
          tone="orange"
        />
      </div>

      <div className="grid grid--2 mb-3">
        <Card
          title="Department-wise attendance"
          subtitle="Helpers count towards the department they actually worked in"
          flush
          actions={
            <Link to="/departments-overview" className="text-small">
              Full view →
            </Link>
          }
        >
          {departments.loading ? (
            <Loading />
          ) : departments.data?.departments?.length ? (
            <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th className="table__num">Total</th>
                    <th className="table__num">Present</th>
                    <th className="table__num">Absent</th>
                    <th className="table__num">Hours</th>
                    <th className="table__num">%</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.data.departments
                    .filter((d) => d.headcount > 0)
                    .map((d) => (
                      <tr key={d.id}>
                        <td className="table__strong">
                          {d.name}
                          {d.isHelperPool ? (
                            <>
                              {' '}
                              <Badge tone="orange">Helper pool</Badge>
                            </>
                          ) : null}
                        </td>
                        <td className="table__num">{d.headcount}</td>
                        <td className="table__num" style={{ color: 'var(--green-600)', fontWeight: 600 }}>
                          {d.present}
                        </td>
                        <td className="table__num" style={{ color: d.absent ? 'var(--red-600)' : undefined }}>
                          {d.absent}
                        </td>
                        <td className="table__num">{hoursDisplay(d.totalHours)}</td>
                        <td className="table__num">
                          <Badge tone={d.attendancePercentage >= 80 ? 'green' : d.attendancePercentage >= 50 ? 'amber' : 'red'}>
                            {d.attendancePercentage}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="🏭" title="No departments yet" text="Create departments to see the breakdown here." />
          )}
        </Card>

        <Card
          title={`Absent today (${overview.data?.absentees?.length || 0})`}
          subtitle="Active employees with no DPR entry"
          flush
        >
          {overview.data?.absentees?.length ? (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table className="table table--compact">
                <tbody>
                  {overview.data.absentees.map((e) => (
                    <tr key={e.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/employees/${e.id}`)}>
                      <td>
                        <div className="emp-cell">
                          <Avatar name={e.name} />
                          <div>
                            <div className="emp-cell__name">{e.name}</div>
                            <div className="emp-cell__meta">
                              {e.employeeId} · {e.designation || e.department}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Badge tone="red">Absent</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="🎉"
              title={isHoliday ? 'Holiday' : 'Full attendance'}
              text={isHoliday ? 'No attendance is expected today.' : 'Every active employee has a DPR entry today.'}
            />
          )}
        </Card>
      </div>

      {can('canViewReports') && analytics.data ? (
        <div className="grid grid--2">
          {/* <Card title="Attendance trend" subtitle="This month, day by day">
            <div className="chart-wrap chart-wrap--sm">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.data.attendanceTrend}>
                  <defs>
                    <linearGradient id="presentFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.navy} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_COLORS.navy} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} fontSize={11} stroke="#94a3b8" />
                  <YAxis fontSize={11} stroke="#94a3b8" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid #e5e9f2', fontSize: 12 }}
                    labelFormatter={(d) => `Date ${d}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="present"
                    name="Present"
                    stroke={CHART_COLORS.navy}
                    strokeWidth={2}
                    fill="url(#presentFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card> */}

          {/* <Card title="Overtime by day" subtitle="Total overtime hours recorded">
            <div className="chart-wrap chart-wrap--sm">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.data.overtimeTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} fontSize={11} stroke="#94a3b8" />
                  <YAxis fontSize={11} stroke="#94a3b8" />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e9f2', fontSize: 12 }} />
                  <Bar dataKey="overtime" name="Overtime (h)" fill={CHART_COLORS.orange} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card> */}
        </div>
      ) : null}
    </>
  );
}
