import { useState } from 'react';
import { endpoints } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Alert, Avatar, Badge, Button, Card, Field, Input, KeyValue } from '../components/ui';
import { dateTimeDisplay } from '../utils/format';

export default function Account() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast.error('Passwords do not match', 'Re-enter the new password.');
      return;
    }
    setSaving(true);
    try {
      await endpoints.auth.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast.success('Password changed', 'Use the new password next time you sign in.');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.apiError(err, 'Could not change the password');
    } finally {
      setSaving(false);
    }
  };

  const granted = Object.entries(user?.permissions || {}).filter(([, v]) => v);

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>My Account</h1>
          <div className="page-head__subtitle">Your profile, access and password</div>
        </div>
      </div>

      <div className="grid grid--2">
        <Card title="Profile">
          <div className="emp-cell mb-3">
            <Avatar name={user?.name} orange={isAdmin} />
            <div>
              <h2>{user?.name}</h2>
              <div className="text-small text-muted">
                {user?.username} ·{' '}
                <Badge tone={isAdmin ? 'orange' : 'navy'}>
                  {isAdmin ? 'Administrator' : 'Operator'}
                </Badge>
              </div>
            </div>
          </div>

          <KeyValue
            items={[
              { key: 'Login ID', value: <span className="mono">{user?.username}</span> },
              { key: 'Email', value: user?.email || 'Not set' },
              { key: 'Role', value: isAdmin ? 'Administrator (full access)' : 'Operator' },
              { key: 'Last sign-in', value: dateTimeDisplay(user?.lastLoginAt) },
            ]}
          />

          <h3 className="mt-3 mb-1">Your access</h3>
          {isAdmin ? (
            <Alert tone="neutral">
              As administrator you have unrestricted access to every screen and every action, and you
              are the only role that can create operators or change permissions.
            </Alert>
          ) : granted.length ? (
            <div className="flex-gap">
              {granted.map(([key]) => (
                <Badge key={key} tone="navy">
                  {PERMISSION_LABELS[key] || key}
                </Badge>
              ))}
            </div>
          ) : (
            <Alert tone="warning">
              No permissions have been granted to your login yet. Ask the administrator to enable what
              you need.
            </Alert>
          )}
        </Card>

        <Card title="Change password" subtitle="Choose something only you know">
          <form onSubmit={submit}>
            <Field label="Current password" required>
              <Input
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password" required hint="At least 8 characters including a number">
              <Input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                required
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password" required>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                required
                autoComplete="new-password"
              />
            </Field>
            <Button type="submit" variant="primary" loading={saving}>
              Change password
            </Button>
          </form>

          {isAdmin ? (
            <div className="mt-3">
              <Alert tone="neutral" title="If you ever get locked out">
                Use “Administrator forgot password?” on the sign-in screen. A one-time code is sent to
                the email registered on this account — keep that address up to date.
              </Alert>
            </div>
          ) : (
            <div className="mt-3">
              <Alert tone="neutral">
                If you forget your password, the administrator can reset it for you from the Operators
                screen.
              </Alert>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

const PERMISSION_LABELS = {
  canRegisterEmployee: 'Register employees',
  canEditEmployee: 'Edit employees',
  canAssignDepartment: 'Assign departments',
  canChangeEmployeeStatus: 'Activate / deactivate',
  canViewSensitive: 'View Aadhar & bank',
  canEnterDpr: 'Enter DPR',
  canEditDpr: 'Edit locked DPR fields',
  canManageMasters: 'Manage configuration',
  canViewReports: 'Reports & analytics',
};
