import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { WorkHQButton, WorkHQCard } from '../../components/ui';

interface OpsHealth {
  db: { ok: boolean };
  migrations: { ok: boolean; note?: string };
  redis: { ok: boolean };
  storage: { ok: boolean; driver: string };
  telegram: { configured: boolean };
  failedDocumentJobs: number;
  pendingOutboxEvents: number;
  dataExchange?: {
    exportsToday: number;
    failedExports: number;
    pendingImports: number;
    importValidationFailures: number;
    scheduledExportsEnabled: number;
    googleSheetsConfigured: boolean;
  };
  checkedAt: string;
}

export default function OpsConsolePage() {
  const [health, setHealth] = useState<OpsHealth | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      setHealth(await apiGet<OpsHealth>('/ops/health'));
      setMsg('');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function action(path: string) {
    await apiPost(`/ops/actions/${path}`, {});
    setMsg(`Ran ${path}`);
    await load();
  }

  return (
    <div className="whq-page">
      <h1 className="whq-page-title">⚙️ Operations Console</h1>
      <p className="whq-muted">Owner only — production support · <a href="/ops/health">Operational Health</a> · <a href="/ops/exports">Exports</a> · <a href="/ops/imports">Imports</a> · <a href="/ops/scheduled-exports">Scheduled</a></p>
      {msg && <p>{msg}</p>}
      {health && (
        <WorkHQCard title="Health" className="whq-detail-card">
          <ul>
            <li>DB: {health.db.ok ? 'OK' : 'FAIL'}</li>
            <li>Migrations: {health.migrations.ok ? 'OK' : health.migrations.note}</li>
            <li>Redis: {health.redis.ok ? 'OK' : 'FAIL'}</li>
            <li>Storage ({health.storage.driver}): {health.storage.ok ? 'OK' : 'FAIL'}</li>
            <li>Telegram: {health.telegram.configured ? 'configured' : 'missing token'}</li>
            <li>Failed doc jobs: {health.failedDocumentJobs}</li>
            <li>Pending outbox: {health.pendingOutboxEvents}</li>
            {health.dataExchange && (
              <>
                <li>Exports today: {health.dataExchange.exportsToday}</li>
                <li>Failed exports: {health.dataExchange.failedExports}</li>
                <li>Pending imports: {health.dataExchange.pendingImports}</li>
                <li>Import validation failures: {health.dataExchange.importValidationFailures}</li>
                <li>Scheduled exports enabled: {health.dataExchange.scheduledExportsEnabled}</li>
                <li>Google Sheets API: {health.dataExchange.googleSheetsConfigured ? 'configured' : 'missing credentials'}</li>
              </>
            )}
          </ul>
          <p className="whq-muted">Checked {new Date(health.checkedAt).toLocaleString('th-TH')}</p>
        </WorkHQCard>
      )}
      <WorkHQCard title="Actions" className="whq-detail-card">
        <WorkHQButton onClick={() => action('retry-outbox')}>Retry outbox</WorkHQButton>
        {' '}
        <WorkHQButton onClick={() => action('rerun-announcement-reminders')}>Rerun announcement reminders</WorkHQButton>
      </WorkHQCard>
    </div>
  );
}
