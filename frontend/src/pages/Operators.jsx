import { useMemo, useState } from 'react';
import { endpoints } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CheckboxRow,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
} from '../components/ui';
import { dateTimeDisplay } from '../utils/format';

/** Compact labels so the permissions column stays readable inside the table. */
const SHORT_LABELS = {
  canRegisterEmployee: 'Register',
  canEditEmployee: 'Edit employees',
  canAssignDepartment: 'Assign dept',
  canChangeEmployeeStatus: 'Active/Inactive',
  canViewSensitive: 'Aadhar & bank',
  canEnterDpr: 'Enter DPR',
  canEditDpr: 'Edit locked DPR',
  canManageMasters: 'Configuration',
  canViewReports: 'Reports',
};

/**
 * Operator accounts and their individual permission checklists.
 * Only the administrator can reach this screen — enforced on the server too.
 */
export default function Operators() {
  const toast = useToast();
  const operators = useApi(() => endpoints.operators.list(), []);
  const catalogue = useApi(() => endpoints.operators.catalogue(), []);

  const [createOpen, setCreateOpen] = useState(false);
  const [permissionTarget, setPermissionTarget] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [disableTarget, setDisableTarget] = useState(null);

  const [form, setForm] = useState({ username: '', name: '', email: '', password: '', permissions: {} });
  const [permissions, setPermissions] = useState({});
  const [newPassword, setNewPassword] = useState('');
  const [editForm, setEditForm] = useState({ username: '', name: '', email: '' });
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => {
    const list = catalogue.data?.permissions || [];
    return list.reduce((acc, p) => {
      (acc[p.group] = acc[p.group] || []).push(p);
      return acc;
    }, {});
  }, [catalogue.data]);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await endpoints.operators.create(form);
      toast.success('Operator created', `${form.name} can now sign in as ${form.username}`);
      setCreateOpen(false);
      setForm({ username: '', name: '', email: '', password: '', permissions: {} });
      operators.reload();
    } catch (err) {
      toast.apiError(err, 'Could not create the operator');
    } finally {
      setSaving(false);
    }
  };

  const savePermissions = async () => {
    setSaving(true);
    try {
      await endpoints.operators.setPermissions(permissionTarget.id, permissions);
      toast.success('Permissions updated', `${permissionTarget.name}'s access takes effect immediately.`);
      setPermissionTarget(null);
      operators.reload();
    } catch (err) {
      toast.apiError(err, 'Could not update permissions');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    setSaving(true);
    try {
      await endpoints.operators.resetPassword(passwordTarget.id, newPassword);
      toast.success('Password reset', `Share the new password with ${passwordTarget.name} securely.`);
      setPasswordTarget(null);
      setNewPassword('');
    } catch (err) {
      toast.apiError(err, 'Could not reset the password');
    } finally {
      setSaving(false);
    }
  };

  const saveDetails = async () => {
    setSaving(true);
    try {
      await endpoints.operators.update(editTarget.id, editForm);
      toast.success('Operator updated');
      setEditTarget(null);
      operators.reload();
    } catch (err) {
      toast.apiError(err, 'Could not update the operator');
    } finally {
      setSaving(false);
    }
  };

  const disable = async () => {
    try {
      await endpoints.operators.disable(disableTarget.id);
      toast.success('Login disabled', 'The account and its audit history are preserved.');
      setDisableTarget(null);
      operators.reload();
    } catch (err) {
      toast.apiError(err, 'Could not disable the login');
      setDisableTarget(null);
    }
  };

  const list = operators.data?.operators || [];

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Operators &amp; Access Control</h1>
          <div className="page-head__subtitle">
            Every permission is checked on the server — the interface only mirrors it
          </div>
        </div>
        <div className="page-head__actions">
          <Button variant="primary" onClick={() => setCreateOpen(true)} icon="＋">
            Create operator login
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <Alert tone="neutral" title="How access works">
          The administrator always has unrestricted access and is the only role that can create
          operators or change permissions. Operators start with nothing enabled — tick exactly what
          each person may do. “Edit locked DPR fields” and “View Aadhar &amp; bank details” are off by
          default and should be granted deliberately.
        </Alert>
      </div>

      {operators.loading && !operators.data ? (
        <Loading />
      ) : operators.error ? (
        <ErrorState error={operators.error} onRetry={operators.reload} />
      ) : list.length ? (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Login ID</th>
                  <th>Role</th>
                  <th>Permissions</th>
                  <th>Last sign-in</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((op) => {
                  const granted = Object.entries(op.permissions || {}).filter(([, v]) => v);
                  return (
                    <tr key={op.id}>
                      <td>
                        <div className="emp-cell">
                          <Avatar name={op.name} orange={op.role === 'admin'} />
                          <div>
                            <div className="emp-cell__name">{op.name}</div>
                            {op.email ? <div className="emp-cell__meta">{op.email}</div> : null}
                          </div>
                        </div>
                      </td>
                      <td className="mono">{op.username}</td>
                      <td>
                        <Badge tone={op.role === 'admin' ? 'orange' : 'navy'}>
                          {op.role === 'admin' ? 'Administrator' : 'Operator'}
                        </Badge>
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        {op.role === 'admin' ? (
                          <span className="text-small text-muted">Full unrestricted access</span>
                        ) : granted.length ? (
                          <div className="flex-gap" title={granted.map(([k]) => SHORT_LABELS[k] || k).join(', ')}>
                            {granted.slice(0, 2).map(([key]) => (
                              <Badge key={key} tone="slate">
                                {SHORT_LABELS[key] || key}
                              </Badge>
                            ))}
                            {granted.length > 2 ? <Badge tone="navy">+{granted.length - 2}</Badge> : null}
                          </div>
                        ) : (
                          <span className="text-small text-muted">No permissions granted</span>
                        )}
                      </td>
                      <td className="text-small text-muted">{dateTimeDisplay(op.lastLoginAt)}</td>
                      <td>
                        <Badge tone={op.isActive ? 'green' : 'slate'} dot>
                          {op.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                      </td>
                      <td style={{ minWidth: 190 }}>
                        <div className="flex-gap">
                          {op.role !== 'admin' ? (
                            <Button
                              size="sm"
                              onClick={() => {
                                setPermissionTarget(op);
                                setPermissions({ ...op.permissions });
                              }}
                            >
                              Permissions
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            onClick={() => {
                              setEditTarget(op);
                              setEditForm({ username: op.username, name: op.name, email: op.email || '' });
                            }}
                          >
                            Edit
                          </Button>
                          <Button size="sm" onClick={() => setPasswordTarget(op)}>
                            Reset password
                          </Button>
                          {op.role !== 'admin' && op.isActive ? (
                            <Button size="sm" variant="danger" onClick={() => setDisableTarget(op)}>
                              Disable
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState icon="🔐" title="No logins yet" text="Create the first operator login." />
        </Card>
      )}

      {/* Create operator */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size="lg"
        title="Create operator login"
        subtitle="Tick exactly what this person is allowed to do"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} loading={saving}>
              Create login
            </Button>
          </>
        }
      >
        <form onSubmit={create}>
          <div className="grid grid--form">
            <Field label="Full name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            </Field>
            <Field label="Login ID" required hint="Letters, numbers, dot, underscore, hyphen">
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                placeholder="e.g. dpr.operator"
                required
              />
            </Field>
            <Field label="Email (optional)">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Password" required hint="At least 8 characters including a number">
              <Input
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Field>
          </div>

          <h3 className="mt-2 mb-1">Permissions</h3>
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} className="mb-2">
              <div className="field__label mb-1">{group}</div>
              {items.map((p) => (
                <CheckboxRow
                  key={p.key}
                  label={p.label}
                  hint={p.description}
                  checked={form.permissions[p.key]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      permissions: { ...form.permissions, [p.key]: e.target.checked },
                    })
                  }
                />
              ))}
            </div>
          ))}
        </form>
      </Modal>

      {/* Permissions */}
      <Modal
        open={!!permissionTarget}
        onClose={() => setPermissionTarget(null)}
        size="lg"
        title={`Permissions — ${permissionTarget?.name}`}
        subtitle="Changes apply immediately, without the operator signing in again"
        footer={
          <>
            <Button onClick={() => setPermissionTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={savePermissions} loading={saving}>
              Save permissions
            </Button>
          </>
        }
      >
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-2">
            <div className="field__label mb-1">{group}</div>
            {items.map((p) => (
              <CheckboxRow
                key={p.key}
                label={p.label}
                hint={p.description}
                checked={permissions[p.key]}
                onChange={(e) => setPermissions({ ...permissions, [p.key]: e.target.checked })}
              />
            ))}
          </div>
        ))}
      </Modal>

      {/* Edit details */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Edit ${editTarget?.name}`}
        footer={
          <>
            <Button onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveDetails} loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        <Field label="Full name">
          <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
        </Field>
        <Field label="Login ID" hint="Changing this changes how they sign in">
          <Input
            value={editForm.username}
            onChange={(e) => setEditForm({ ...editForm, username: e.target.value.toLowerCase() })}
          />
        </Field>
        <Field
          label="Email"
          hint={editTarget?.role === 'admin' ? 'Used for administrator password recovery' : 'Optional'}
        >
          <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
        </Field>
      </Modal>

      {/* Reset password */}
      <Modal
        open={!!passwordTarget}
        onClose={() => {
          setPasswordTarget(null);
          setNewPassword('');
        }}
        title={`Reset password — ${passwordTarget?.name}`}
        subtitle="Use this when someone forgets their password"
        footer={
          <>
            <Button
              onClick={() => {
                setPasswordTarget(null);
                setNewPassword('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={resetPassword} loading={saving} disabled={newPassword.length < 6}>
              Reset password
            </Button>
          </>
        }
      >
        <Field label="New password" required hint="At least 8 characters including a number">
          <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
        </Field>
        <Alert tone="warning">
          Share the new password directly with the person and ask them to change it after signing in.
          This reset is recorded in the audit log.
        </Alert>
      </Modal>

      <ConfirmModal
        open={!!disableTarget}
        onClose={() => setDisableTarget(null)}
        onConfirm={disable}
        danger
        confirmLabel="Disable login"
        title="Disable this login?"
        message={`${disableTarget?.name} will no longer be able to sign in. The account and everything they recorded stay in the system for the audit trail, and the login can be re-enabled later.`}
      />
    </>
  );
}
