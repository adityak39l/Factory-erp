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
} from '../components/ui';
import { isoToDisplay, todayIso, yearOptions } from '../utils/format';

const TYPES = ['Festival', 'Weekly Off', 'Maintenance', 'Other'];
const TYPE_TONES = { Festival: 'violet', 'Weekly Off': 'blue', Maintenance: 'amber', Other: 'slate' };

export default function Holidays() {
  const toast = useToast();
  const { can } = useAuth();

  const [year, setYear] = useState(new Date().getFullYear());
  const holidays = useApi(() => endpoints.masters.holidays({ year }), [year]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), description: '', type: 'Festival' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const manage = can('canManageMasters');
  const list = holidays.data?.holidays || [];

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await endpoints.masters.createHoliday(form);
      toast.success('Holiday declared', `${isoToDisplay(form.date)} — ${form.description}`);
      setModalOpen(false);
      setForm({ date: todayIso(), description: '', type: 'Festival' });
      holidays.reload();
    } catch (err) {
      toast.apiError(err, 'Could not declare the holiday');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await endpoints.masters.deleteHoliday(deleteTarget._id);
      toast.success('Holiday removed');
      setDeleteTarget(null);
      holidays.reload();
    } catch (err) {
      toast.apiError(err, 'Could not remove the holiday');
      setDeleteTarget(null);
    }
  };

  const upcoming = list.filter((h) => h.date >= todayIso());

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Holiday Calendar</h1>
          <div className="page-head__subtitle">
            DPR entry is blocked on these dates and nobody is marked absent
          </div>
        </div>
        <div className="page-head__actions">
          <Field style={{ marginBottom: 0 }}>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions(6).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          {manage ? (
            <Button variant="primary" onClick={() => setModalOpen(true)} icon="＋">
              Declare holiday
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-3">
        <Alert tone="neutral" title="Weekly offs">
          Recurring weekly offs (for example every Sunday) are configured once in{' '}
          <strong>System Settings → Attendance</strong>. Use this screen for festivals, shutdowns and
          one-off closures.
        </Alert>
      </div>

      {upcoming.length ? (
        <Card title={`Upcoming (${upcoming.length})`} className="mb-3">
          <div className="flex-gap">
            {upcoming.slice(0, 8).map((h) => (
              <div key={h._id} className="summary-chip">
                <strong>{isoToDisplay(h.date)}</strong>
                <span className="text-muted">{h.description}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card flush>
        {holidays.loading && !holidays.data ? (
          <Loading />
        ) : holidays.error ? (
          <ErrorState error={holidays.error} onRetry={holidays.reload} />
        ) : list.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((h) => (
                  <tr key={h._id}>
                    <td className="table__strong">{isoToDisplay(h.date)}</td>
                    <td>
                      {new Date(`${h.date}T00:00:00Z`).toLocaleDateString('en-IN', {
                        weekday: 'long',
                        timeZone: 'UTC',
                      })}
                    </td>
                    <td>{h.description}</td>
                    <td>
                      <Badge tone={TYPE_TONES[h.type] || 'slate'}>{h.type}</Badge>
                    </td>
                    <td>
                      {manage ? (
                        <Button size="sm" variant="danger" onClick={() => setDeleteTarget(h)}>
                          Remove
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="📅"
            title={`No holidays declared for ${year}`}
            text="Declare festivals and shutdown days in advance so DPR entry is blocked on those dates."
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Declare a holiday"
        subtitle="DPR entry will be blocked on this date"
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Declare holiday
            </Button>
          </>
        }
      >
        <form onSubmit={save}>
          <Field label="Date" required>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </Field>
          <Field label="Description" required>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Diwali"
              required
            />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Alert tone="warning">
            A date that already has DPR entries cannot be turned into a holiday — remove those
            entries first.
          </Alert>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        danger
        confirmLabel="Remove holiday"
        title="Remove this holiday?"
        message={`${isoToDisplay(deleteTarget?.date)} will become a normal working day again, and employees without a DPR entry on it will count as absent.`}
      />
    </>
  );
}
