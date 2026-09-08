import { endpoints } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Alert,
  Badge,
  Button,
  Card,
  ErrorState,
  KeyValue,
  Loading,
  Stat,
} from '../components/ui';
import { dateTimeDisplay, numberDisplay } from '../utils/format';

function uptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Admin-only view of application and database health. No credentials are ever shown. */
export default function SystemHealth() {
  const status = useApi(() => endpoints.system.status(), []);

  if (status.loading && !status.data) return <Loading text="Checking the system…" />;
  if (status.error) return <ErrorState error={status.error} onRetry={status.reload} />;

  const { application, database, records, email } = status.data;
  const dbOk = database.state === 'connected';

  return (
    <>
      <div className="page-head">
        <div className="page-head__text">
          <h1>System Health</h1>
          <div className="page-head__subtitle">Application, database and backup status</div>
        </div>
        <div className="page-head__actions">
          <Button onClick={status.reload} icon="↻">
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid--stats mb-3">
        <Stat
          label="Application"
          value={application.status === 'running' ? 'Running' : 'Degraded'}
          hint={`${application.environment} · Node ${application.nodeVersion}`}
          icon="🟢"
          tone="green"
        />
        <Stat
          label="Database"
          value={dbOk ? 'Connected' : 'Disconnected'}
          hint={database.database || '—'}
          icon={dbOk ? '💾' : '⚠️'}
          tone={dbOk ? 'green' : 'red'}
        />
        <Stat label="Uptime" value={uptime(application.uptimeSeconds)} hint="Since last restart" icon="⏳" tone="navy" />
        <Stat
          label="Memory in use"
          value={`${application.memoryMb} MB`}
          hint={`Host total ${numberDisplay(application.hostMemoryMb)} MB`}
          icon="📈"
          tone="blue"
        />
      </div>

      <div className="grid grid--2 mb-3">
        <Card title="Database" subtitle="Connection and backup information">
          <KeyValue
            items={[
              {
                key: 'Status',
                value: (
                  <Badge tone={dbOk ? 'green' : 'red'} dot>
                    {database.state}
                  </Badge>
                ),
              },
              { key: 'Database name', value: database.database },
              { key: 'Host', value: database.host },
              { key: 'Hosting', value: database.hosting },
              {
                key: 'Automatic backups',
                value: database.automaticBackups ? (
                  <Badge tone="green">Managed by Atlas</Badge>
                ) : (
                  <Badge tone="amber">Not detected</Badge>
                ),
              },
              { key: 'Data size', value: database.storage ? `${database.storage.dataSizeMb} MB` : 'Not available' },
              {
                key: 'Storage size',
                value: database.storage ? `${database.storage.storageSizeMb} MB` : 'Not available',
              },
              {
                key: 'Index size',
                value: database.storage ? `${database.storage.indexSizeMb} MB` : 'Not available',
              },
              { key: 'Collections', value: database.storage?.collections },
            ]}
          />
          <div className="mt-2">
            <Alert tone={database.automaticBackups ? 'success' : 'warning'}>{database.backupNote}</Alert>
          </div>
        </Card>

        <Card title="Records" subtitle="What the database currently holds">
          <KeyValue
            items={[
              { key: 'Employees', value: numberDisplay(records.employees) },
              { key: 'DPR entries', value: numberDisplay(records.dprEntries) },
              { key: 'Audit log entries', value: numberDisplay(records.auditLogs) },
              { key: 'Last DPR entry', value: dateTimeDisplay(records.lastDprEntryAt) },
              { key: 'Last audit entry', value: dateTimeDisplay(records.lastAuditAt) },
            ]}
          />

          <h3 className="mt-3 mb-1">Application</h3>
          <KeyValue
            items={[
              { key: 'Environment', value: application.environment },
              { key: 'Node version', value: application.nodeVersion },
              { key: 'Started at', value: dateTimeDisplay(application.startedAt) },
              {
                key: 'Email (password reset)',
                value: email.configured ? (
                  <Badge tone="green">Configured</Badge>
                ) : (
                  <Badge tone="amber">Not configured</Badge>
                ),
              },
            ]}
          />
          <div className="mt-2">
            <Alert tone="neutral">{email.note}</Alert>
          </div>
        </Card>
      </div>

      <Card title="Backup guidance" subtitle="Protecting the factory's data">
        <ul style={{ paddingLeft: 18, color: 'var(--slate-600)', lineHeight: 1.9, margin: 0 }}>
          <li>
            On MongoDB Atlas, snapshots are taken automatically. Check the schedule in the Atlas
            console under <strong>Backup</strong>, and confirm the retention period suits the client.
          </li>
          <li>
            For a self-managed server, schedule a nightly <span className="mono">mongodump</span> and
            copy the archive off the machine.
          </li>
          <li>
            Test a restore at least once before handover — a backup that has never been restored is
            not yet a backup.
          </li>
          <li>Historical data is never hard-deleted by the application: employees and departments are archived, not removed.</li>
        </ul>
      </Card>
    </>
  );
}
