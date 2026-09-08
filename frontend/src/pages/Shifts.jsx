import { useEffect, useState } from 'react';
import { endpoints } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
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
import { hoursDisplay, isoToDisplay, todayIso } from '../utils/format';

/**
 * Shift timings drive overtime and short time. Saving new timings creates a new
 * dated version rather than rewriting the old one, so historical DPR entries keep
 * being measured against the timings that were actually in force back then.
 */
export default function Shifts() {
  const toast = useToast();
  const { can } = useAuth();
  const shifts = useApi(() => endpoints.masters.shifts(), []);

  const [forms, setForms] = useState({});
  const [saving, setSaving] = useState('');

  useEffect(() => {
    if (!shifts.data) return;
    const next = {};
    ['Day', 'Night'].forEach((name) => {
      const current = shifts.data.shifts.find((s) => s.name === name);
      next[name] = {
        startTime: current?.startTime || (name === 'Day' ? '09:15' : '18:00'),
        endTime: current?.endTime || (name === 'Day' ? '18:15' : '02:30'),
        effectiveFrom: todayIso(),
        note: '',
      };
    });
    setForms(next);
  }, [shifts.data]);

  const manage = can('canManageMasters');

  const save = async (name) => {
    setSaving(name);
    try {
      await endpoints.masters.saveShift({ name, ...forms[name] });
      toast.success(`${name} shift saved`, 'Past DPR entries keep their original timings.');
      shifts.reload();
    } catch (err) {
      toast.apiError(err, 'Could not save the shift');
    } finally {
      setSaving('');
    }
  };

  const setValue = (name, key, value) =>
    setForms((f) => ({ ...f, [name]: { ...f[name], [key]: value } }));

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Shift Settings</h1>
          <div className="page-head__subtitle">
            Overtime and short time are calculated against these timings
          </div>
        </div>
      </div>

      <div className="mb-3">
        <Alert tone="neutral" title="How shift changes are handled">
          Changing a shift creates a new dated version. Any DPR already recorded keeps being measured
          against the timings that applied on its own date, so history never shifts under your feet.
          Contract workers are not affected — they never use shifts.
        </Alert>
      </div>

      {shifts.loading && !shifts.data ? (
        <Loading />
      ) : shifts.error ? (
        <ErrorState error={shifts.error} onRetry={shifts.reload} />
      ) : (
        <>
          <div className="grid grid--2 mb-3">
            {['Day', 'Night'].map((name) => {
              const current = shifts.data.shifts.find((s) => s.name === name);
              const form = forms[name] || {};
              return (
                <Card
                  key={name}
                  title={`${name} shift`}
                  icon={name === 'Day' ? '☀️' : '🌙'}
                  subtitle={
                    current
                      ? `Currently ${current.startTime} – ${current.endTime} (${hoursDisplay(current.durationHours)})`
                      : 'Not configured yet'
                  }
                >
                  {current?.crossesMidnight ? (
                    <div className="mb-2">
                      <Badge tone="violet">Crosses midnight — handled as one continuous shift</Badge>
                    </div>
                  ) : null}

                  <div className="grid grid--form">
                    <Field label="Start time" required>
                      <Input
                        type="time"
                        value={form.startTime || ''}
                        onChange={(e) => setValue(name, 'startTime', e.target.value)}
                        disabled={!manage}
                      />
                    </Field>
                    <Field label="End time" required>
                      <Input
                        type="time"
                        value={form.endTime || ''}
                        onChange={(e) => setValue(name, 'endTime', e.target.value)}
                        disabled={!manage}
                      />
                    </Field>
                    <Field label="Effective from" hint="Earlier dates keep the previous timings">
                      <Input
                        type="date"
                        value={form.effectiveFrom || todayIso()}
                        onChange={(e) => setValue(name, 'effectiveFrom', e.target.value)}
                        disabled={!manage}
                      />
                    </Field>
                    <Field label="Note (optional)">
                      <Input
                        value={form.note || ''}
                        onChange={(e) => setValue(name, 'note', e.target.value)}
                        placeholder="e.g. Summer timing"
                        disabled={!manage}
                      />
                    </Field>
                  </div>

                  {manage ? (
                    <Button
                      variant="primary"
                      className="btn--block mt-1"
                      loading={saving === name}
                      onClick={() => save(name)}
                    >
                      Save {name.toLowerCase()} shift timings
                    </Button>
                  ) : null}
                </Card>
              );
            })}
          </div>

          <Card title="Timing history" subtitle="Previous versions, kept for historical accuracy" flush>
            {shifts.data.history?.length ? (
              <div className="table-wrap">
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Shift</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Duration</th>
                      <th>Effective from</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.data.history.map((s) => (
                      <tr key={s._id}>
                        <td className="table__strong">{s.name}</td>
                        <td className="mono">{s.startTime}</td>
                        <td className="mono">{s.endTime}</td>
                        <td>{hoursDisplay(s.durationHours)}</td>
                        <td>{isoToDisplay(s.effectiveFrom)}</td>
                        <td className="text-small text-muted">{s.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="🕐" title="No previous versions" text="Shift timings have not been changed yet." />
            )}
          </Card>
        </>
      )}
    </>
  );
}
