import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  EmptyState,
  Field,
  Input,
  Loading,
  Select,
  StatusBadge,
  Textarea,
} from '../components/ui';
import { hoursDisplay, isoToLongDisplay, todayIso } from '../utils/format';

/**
 * Progressive DPR entry.
 *
 * IN time, OUT time and Work + Quantity are three INDEPENDENT groups. Each one is
 * saved on its own and locks the instant it is saved — in any order, any number of
 * times through the day. A locked group can only be changed by an administrator or
 * an operator granted "edit locked DPR fields".
 */
export default function DprEntry() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const { can, isAdmin } = useAuth();

  const [date, setDate] = useState(params.get('date') || todayIso());
  const [employeeId, setEmployeeId] = useState(params.get('employee') || '');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 250);

  const [entry, setEntry] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [saving, setSaving] = useState('');

  const [inTime, setInTime] = useState('');
  const [outTime, setOutTime] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [qty, setQty] = useState('');
  const [qtyUnit, setQtyUnit] = useState('Nos');
  const [shiftName, setShiftName] = useState('Day');
  const [workingDepartment, setWorkingDepartment] = useState('');
  const [reason, setReason] = useState('');

  const search = useApi(() => endpoints.employees.search(debouncedQuery), [debouncedQuery]);
  const departments = useApi(() => endpoints.masters.departments(), []);

  const canOverride = can('canEditDpr');

  const loadEntry = useCallback(async () => {
    if (!employeeId) return;
    setLoadingEntry(true);
    try {
      const [{ data: entryData }, { data: employeeData }] = await Promise.all([
        endpoints.dpr.entry({ employee: employeeId, date }),
        endpoints.employees.get(employeeId),
      ]);

      setEntry(entryData.entry);
      setEmployee(employeeData.employee);

      const emp = employeeData.employee;
      const existing = entryData.entry;

      setInTime(existing?.inTime || '');
      setOutTime(existing?.outTime || '');
      setWorkDescription(existing?.workDescription || '');
      setQty(existing?.qty ?? '');
      setQtyUnit(existing?.qtyUnit || 'Nos');
      setShiftName(
        existing?.shiftName || (emp.employeeType === 'Contract' ? '' : emp.shiftCategory || 'Day')
      );
      setWorkingDepartment(existing?.workingDepartmentId || emp.department?._id || '');
      setReason('');
    } catch (err) {
      toast.apiError(err, 'Could not load this DPR entry');
    } finally {
      setLoadingEntry(false);
    }
  }, [employeeId, date, toast]);

  useEffect(() => {
    loadEntry();
  }, [loadEntry]);

  const selectEmployee = (id) => {
    setEmployeeId(id);
    setQuery('');
    setParams({ date, employee: id });
  };

  const isHelperPool = employee?.department?.isHelperPool;
  const isContract = employee?.employeeType === 'Contract';
  const requiresWorkQty = employee?.requiresWorkQty !== false;

  const locks = entry?.locks || { inTime: false, outTime: false, workQty: false };

  const save = async (group) => {
    const payload = { employee: employeeId, date };

    if (group === 'inTime') payload.inTime = inTime;
    if (group === 'outTime') payload.outTime = outTime;
    if (group === 'workQty') {
      payload.workDescription = workDescription;
      if (qty !== '') payload.qty = Number(qty);
      payload.qtyUnit = qtyUnit;
    }
    if (!isContract && shiftName) payload.shiftName = shiftName;
    if (isHelperPool && workingDepartment) payload.workingDepartment = workingDepartment;
    if (reason) payload.reason = reason;

    setSaving(group);
    try {
      const { data } = await endpoints.dpr.save(payload);
      setEntry(data.entry);
      if (data.overriddenGroups?.length) {
        toast.warning(
          'Locked field overridden',
          `${data.overriddenGroups.map((g) => LABELS[g] || g).join(', ')} — recorded in the change history and audit log.`
        );
      } else {
        toast.success('Saved and locked', LABELS[group]);
      }
      setReason('');
    } catch (err) {
      toast.apiError(err, 'Could not save');
    } finally {
      setSaving('');
    }
  };

  const groupState = (group, value, locked) => {
    if (locked) return 'locked';
    if (value) return 'ready';
    return 'pending';
  };

  const totals = useMemo(
    () => ({
      hours: entry?.totalHours,
      overtime: entry?.overtime,
      shortTime: entry?.shortTime,
    }),
    [entry]
  );

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>DPR Entry</h1>
          <div className="page-head__subtitle">
            Save whatever you have right now — each field locks on its own the moment it is saved.
          </div>
        </div>
        <div className="page-head__actions">
          <Field style={{ marginBottom: 0 }}>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setParams({ date: e.target.value, ...(employeeId ? { employee: employeeId } : {}) });
              }}
            />
          </Field>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(280px, 340px) 1fr', alignItems: 'start' }}>
        <Card title="Find employee" subtitle="Active employees only">
          <Field>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a name or employee ID…"
              autoFocus
            />
          </Field>

          {search.loading ? (
            <Loading text="Searching…" />
          ) : (
            <div style={{ maxHeight: 460, overflowY: 'auto', margin: '0 -6px' }}>
              {(search.data?.employees || []).map((e) => (
                <div
                  key={e.id}
                  className="search-results__item"
                  style={{
                    background: e.id === employeeId ? 'var(--navy-050)' : undefined,
                  }}
                  onClick={() => selectEmployee(e.id)}
                >
                  <Avatar name={e.name} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{e.name}</div>
                    <div className="text-small text-muted">
                      {e.employeeId} · {e.department?.name}
                    </div>
                  </div>
                </div>
              ))}
              {!search.loading && !(search.data?.employees || []).length ? (
                <div className="text-small text-muted" style={{ padding: 12 }}>
                  No active employees match that search.
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <div>
          {!employeeId ? (
            <Card>
              <EmptyState
                icon="👈"
                title="Select an employee to begin"
                text="Search by name or employee ID. Their department, type and shift are filled in automatically from the master data."
              />
            </Card>
          ) : loadingEntry ? (
            <Card>
              <Loading text="Loading entry…" />
            </Card>
          ) : (
            <>
              <Card className="mb-2">
                <div className="flex-between" style={{ flexWrap: 'wrap' }}>
                  <div className="emp-cell">
                    <Avatar name={employee?.name} orange />
                    <div>
                      <h2>{employee?.name}</h2>
                      <div className="text-small text-muted">
                        {employee?.employeeId} · {employee?.designation || 'No designation'} ·{' '}
                        {employee?.department?.name}
                        {employee?.team?.name ? ` / ${employee.team.name}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex-gap">
                    <Badge tone={isContract ? 'violet' : 'navy'}>{employee?.employeeType}</Badge>
                    {entry ? <StatusBadge status={entry.workingStatus} /> : <Badge tone="red">No entry yet</Badge>}
                  </div>
                </div>

                <div className="metric-row mt-2">
                  <div className="metric">
                    <div className="metric__label">Total hours</div>
                    <div className="metric__value">{hoursDisplay(totals.hours)}</div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Overtime</div>
                    <div className="metric__value">
                      {isContract ? <span className="text-muted" style={{ fontSize: 14 }}>Not applicable</span> : hoursDisplay(totals.overtime)}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Short time</div>
                    <div className="metric__value">
                      {isContract ? <span className="text-muted" style={{ fontSize: 14 }}>Not applicable</span> : hoursDisplay(totals.shortTime)}
                    </div>
                  </div>
                  <div className="metric">
                    <div className="metric__label">Date</div>
                    <div className="metric__value" style={{ fontSize: 14 }}>{isoToLongDisplay(date)}</div>
                  </div>
                </div>
              </Card>

              {isContract ? (
                <div className="mb-2">
                  <Alert tone="neutral" title="Contract worker">
                    Contract workers do not follow the factory shifts, so only total hours are
                    recorded — no overtime or short time is calculated.
                  </Alert>
                </div>
              ) : null}

              <Card title="Shift & department" className="mb-2">
                <div className="grid grid--form">
                  {!isContract ? (
                    <Field
                      label="Shift worked on this date"
                      hint={
                        locks.outTime && !canOverride
                          ? 'Locked — OUT time has been saved'
                          : 'Pre-filled from the employee’s default shift; change it if they worked the other shift today.'
                      }
                    >
                      <Select
                        value={shiftName}
                        onChange={(e) => setShiftName(e.target.value)}
                        disabled={locks.outTime && !canOverride}
                      >
                        <option value="Day">Day shift</option>
                        <option value="Night">Night shift</option>
                      </Select>
                    </Field>
                  ) : null}

                  {isHelperPool ? (
                    <Field
                      label="Working department today"
                      hint="Helper-pool employees can cover any department for a day."
                    >
                      <Select
                        value={workingDepartment}
                        onChange={(e) => setWorkingDepartment(e.target.value)}
                      >
                        {(departments.data?.departments || []).map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                </div>
              </Card>

              {canOverride && (locks.inTime || locks.outTime || locks.workQty) ? (
                <div className="mb-2">
                  <Field
                    label="Reason for changing a locked field"
                    hint="Stored in the entry’s history and in the audit log."
                  >
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Corrected from the gate register"
                    />
                  </Field>
                </div>
              ) : null}

              <div className="dpr-groups">
                <div className={`dpr-group dpr-group--${groupState('inTime', inTime, locks.inTime)}`}>
                  <div className="dpr-group__head">
                    <span className="dpr-group__title">IN time</span>
                    <span className="dpr-group__status">
                      {locks.inTime ? (
                        <Badge tone="navy">🔒 Locked</Badge>
                      ) : (
                        <Badge tone="amber">⏳ Pending</Badge>
                      )}
                    </span>
                  </div>

                  {locks.inTime && !canOverride ? (
                    <>
                      <div className="dpr-group__value">{entry.inTime}</div>
                      <div className="dpr-group__note">
                        Saved and locked. Only an administrator can change this.
                      </div>
                    </>
                  ) : (
                    <>
                      <Input
                        type="time"
                        value={inTime}
                        onChange={(e) => setInTime(e.target.value)}
                        className={locks.inTime ? 'input--locked' : ''}
                      />
                      <Button
                        variant="primary"
                        className="btn--block mt-1"
                        onClick={() => save('inTime')}
                        loading={saving === 'inTime'}
                        disabled={!inTime || inTime === entry?.inTime}
                      >
                        {locks.inTime ? 'Override IN time' : 'Save & lock IN time'}
                      </Button>
                    </>
                  )}
                </div>

                <div className={`dpr-group dpr-group--${groupState('outTime', outTime, locks.outTime)}`}>
                  <div className="dpr-group__head">
                    <span className="dpr-group__title">OUT time</span>
                    <span className="dpr-group__status">
                      {locks.outTime ? (
                        <Badge tone="navy">🔒 Locked</Badge>
                      ) : (
                        <Badge tone="amber">⏳ Pending</Badge>
                      )}
                    </span>
                  </div>

                  {locks.outTime && !canOverride ? (
                    <>
                      <div className="dpr-group__value">{entry.outTime}</div>
                      <div className="dpr-group__note">Saved and locked.</div>
                    </>
                  ) : (
                    <>
                      <Input
                        type="time"
                        value={outTime}
                        onChange={(e) => setOutTime(e.target.value)}
                        disabled={!entry?.inTime && !inTime}
                        className={locks.outTime ? 'input--locked' : ''}
                      />
                      <Button
                        variant="primary"
                        className="btn--block mt-1"
                        onClick={() => save('outTime')}
                        loading={saving === 'outTime'}
                        disabled={!outTime || outTime === entry?.outTime || !entry?.inTime}
                      >
                        {locks.outTime ? 'Override OUT time' : 'Save & lock OUT time'}
                      </Button>
                      {!entry?.inTime ? (
                        <div className="dpr-group__note">Record the IN time first.</div>
                      ) : null}
                    </>
                  )}
                </div>

                <div
                  className={`dpr-group dpr-group--${
                    requiresWorkQty ? groupState('workQty', workDescription, locks.workQty) : 'locked'
                  }`}
                >
                  <div className="dpr-group__head">
                    <span className="dpr-group__title">Work done &amp; quantity</span>
                    <span className="dpr-group__status">
                      {!requiresWorkQty ? (
                        <Badge tone="slate">Not applicable</Badge>
                      ) : locks.workQty ? (
                        <Badge tone="navy">🔒 Locked</Badge>
                      ) : (
                        <Badge tone="amber">⏳ Pending</Badge>
                      )}
                    </span>
                  </div>

                  {!requiresWorkQty ? (
                    <div className="dpr-group__note">
                      This role does not report work output, so the DPR is never treated as
                      incomplete for a missing description or quantity. You may still add a note.
                    </div>
                  ) : null}

                  {locks.workQty && !canOverride ? (
                    <>
                      <div style={{ fontWeight: 600 }}>{entry.workDescription}</div>
                      <div className="dpr-group__note">
                        {entry.qty !== null ? `${entry.qty} ${entry.qtyUnit}` : 'No quantity recorded'} · locked
                      </div>
                    </>
                  ) : (
                    <>
                      <Textarea
                        value={workDescription}
                        onChange={(e) => setWorkDescription(e.target.value)}
                        placeholder="e.g. NNJ pole connection plate"
                        rows={2}
                        style={{ minHeight: 60 }}
                      />
                      <div className="flex-gap mt-1">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          placeholder="Qty"
                          style={{ flex: 1 }}
                        />
                        <Input
                          value={qtyUnit}
                          onChange={(e) => setQtyUnit(e.target.value)}
                          placeholder="Unit"
                          style={{ width: 90 }}
                        />
                      </div>
                      <Button
                        variant="primary"
                        className="btn--block mt-1"
                        onClick={() => save('workQty')}
                        loading={saving === 'workQty'}
                        disabled={!workDescription}
                      >
                        {locks.workQty ? 'Override work details' : 'Save & lock work details'}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {entry?.editHistory?.length ? (
                <Card title="Change history" className="mt-2" flush>
                  <div className="table-wrap">
                    <table className="table table--compact">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>From</th>
                          <th>To</th>
                          <th>By</th>
                          <th>When</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.editHistory
                          .slice()
                          .reverse()
                          .map((h, i) => (
                            <tr key={i}>
                              <td className="table__strong">
                                {LABELS[h.fieldGroup] || h.fieldGroup}
                                {h.wasLocked ? (
                                  <>
                                    {' '}
                                    <Badge tone="amber">override</Badge>
                                  </>
                                ) : null}
                              </td>
                              <td className="mono">{formatHistoryValue(h.previousValue)}</td>
                              <td className="mono">{formatHistoryValue(h.newValue)}</td>
                              <td>{h.changedByName}</td>
                              <td className="text-small text-muted">
                                {new Date(h.changedAt).toLocaleString('en-IN')}
                              </td>
                              <td className="text-small">{h.reason || '—'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : null}

              {isAdmin && entry ? (
                <div className="mt-2 text-small text-muted">
                  Entered by {entry.enteredByName} · {new Date(entry.createdAt).toLocaleString('en-IN')}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const LABELS = {
  inTime: 'IN time',
  outTime: 'OUT time',
  workQty: 'Work description & quantity',
  shift: 'Shift',
};

function formatHistoryValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') {
    return `${value.workDescription || '—'}${value.qty !== null && value.qty !== undefined ? ` (${value.qty})` : ''}`;
  }
  return String(value);
}
