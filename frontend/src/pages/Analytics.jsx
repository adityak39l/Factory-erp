import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { endpoints } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Select,
  Stat,
} from '../components/ui';
import { hoursDisplay, monthOptions, numberDisplay, yearOptions } from '../utils/format';

const NAVY = '#05054A';
const ORANGE = '#E28431';
const GREEN = '#16a34a';
const RED = '#ef4444';
const VIOLET = '#7c3aed';
const PIE_COLORS = [NAVY, ORANGE, '#3b82f6', GREEN, VIOLET, '#f59e0b', '#0ea5e9', '#ec4899'];

const tooltipStyle = { borderRadius: 10, border: '1px solid #e5e9f2', fontSize: 12 };
const axis = { fontSize: 11, stroke: '#94a3b8' };

export default function Analytics() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const analytics = useApi(() => endpoints.dashboard.analytics({ year, month }), [year, month]);

  if (analytics.loading && !analytics.data) return <Loading text="Crunching the month…" />;
  if (analytics.error) return <ErrorState error={analytics.error} onRetry={analytics.reload} />;

  const data = analytics.data;
  const dayLabel = (d) => d.slice(8);

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Monthly Analytics</h1>
          <div className="page-head__subtitle">
            {monthOptions[month - 1].label} {year} · {data.totals.entries} DPR entries
          </div>
        </div>
        <div className="page-head__actions">
          <Field style={{ marginBottom: 0 }}>
            <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field style={{ marginBottom: 0 }}>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions(6).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="grid grid--stats mb-3">
        <Stat label="Total hours" value={hoursDisplay(data.totals.hours)} icon="⏱️" tone="navy" />
        <Stat label="Overtime" value={hoursDisplay(data.totals.overtime)} icon="⚡" tone="orange" />
        <Stat label="Short time" value={hoursDisplay(data.totals.shortTime)} icon="⏬" tone="amber" />
        <Stat label="Quantity produced" value={numberDisplay(data.totals.quantity)} icon="📦" tone="violet" />
        <Stat
          label="DPR completion"
          value={`${data.totals.completionRate}%`}
          icon="✅"
          tone="green"
          hint="Entries with every field filled"
        />
      </div>

      {!data.totals.entries ? (
        <Card>
          <EmptyState
            icon="📈"
            title="No DPR data for this month"
            text="Pick a different month, or start recording entries."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid--2 mb-3">
            <Card title="Attendance trend" subtitle="Present vs absent, day by day">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.attendanceTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={dayLabel} {...axis} />
                    <YAxis {...axis} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="present" name="Present" stackId="a" fill={NAVY} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="absent" name="Absent" stackId="a" fill={RED} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Working hours" subtitle="Total hours recorded each day">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.hoursTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={dayLabel} {...axis} />
                    <YAxis {...axis} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="hours"
                      name="Hours"
                      stroke={NAVY}
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="quantity"
                      name="Quantity"
                      stroke={ORANGE}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid--2 mb-3">
            <Card title="Overtime & short time" subtitle="Hours beyond or below the scheduled shift">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.overtimeTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={dayLabel} {...axis} />
                    <YAxis {...axis} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="overtime" name="Overtime" fill={ORANGE} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="shortTime" name="Short time" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="DPR completion rate" subtitle="Share of entries with every field filled">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.completionTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={dayLabel} {...axis} />
                    <YAxis {...axis} domain={[0, 100]} unit="%" />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="completion"
                      name="Completion %"
                      stroke={GREEN}
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid--2">
            <Card title="Department comparison" subtitle="Hours worked and quantity produced">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.departmentComparison} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f7" horizontal={false} />
                    <XAxis type="number" {...axis} />
                    <YAxis type="category" dataKey="name" width={130} {...axis} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="hours" name="Hours" fill={NAVY} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="overtime" name="Overtime" fill={ORANGE} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Shift split" subtitle="Where the month's hours were worked">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.shiftSplit.filter((s) => s.entries > 0)}
                      dataKey="hours"
                      nameKey="shift"
                      innerRadius={58}
                      outerRadius={95}
                      paddingAngle={3}
                    >
                      {data.shiftSplit.map((entry, index) => (
                        <Cell key={entry.shift} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} h`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-small text-muted text-center">
                Contract workers appear separately — they have no shift, so no overtime is measured.
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
