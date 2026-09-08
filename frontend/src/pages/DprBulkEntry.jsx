import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { endpoints } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  Select,
  StatusBadge,
} from '../components/ui';
import { isoToLongDisplay, todayIso } from '../utils/format';

/**
 * Fast table-style entry for an operator handling 40-50 employees.
 * It writes through exactly the same engine as the single-entry screen, so the
 * independent per-field locking rules are identical — a locked field is refused
 * here too, and reported row by row.
 */
export default function DprBulkEntry() {
  const [params] = useSearchParams();
  const toast = useToast();

  const [date, setDate] = useState(params.get('date') || todayIso());
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const control = useApi(
    () => endpoints.dpr.controlCenter({ date, department: department || undefined }),
    [date, department]
  );
  const departments = useApi(() => endpoints.masters.departments(), []);

  useEffect(() => {
    setDraft({});
    setResult(null);
  }, [date, department]);

  const rows = useMemo(() => {
    let list = control.data?.rows || [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) => r.employee.name.toLowerCase().includes(q) || r.employee.employeeId.includes(q)
      );
    }
    return list;
  }, [control.data, search]);

  const isHoliday = control.data?.summary?.isHoliday;

  const setValue = (employeeId, key, value) =>
    setDraft((current) => ({ ...current, [employeeId]: { ...current[employeeId], [key]: value } }));

  const pendingCount = Object.values(draft).filter((row) =>
    Object.values(row || {}).some((v) => v !== '' && v !== undefined && v !== null)
  ).length;

  const saveAll = async () => {
    const entries = Object.entries(draft)
      .map(([employee, values]) => {
        const payload = { employee };
        if (values.inTime) payload.inTime = values.inTime;
        if (values.outTime) payload.outTime = values.outTime;
        if (values.workDescription) payload.workDescription = values.workDescription;
        if (values.qty !== undefined && values.qty !== '') payload.qty = Number(values.qty);
        if (values.shiftName) payload.shiftName = values.shiftName;
        return payload;
      })
      .filter((p) => Object.keys(p).length > 1);

    if (!entries.length) {
      toast.warning('Nothing to save', 'Fill at least one field before saving.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await endpoints.dpr.bulkSave({ date, entries });
      setResult(data);
      if (data.savedCount) toast.success(data.message);
      if (data.failedCount) toast.warning(`${data.failedCount} row(s) could not be saved`, 'See the notes below.');
      setDraft({});
      control.reload();
    } catch (err) {
      toast.apiError(err, 'Bulk save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Bulk DPR Entry</h1>
          <div className="page-head__subtitle">{isoToLongDisplay(date)}</div>
        </div>
        <div className="page-head__actions">
          <Button onClick={control.reload} icon="↻">
            Refresh
          </Button>
          <Button
            variant="accent"
            onClick={saveAll}
            loading={saving}
            disabled={!pendingCount || isHoliday}
            icon="💾"
          >
            Save {pendingCount ? `${pendingCount} row${pendingCount === 1 ? '' : 's'}` : 'entries'}
          </Button>
        </div>
      </div>

      <div className="mb-2">
        <Alert tone="neutral" title="Same locking rules apply here">
          Every field you fill is saved and locked individually. Fields that are already locked are
          shown as read-only and are never overwritten silently.
        </Alert>
      </div>

      {isHoliday ? (
        <div className="mb-2">
          <Alert tone="info" title={`Holiday — ${control.data.summary.holidayLabel}`}>
            DPR entry is blocked for this date.
          </Alert>
        </div>
      ) : null}

      <div className="filters">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Department">
          <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {(departments.data?.departments || []).map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Search" style={{ flex: 1, minWidth: 180 }}>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or employee ID" />
        </Field>
      </div>

      {result?.failed?.length ? (
        <Card title="Rows that were not saved" className="mb-2" flush>
          <table className="table table--compact">
            <tbody>
              {result.failed.map((f) => (
                <tr key={f.employee}>
                  <td className="table__strong">
                    {rows.find((r) => r.employee.id === f.employee)?.employee.name || f.employee}
                  </td>
                  <td style={{ color: 'var(--red-600)' }}>{f.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Card flush>
        {control.loading && !control.data ? (
          <Loading />
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="table table--compact">
              <thead>
                <tr>
                  <th style={{ minWidth: 190 }}>Employee</th>
                  <th>Department</th>
                  <th style={{ width: 108 }}>Shift</th>
                  <th style={{ width: 118 }}>IN</th>
                  <th style={{ width: 118 }}>OUT</th>
                  <th style={{ minWidth: 200 }}>Work done</th>
                  <th style={{ width: 92 }}>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ employee, entry, status }) => {
                  const locks = entry?.locks || {};
                  const values = draft[employee.id] || {};
                  return (
                    <tr key={employee.id}>
                      <td>
                        <div className="emp-cell__name">{employee.name}</div>
                        <div className="emp-cell__meta">
                          {employee.employeeId}
                          {employee.employeeType === 'Contract' ? ' · Contract' : ''}
                        </div>
                      </td>
                      <td className="text-small">
                        {entry?.workingDepartment || employee.department?.name}
                      </td>
                      <td>
                        {employee.employeeType === 'Contract' ? (
                          <span className="table__muted text-small">N/A</span>
                        ) : locks.outTime ? (
                          <span className="text-small">{entry.shiftName}</span>
                        ) : (
                          <Select
                            value={values.shiftName ?? entry?.shiftName ?? employee.shiftCategory ?? 'Day'}
                            onChange={(e) => setValue(employee.id, 'shiftName', e.target.value)}
                            style={{ height: 32, padding: '0 6px' }}
                          >
                            <option value="Day">Day</option>
                            <option value="Night">Night</option>
                          </Select>
                        )}
                      </td>
                      <td>
                        {locks.inTime ? (
                          <span className="mono" title="Locked">
                            🔒 {entry.inTime}
                          </span>
                        ) : (
                          <Input
                            type="time"
                            value={values.inTime ?? ''}
                            onChange={(e) => setValue(employee.id, 'inTime', e.target.value)}
                            style={{ height: 32 }}
                            disabled={isHoliday}
                          />
                        )}
                      </td>
                      <td>
                        {locks.outTime ? (
                          <span className="mono" title="Locked">
                            🔒 {entry.outTime}
                          </span>
                        ) : (
                          <Input
                            type="time"
                            value={values.outTime ?? ''}
                            onChange={(e) => setValue(employee.id, 'outTime', e.target.value)}
                            style={{ height: 32 }}
                            disabled={isHoliday || (!entry?.inTime && !values.inTime)}
                          />
                        )}
                      </td>
                      <td>
                        {locks.workQty ? (
                          <span className="text-small" title="Locked">
                            🔒 {entry.workDescription}
                          </span>
                        ) : employee.requiresWorkQty ? (
                          <Input
                            value={values.workDescription ?? ''}
                            onChange={(e) => setValue(employee.id, 'workDescription', e.target.value)}
                            placeholder="Work done"
                            style={{ height: 32 }}
                            disabled={isHoliday}
                          />
                        ) : (
                          <span className="table__muted text-small">Not applicable</span>
                        )}
                      </td>
                      <td>
                        {locks.workQty ? (
                          <span className="text-small">{entry.qty ?? '—'}</span>
                        ) : employee.requiresWorkQty ? (
                          <Input
                            type="number"
                            min="0"
                            value={values.qty ?? ''}
                            onChange={(e) => setValue(employee.id, 'qty', e.target.value)}
                            style={{ height: 32 }}
                            disabled={isHoliday}
                          />
                        ) : (
                          <span className="table__muted">—</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={status} />
                        {entry?.isCrossAssigned ? (
                          <>
                            {' '}
                            <Badge tone="orange">Helper</Badge>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="👷" title="No employees to show" text="Adjust the department filter or search." />
        )}
      </Card>
    </>
  );
}
