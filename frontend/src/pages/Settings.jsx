import { useEffect, useState } from 'react';
import { endpoints } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import {
  Alert,
  Button,
  Card,
  CheckboxRow,
  ErrorState,
  Field,
  Input,
  Loading,
  Select,
  Switch,
  Tabs,
} from '../components/ui';
import { WEEKDAYS } from '../utils/format';

const TABS = [
  { key: 'company', label: 'Company' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'dpr', label: 'DPR rules' },
  { key: 'security', label: 'Security' },
  { key: 'notifications', label: 'Notifications' },
];

export default function Settings() {
  const toast = useToast();
  const settings = useApi(() => endpoints.system.settings(), []);

  const [tab, setTab] = useState('company');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data?.settings) {
      const { company, attendance, dpr, security, notifications } = settings.data.settings;
      setForm({ company, attendance, dpr, security, notifications });
    }
  }, [settings.data]);

  const set = (section, key, value) =>
    setForm((f) => ({ ...f, [section]: { ...f[section], [key]: value } }));

  const save = async () => {
    setSaving(true);
    try {
      // Strip mongoose internals before sending.
      const payload = {
        company: { ...form.company },
        attendance: { ...form.attendance },
        dpr: { ...form.dpr },
        security: { ...form.security },
        notifications: { ...form.notifications },
      };
      delete payload.company._id;
      delete payload.attendance._id;
      delete payload.dpr._id;
      delete payload.security._id;
      delete payload.notifications._id;

      await endpoints.system.saveSettings(payload);
      toast.success('Settings saved');
      settings.reload();
    } catch (err) {
      toast.apiError(err, 'Could not save the settings');
    } finally {
      setSaving(false);
    }
  };

  if (settings.loading && !settings.data) return <Loading />;
  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />;
  if (!form) return <Loading />;

  const toggleWeeklyOff = (day) => {
    const current = form.attendance.weeklyOffDays || [];
    set(
      'attendance',
      'weeklyOffDays',
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    );
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>System Settings</h1>
          <div className="page-head__subtitle">
            Values the factory can change without touching the code
          </div>
        </div>
        <div className="page-head__actions">
          <Button variant="primary" onClick={save} loading={saving} icon="💾">
            Save settings
          </Button>
        </div>
      </div>

      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'company' ? (
        <Card title="Company details" subtitle="Shown on exported reports and PDFs">
          <div className="grid grid--form">
            <Field label="Company name">
              <Input value={form.company.name || ''} onChange={(e) => set('company', 'name', e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={form.company.phone || ''} onChange={(e) => set('company', 'phone', e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={form.company.email || ''} onChange={(e) => set('company', 'email', e.target.value)} />
            </Field>
            <Field label="GSTIN">
              <Input value={form.company.gstin || ''} onChange={(e) => set('company', 'gstin', e.target.value)} />
            </Field>
            <Field label="Address line 1">
              <Input
                value={form.company.addressLine1 || ''}
                onChange={(e) => set('company', 'addressLine1', e.target.value)}
              />
            </Field>
            <Field label="Address line 2">
              <Input
                value={form.company.addressLine2 || ''}
                onChange={(e) => set('company', 'addressLine2', e.target.value)}
              />
            </Field>
            <Field label="City">
              <Input value={form.company.city || ''} onChange={(e) => set('company', 'city', e.target.value)} />
            </Field>
            <Field label="State">
              <Input value={form.company.state || ''} onChange={(e) => set('company', 'state', e.target.value)} />
            </Field>
            <Field label="PIN code">
              <Input value={form.company.pincode || ''} onChange={(e) => set('company', 'pincode', e.target.value)} />
            </Field>
          </div>
        </Card>
      ) : null}

      {tab === 'attendance' ? (
        <Card title="Attendance rules">
          <Field label="Weekly off days" hint="These days are treated as holidays for attendance">
            <div className="flex-gap">
              {WEEKDAYS.map((label, index) => (
                <label key={label} className="checkbox-row" style={{ padding: '6px 10px' }}>
                  <input
                    type="checkbox"
                    checked={(form.attendance.weeklyOffDays || []).includes(index)}
                    onChange={() => toggleWeeklyOff(index)}
                  />
                  <span className="checkbox-row__label">{label}</span>
                </label>
              ))}
            </div>
          </Field>

          <div className="grid grid--form mt-2">
            <Field label="Grace period (minutes)" hint="Lateness tolerated before an entry is flagged">
              <Input
                type="number"
                min="0"
                max="120"
                value={form.attendance.graceMinutes ?? 15}
                onChange={(e) => set('attendance', 'graceMinutes', Number(e.target.value))}
              />
            </Field>
          </div>

          <Switch
            checked={form.attendance.treatWeeklyOffAsHoliday}
            onChange={(e) => set('attendance', 'treatWeeklyOffAsHoliday', e.target.checked)}
            label="Treat weekly offs as holidays (nobody is marked absent)"
          />

          <div className="mt-2">
            <Alert tone="neutral">
              Absence is always inferred, never entered by hand: an active employee with no DPR entry
              on a working day is absent. Inactive employees are excluded entirely.
            </Alert>
          </div>
        </Card>
      ) : null}

      {tab === 'dpr' ? (
        <Card title="DPR entry rules">
          <div className="grid grid--form">
            <Field
              label="Backdating limit (days)"
              hint="0 means no limit. Operators cannot record DPR older than this."
            >
              <Input
                type="number"
                min="0"
                max="365"
                value={form.dpr.backdateLimitDays ?? 7}
                onChange={(e) => set('dpr', 'backdateLimitDays', Number(e.target.value))}
              />
            </Field>
            <Field label="Default quantity unit">
              <Input
                value={form.dpr.defaultQtyUnit || 'Nos'}
                onChange={(e) => set('dpr', 'defaultQtyUnit', e.target.value)}
              />
            </Field>
          </div>

          <Switch
            checked={form.dpr.allowFutureDates}
            onChange={(e) => set('dpr', 'allowFutureDates', e.target.checked)}
            label="Allow DPR entry for future dates"
          />

          <div className="mt-2">
            <Alert tone="warning" title="These rules never change">
              Progressive locking (IN, OUT and Work + Quantity locking independently on save),
              overtime for permanent employees only, and holiday blocking are core to the system and
              are not configurable.
            </Alert>
          </div>
        </Card>
      ) : null}

      {tab === 'security' ? (
        <Card title="Security policy">
          <div className="grid grid--form">
            <Field label="Session timeout (minutes)" hint="How long a sign-in stays valid">
              <Input
                type="number"
                min="15"
                max="10080"
                value={form.security.sessionTimeoutMinutes ?? 720}
                onChange={(e) => set('security', 'sessionTimeoutMinutes', Number(e.target.value))}
              />
            </Field>
            <Field label="Minimum password length">
              <Input
                type="number"
                min="6"
                max="64"
                value={form.security.passwordMinLength ?? 8}
                onChange={(e) => set('security', 'passwordMinLength', Number(e.target.value))}
              />
            </Field>
            <Field label="Maximum login attempts">
              <Input
                type="number"
                min="3"
                max="50"
                value={form.security.maxLoginAttempts ?? 10}
                onChange={(e) => set('security', 'maxLoginAttempts', Number(e.target.value))}
              />
            </Field>
          </div>

          <CheckboxRow
            label="Passwords must contain a number"
            checked={form.security.passwordRequireNumber}
            onChange={(e) => set('security', 'passwordRequireNumber', e.target.checked)}
          />
          <CheckboxRow
            label="Passwords must contain an uppercase letter"
            checked={form.security.passwordRequireUppercase}
            onChange={(e) => set('security', 'passwordRequireUppercase', e.target.checked)}
          />

          <div className="mt-2">
            <Alert tone="neutral">
              Aadhar and bank account numbers are always encrypted in the database and only revealed
              to users holding the “View Aadhar &amp; bank details” permission.
            </Alert>
          </div>
        </Card>
      ) : null}

      {tab === 'notifications' ? (
        <Card title="Notifications">
          <CheckboxRow
            label="Email notifications enabled"
            hint="Requires SMTP settings in the server environment"
            checked={form.notifications.emailEnabled}
            onChange={(e) => set('notifications', 'emailEnabled', e.target.checked)}
          />
          <CheckboxRow
            label="Highlight absentees"
            checked={form.notifications.notifyOnAbsence}
            onChange={(e) => set('notifications', 'notifyOnAbsence', e.target.checked)}
          />
          <CheckboxRow
            label="Highlight incomplete DPR entries"
            checked={form.notifications.notifyOnIncompleteDpr}
            onChange={(e) => set('notifications', 'notifyOnIncompleteDpr', e.target.checked)}
          />
          <div className="grid grid--form mt-2">
            <Field label="Daily summary time">
              <Input
                type="time"
                value={form.notifications.dailySummaryTime || '19:00'}
                onChange={(e) => set('notifications', 'dailySummaryTime', e.target.value)}
              />
            </Field>
          </div>
        </Card>
      ) : null}
    </>
  );
}
