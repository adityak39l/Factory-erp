import { useState } from 'react';
import { endpoints } from '../api/client';
import { useApi, useDebounced } from '../hooks/useApi';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  Pagination,
  Select,
} from '../components/ui';
import { dateTimeDisplay } from '../utils/format';

const ACTION_TONES = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  LOGIN: 'slate',
  LOGIN_FAILED: 'red',
  PASSWORD_RESET: 'amber',
  PERMISSION_CHANGE: 'violet',
  STATUS_CHANGE: 'amber',
  LOCK_OVERRIDE: 'orange',
  BULK_IMPORT: 'navy',
  EXPORT: 'slate',
};

/** The accountability trail the old spreadsheet never had. Admin only. */
export default function AuditLog() {
  const [filters, setFilters] = useState({ action: '', entity: '', search: '', from: '', to: '', page: 1 });
  const search = useDebounced(filters.search, 350);
  const [detail, setDetail] = useState(null);

  const logs = useApi(
    () =>
      endpoints.audit.list({
        action: filters.action || undefined,
        entity: filters.entity || undefined,
        search: search || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        page: filters.page,
        limit: 50,
      }),
    [filters.action, filters.entity, search, filters.from, filters.to, filters.page]
  );
  const options = useApi(() => endpoints.audit.filters(), []);

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>Audit Log</h1>
          <div className="page-head__subtitle">
            Every create, update and delete — who did it, what changed and when
          </div>
        </div>
        <div className="page-head__actions">
          <Button onClick={logs.reload} icon="↻">
            Refresh
          </Button>
        </div>
      </div>

      <div className="filters">
        <Field label="Action">
          <Select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}
          >
            <option value="">All actions</option>
            {(options.data?.actions || []).map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Entity">
          <Select
            value={filters.entity}
            onChange={(e) => setFilters({ ...filters, entity: e.target.value, page: 1 })}
          >
            <option value="">All entities</option>
            {(options.data?.entities || []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })}
          />
        </Field>
        <Field label="To">
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })}
          />
        </Field>
        <Field label="Search" style={{ flex: 1, minWidth: 180 }}>
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
            placeholder="Record, user or note"
          />
        </Field>
      </div>

      <Card flush>
        {logs.loading && !logs.data ? (
          <Loading />
        ) : logs.error ? (
          <ErrorState error={logs.error} onRetry={logs.reload} />
        ) : logs.data?.logs?.length ? (
          <>
            <div className="table-wrap">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Record</th>
                    <th>Note</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {logs.data.logs.map((log) => (
                    <tr key={log._id}>
                      <td className="text-small">{dateTimeDisplay(log.createdAt)}</td>
                      <td>
                        <div className="table__strong">{log.userName}</div>
                        {log.userRole ? <div className="emp-cell__meta">{log.userRole}</div> : null}
                      </td>
                      <td>
                        <Badge tone={ACTION_TONES[log.action] || 'slate'}>{log.action.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td>{log.entity}</td>
                      <td className="text-small">{log.entityLabel || '—'}</td>
                      <td className="text-small text-muted">{log.note || '—'}</td>
                      <td>
                        {log.before || log.after ? (
                          <Button size="sm" onClick={() => setDetail(log)}>
                            Details
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={logs.data.pagination.page}
              pages={logs.data.pagination.pages}
              total={logs.data.pagination.total}
              onChange={(page) => setFilters({ ...filters, page })}
            />
          </>
        ) : (
          <EmptyState icon="🧾" title="No audit entries" text="Nothing matches these filters." />
        )}
      </Card>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        size="lg"
        title={`${detail?.action?.replace(/_/g, ' ')} — ${detail?.entity}`}
        subtitle={`${detail?.userName} · ${dateTimeDisplay(detail?.createdAt)}`}
        footer={<Button onClick={() => setDetail(null)}>Close</Button>}
      >
        {detail?.entityLabel ? (
          <div className="mb-2">
            <div className="field__label">Record</div>
            <div>{detail.entityLabel}</div>
          </div>
        ) : null}
        <div className="grid grid--2">
          <div>
            <div className="field__label mb-1">Before</div>
            <pre
              className="mono"
              style={{
                background: 'var(--surface-muted)',
                padding: 12,
                borderRadius: 8,
                overflowX: 'auto',
                margin: 0,
                border: '1px solid var(--border)',
              }}
            >
              {detail?.before ? JSON.stringify(detail.before, null, 2) : '—'}
            </pre>
          </div>
          <div>
            <div className="field__label mb-1">After</div>
            <pre
              className="mono"
              style={{
                background: 'var(--surface-muted)',
                padding: 12,
                borderRadius: 8,
                overflowX: 'auto',
                margin: 0,
                border: '1px solid var(--border)',
              }}
            >
              {detail?.after ? JSON.stringify(detail.after, null, 2) : '—'}
            </pre>
          </div>
        </div>
      </Modal>
    </>
  );
}
