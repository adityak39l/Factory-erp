import { useState } from 'react';
import { endpoints } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Select,
  Switch,
  Textarea,
} from '../components/ui';

const EMPTY_DEPARTMENT = {
  name: '',
  nameHindi: '',
  code: '',
  description: '',
  hasTeams: false,
  isHelperPool: false,
  requiresWorkQtyByDefault: true,
};

export default function Departments() {
  const toast = useToast();
  const { can } = useAuth();
  const departments = useApi(() => endpoints.masters.departments({ includeInactive: true }), []);

  const [deptModal, setDeptModal] = useState(false);
  const [teamModal, setTeamModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_DEPARTMENT);
  const [teamForm, setTeamForm] = useState({ name: '', department: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);

  const list = departments.data?.departments || [];
  const manage = can('canManageMasters');

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_DEPARTMENT);
    setDeptModal(true);
  };

  const openEdit = (dept) => {
    setEditing(dept);
    setForm({
      name: dept.name,
      nameHindi: dept.nameHindi || '',
      code: dept.code || '',
      description: dept.description || '',
      hasTeams: dept.hasTeams,
      isHelperPool: dept.isHelperPool,
      requiresWorkQtyByDefault: dept.requiresWorkQtyByDefault,
    });
    setDeptModal(true);
  };

  const saveDepartment = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await endpoints.masters.updateDepartment(editing._id, form);
        toast.success('Department updated', form.name);
      } else {
        await endpoints.masters.createDepartment(form);
        toast.success('Department created', form.name);
      }
      setDeptModal(false);
      departments.reload();
    } catch (err) {
      toast.apiError(err, 'Could not save the department');
    } finally {
      setSaving(false);
    }
  };

  const saveTeam = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await endpoints.masters.createTeam(teamForm);
      toast.success('Team created', teamForm.name);
      setTeamModal(false);
      setTeamForm({ name: '', department: '', description: '' });
      departments.reload();
    } catch (err) {
      toast.apiError(err, 'Could not create the team');
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    try {
      await endpoints.masters.archiveDepartment(archiveTarget._id);
      toast.success('Department archived', 'Historical DPR data is untouched.');
      setArchiveTarget(null);
      departments.reload();
    } catch (err) {
      toast.apiError(err, 'Could not archive');
      setArchiveTarget(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Departments &amp; Teams</h1>
          <div className="page-head__subtitle">
            Teams are optional — enable them only for departments that need them, such as Welding
          </div>
        </div>
        {manage ? (
          <div className="page-head__actions">
            <Button
              onClick={() => {
                setTeamForm({ name: '', department: list.find((d) => d.hasTeams)?._id || '', description: '' });
                setTeamModal(true);
              }}
              icon="👥"
            >
              Add team
            </Button>
            <Button variant="primary" onClick={openCreate} icon="＋">
              Add department
            </Button>
          </div>
        ) : null}
      </div>

      {departments.loading && !departments.data ? (
        <Loading />
      ) : departments.error ? (
        <ErrorState error={departments.error} onRetry={departments.reload} />
      ) : list.length ? (
        <div className="grid grid--3">
          {list.map((dept) => (
            <Card
              key={dept._id}
              title={dept.name}
              subtitle={dept.nameHindi || dept.description || `${dept.employeeCount} active employees`}
              actions={
                manage ? (
                  <>
                    <Button size="sm" onClick={() => openEdit(dept)}>
                      Edit
                    </Button>
                    {dept.isActive ? (
                      <Button size="sm" variant="danger" onClick={() => setArchiveTarget(dept)}>
                        Archive
                      </Button>
                    ) : null}
                  </>
                ) : null
              }
            >
              <div className="flex-gap mb-2">
                <Badge tone="navy">{dept.employeeCount} employees</Badge>
                {dept.isHelperPool ? <Badge tone="orange">Helper pool</Badge> : null}
                {dept.hasTeams ? <Badge tone="blue">Uses teams</Badge> : null}
                {!dept.requiresWorkQtyByDefault ? <Badge tone="slate">No work output</Badge> : null}
                {!dept.isActive ? <Badge tone="red">Archived</Badge> : null}
              </div>

              {dept.hasTeams ? (
                <div>
                  <div className="field__label mb-1">Teams</div>
                  {dept.teams?.length ? (
                    <div className="flex-gap">
                      {dept.teams.map((t) => (
                        <Badge key={t._id} tone="slate">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-small text-muted">No teams created yet.</div>
                  )}
                </div>
              ) : (
                <div className="text-small text-muted">
                  Employees sit directly in this department — no team layer.
                </div>
              )}

              {dept.isHelperPool ? (
                <div className="mt-2">
                  <Alert tone="neutral">
                    People here can be logged against any other department for a given day.
                  </Alert>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon="🏗️"
            title="No departments yet"
            text="Create the factory departments — Store, Cutting, Welding, Painting, Helper and so on."
          />
        </Card>
      )}

      <Modal
        open={deptModal}
        onClose={() => setDeptModal(false)}
        title={editing ? `Edit ${editing.name}` : 'New department'}
        footer={
          <>
            <Button onClick={() => setDeptModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveDepartment} loading={saving}>
              {editing ? 'Save changes' : 'Create department'}
            </Button>
          </>
        }
      >
        <form onSubmit={saveDepartment}>
          <div className="grid grid--form">
            <Field label="Department name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            </Field>
            <Field label="Hindi name" hint="Shown alongside the English name">
              <Input value={form.nameHindi} onChange={(e) => setForm({ ...form, nameHindi: e.target.value })} />
            </Field>
          </div>
          <Field label="Description">
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </Field>

          <div style={{ display: 'grid', gap: 12, marginTop: 6 }}>
            <Switch
              checked={form.hasTeams}
              onChange={(e) => setForm({ ...form, hasTeams: e.target.checked })}
              label="This department is split into teams (e.g. Welding → Team A / B / C)"
            />
            <Switch
              checked={form.isHelperPool}
              onChange={(e) => setForm({ ...form, isHelperPool: e.target.checked })}
              label="Helper pool — people here can cover any department for a day"
            />
            <Switch
              checked={form.requiresWorkQtyByDefault}
              onChange={(e) => setForm({ ...form, requiresWorkQtyByDefault: e.target.checked })}
              label="Work description & quantity expected by default"
            />
          </div>
          <div className="field__hint mt-1">
            Turn the last option off for support departments (security, kitchen, housekeeping) so
            their DPR is never treated as incomplete for missing work details.
          </div>
        </form>
      </Modal>

      <Modal
        open={teamModal}
        onClose={() => setTeamModal(false)}
        title="New team"
        subtitle="Only departments with teams enabled can hold teams"
        footer={
          <>
            <Button onClick={() => setTeamModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveTeam} loading={saving}>
              Create team
            </Button>
          </>
        }
      >
        <form onSubmit={saveTeam}>
          <Field label="Department" required>
            <Select
              value={teamForm.department}
              onChange={(e) => setTeamForm({ ...teamForm, department: e.target.value })}
              required
            >
              <option value="">Select department…</option>
              {list
                .filter((d) => d.hasTeams && d.isActive)
                .map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Team name" required>
            <Input
              value={teamForm.name}
              onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
              placeholder="e.g. Team A"
              required
            />
          </Field>
        </form>
      </Modal>

      <ConfirmModal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onConfirm={archive}
        danger
        confirmLabel="Archive department"
        title="Archive this department?"
        message={`${archiveTarget?.name} will be hidden from new assignments. Nothing is deleted — every historical DPR entry that references it stays intact. Move any active employees out first.`}
      />
    </>
  );
}
