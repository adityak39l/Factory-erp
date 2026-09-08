import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints } from '../api/client';
import { useApi, useDebounced } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Alert,
  Avatar,
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
  Pagination,
  Select,
  Switch,
  Textarea,
} from '../components/ui';
import { isoToDisplay, todayIso } from '../utils/format';

const EMPTY_FORM = {
  name: '',
  designation: '',
  fathersName: '',
  mobileNo: '',
  email: '',
  address: '',
  employeeType: 'Permanent',
  shiftCategory: 'Day',
  requiresWorkQty: true,
  department: '',
  team: '',
  joiningDate: todayIso(),
  joiningYear: new Date().getFullYear(),
  joiningMonth: new Date().getMonth() + 1,
  aadharNo: '',
  bankName: '',
  accountNo: '',
  ifsc: '',
};

export default function Employees() {
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();

  const [filters, setFilters] = useState({
    status: 'Active',
    department: '',
    employeeType: '',
    search: '',
    page: 1,
  });
  const search = useDebounced(filters.search, 350);

  const list = useApi(
    () =>
      endpoints.employees.list({
        status: filters.status,
        department: filters.department || undefined,
        employeeType: filters.employeeType || undefined,
        search: search || undefined,
        page: filters.page,
        limit: 25,
      }),
    [filters.status, filters.department, filters.employeeType, search, filters.page]
  );
  const departments = useApi(() => endpoints.masters.departments(), []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);

  const departmentList = departments.data?.departments || [];
  const selectedDepartment = departmentList.find((d) => d._id === form.department);
  const teams = selectedDepartment?.teams || [];

  useEffect(() => {
    setFilters((f) => ({ ...f, page: 1 }));
  }, [search, filters.status, filters.department, filters.employeeType]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, department: departmentList[0]?._id || '' });
    setModalOpen(true);
  };

  const openEdit = (employee) => {
    setEditing(employee);
    setForm({
      name: employee.name,
      designation: employee.designation || '',
      fathersName: employee.fathersName || '',
      mobileNo: employee.mobileNo || '',
      email: employee.email || '',
      address: employee.address || '',
      employeeType: employee.employeeType,
      shiftCategory: employee.shiftCategory === 'Not Applicable' ? 'Day' : employee.shiftCategory,
      requiresWorkQty: employee.requiresWorkQty,
      department: employee.department?._id || employee.department || '',
      team: employee.team?._id || employee.team || '',
      joiningDate: (employee.joiningDate || '').slice(0, 10),
      aadharNo: employee.sensitive?.canView ? employee.sensitive.aadharNo : '',
      bankName: employee.sensitive?.bank?.bankName || '',
      accountNo: employee.sensitive?.canView ? employee.sensitive.bank.accountNo : '',
      ifsc: employee.sensitive?.canView ? employee.sensitive.bank.ifsc : '',
    });
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        team: form.team || null,
        joiningYear: Number(form.joiningDate.slice(0, 4)),
        joiningMonth: Number(form.joiningDate.slice(5, 7)),
      };
      // Only send sensitive fields when the user actually typed something.
      if (!payload.aadharNo) delete payload.aadharNo;
      if (!payload.accountNo) delete payload.accountNo;
      if (!payload.ifsc) delete payload.ifsc;

      if (editing) {
        await endpoints.employees.update(editing.id, payload);
        toast.success('Employee updated', form.name);
      } else {
        const { data } = await endpoints.employees.create(payload);
        toast.success('Employee registered', `${data.employee.name} — ID ${data.employee.employeeId}`);
      }
      setModalOpen(false);
      list.reload();
    } catch (err) {
      toast.apiError(err, 'Could not save the employee');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async () => {
    if (!statusTarget) return;
    const next = statusTarget.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await endpoints.employees.setStatus(statusTarget.id, {
        status: next,
        reason: next === 'Inactive' ? 'Left the company' : '',
        effectiveDate: todayIso(),
      });
      toast.success(
        next === 'Inactive' ? 'Marked inactive' : 'Reactivated',
        next === 'Inactive'
          ? 'Removed from all live screens. The full history is preserved.'
          : `${statusTarget.name} is active again.`
      );
      setStatusTarget(null);
      list.reload();
    } catch (err) {
      toast.apiError(err, 'Could not change status');
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Employees</h1>
          <div className="page-head__subtitle">
            Master data for the whole workforce · {list.data?.pagination?.total ?? 0} records
          </div>
        </div>
        <div className="page-head__actions">
          {can('canRegisterEmployee') ? (
            <>
              <Button onClick={() => navigate('/employees/import')} icon="📥">
                Bulk import
              </Button>
              <Button variant="primary" onClick={openCreate} icon="＋">
                Register employee
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="filters">
        <Field label="Status">
          <Select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive (left)</option>
            <option value="All">All</option>
          </Select>
        </Field>
        <Field label="Department">
          <Select
            value={filters.department}
            onChange={(e) => setFilters({ ...filters, department: e.target.value })}
          >
            <option value="">All departments</option>
            {departmentList.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select
            value={filters.employeeType}
            onChange={(e) => setFilters({ ...filters, employeeType: e.target.value })}
          >
            <option value="">All types</option>
            <option value="Permanent">Permanent</option>
            <option value="Contract">Contract</option>
          </Select>
        </Field>
        <Field label="Search" style={{ flex: 1, minWidth: 190 }}>
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Name, employee ID, mobile or designation"
          />
        </Field>
      </div>

      {filters.status === 'Inactive' ? (
        <div className="mb-2">
          <Alert tone="neutral" title="Inactive employees">
            These people have left. They are hidden from every live screen and never marked absent,
            but their complete history is preserved here and they can be reactivated at any time.
          </Alert>
        </div>
      ) : null}

      <Card flush>
        {list.loading && !list.data ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.data?.employees?.length ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee ID</th>
                    <th>Name</th>
                    <th>Designation</th>
                    <th>Department / Team</th>
                    <th>Type</th>
                    <th>Shift</th>
                    <th>Mobile</th>
                    <th>Joined</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.employees.map((e) => (
                    <tr key={e.id}>
                      <td className="mono table__strong">{e.employeeId}</td>
                      <td>
                        <div className="emp-cell">
                          <Avatar name={e.name} />
                          <div>
                            <div className="emp-cell__name">{e.name}</div>
                            {e.fathersName ? (
                              <div className="emp-cell__meta">S/o {e.fathersName}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>{e.designation || <span className="table__muted">—</span>}</td>
                      <td>
                        {e.department?.name || '—'}
                        {e.team?.name ? <div className="text-small text-muted">{e.team.name}</div> : null}
                        {e.department?.isHelperPool ? <Badge tone="orange">Helper pool</Badge> : null}
                      </td>
                      <td>
                        <Badge tone={e.employeeType === 'Contract' ? 'violet' : 'navy'}>
                          {e.employeeType}
                        </Badge>
                      </td>
                      <td>
                        {e.employeeType === 'Contract' ? (
                          <span className="table__muted">N/A</span>
                        ) : (
                          e.shiftCategory
                        )}
                      </td>
                      <td className="mono">{e.mobileNo || <span className="table__muted">—</span>}</td>
                      <td>{isoToDisplay(e.joiningDate)}</td>
                      <td>
                        <Badge tone={e.status === 'Active' ? 'green' : 'slate'} dot>
                          {e.status}
                        </Badge>
                      </td>
                      <td>
                        <div className="flex-gap">
                          <Button size="sm" onClick={() => navigate(`/employees/${e.id}`)}>
                            Profile
                          </Button>
                          {can('canEditEmployee') || can('canAssignDepartment') ? (
                            <Button size="sm" onClick={() => openEdit(e)}>
                              Edit
                            </Button>
                          ) : null}
                          {can('canChangeEmployeeStatus') ? (
                            <Button size="sm" onClick={() => setStatusTarget(e)}>
                              {e.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={list.data.pagination.page}
              pages={list.data.pagination.pages}
              total={list.data.pagination.total}
              onChange={(page) => setFilters({ ...filters, page })}
            />
          </>
        ) : (
          <EmptyState
            icon="👷"
            title="No employees found"
            text="Register your first employee, or adjust the filters above."
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="lg"
        title={editing ? `Edit ${editing.name}` : 'Register new employee'}
        subtitle={
          editing
            ? `Employee ID ${editing.employeeId} — the ID never changes`
            : 'The employee ID is generated automatically as YYMM + 3 digits from the joining month'
        }
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={saving}>
              {editing ? 'Save changes' : 'Register employee'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <h3 className="mb-1">Personal details</h3>
          <div className="grid grid--form">
            <Field label="Full name" required>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
            </Field>
            <Field label="Designation / post">
              <Input
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                placeholder="e.g. Welder, Cutting Operator"
              />
            </Field>
            <Field label="Father's name">
              <Input
                value={form.fathersName}
                onChange={(e) => setForm({ ...form, fathersName: e.target.value })}
              />
            </Field>
            <Field label="Mobile number" hint="10 digits, starting 6-9">
              <Input
                value={form.mobileNo}
                onChange={(e) => setForm({ ...form, mobileNo: e.target.value })}
                maxLength={10}
                inputMode="numeric"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Joining date" required>
              <Input
                type="date"
                value={form.joiningDate}
                onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                required
              />
            </Field>
          </div>

          <Field label="Address">
            <Textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
            />
          </Field>

          <h3 className="mb-1 mt-2">Employment</h3>
          <div className="grid grid--form">
            <Field label="Employee type" required>
              <Select
                value={form.employeeType}
                onChange={(e) => setForm({ ...form, employeeType: e.target.value })}
              >
                <option value="Permanent">Permanent</option>
                <option value="Contract">Contract</option>
              </Select>
            </Field>
            <Field
              label="Default shift"
              hint={
                form.employeeType === 'Contract'
                  ? 'Contract workers do not follow factory shifts'
                  : 'Can still be changed per day in the DPR'
              }
            >
              <Select
                value={form.shiftCategory}
                onChange={(e) => setForm({ ...form, shiftCategory: e.target.value })}
                disabled={form.employeeType === 'Contract'}
              >
                <option value="Day">Day shift</option>
                <option value="Night">Night shift</option>
              </Select>
            </Field>
            <Field label="Department" required>
              <Select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value, team: '' })}
                required
              >
                <option value="">Select department…</option>
                {departmentList.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            {selectedDepartment?.hasTeams ? (
              <Field label="Team">
                <Select value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}>
                  <option value="">No team</option>
                  {teams.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>

          <div className="mt-1">
            <Switch
              checked={form.requiresWorkQty}
              onChange={(e) => setForm({ ...form, requiresWorkQty: e.target.checked })}
              label="Work description & quantity expected in the DPR"
            />
            <div className="field__hint mt-1">
              Turn this off for support roles such as guards, cooks and sweepers — their DPR is then
              never treated as incomplete for missing work details.
            </div>
          </div>

          <h3 className="mb-1 mt-2">Bank &amp; identity</h3>
          <div className="mb-2">
            <Alert tone="neutral">
              Aadhar and bank account numbers are encrypted in the database and shown masked unless a
              user has been granted permission to view them.
            </Alert>
          </div>
          <div className="grid grid--form">
            <Field label="Aadhar number" hint="12 digits">
              <Input
                value={form.aadharNo}
                onChange={(e) => setForm({ ...form, aadharNo: e.target.value })}
                maxLength={12}
                inputMode="numeric"
                placeholder={editing ? 'Leave blank to keep unchanged' : ''}
              />
            </Field>
            <Field label="Bank name">
              <Input
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              />
            </Field>
            <Field label="Account number">
              <Input
                value={form.accountNo}
                onChange={(e) => setForm({ ...form, accountNo: e.target.value })}
                inputMode="numeric"
                placeholder={editing ? 'Leave blank to keep unchanged' : ''}
              />
            </Field>
            <Field label="IFSC code" hint="e.g. SBIN0001234">
              <Input
                value={form.ifsc}
                onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })}
                maxLength={11}
              />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={changeStatus}
        danger={statusTarget?.status === 'Active'}
        confirmLabel={statusTarget?.status === 'Active' ? 'Mark inactive' : 'Reactivate'}
        title={statusTarget?.status === 'Active' ? 'Mark employee inactive?' : 'Reactivate employee?'}
        message={
          statusTarget?.status === 'Active'
            ? `${statusTarget?.name} will disappear from DPR search, department lists and dashboards, and will never be marked absent again. Nothing is deleted — the full history stays available and they can be reactivated later.`
            : `${statusTarget?.name} will appear again on all live screens and will be included in attendance from today.`
        }
      />
    </>
  );
}
