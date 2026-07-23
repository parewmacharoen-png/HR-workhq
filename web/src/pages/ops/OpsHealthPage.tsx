import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { WorkHQCard } from '../../components/ui';

type Alert = { id: string; severity: 'critical' | 'warning' | 'info'; message: string };

interface OpsHealthResponse {
  db: { ok: boolean };
  migrations: { ok: boolean; note?: string };
  redis: { ok: boolean };
  storage: { ok: boolean; driver: string };
  telegram: { configured: boolean };
  schedulers: Record<string, boolean | string>;
  outbox: { ok: boolean; pending: number; stuck: number };
  formulaEngine: { ok: boolean; fallbackUsage24h: number };
  audit: { ok: boolean };
  queue: { ok: boolean };
  notificationEngine: { ok: boolean };
  monitoring: Record<string, number>;
  alerts: Alert[];
  overallStatus: 'healthy' | 'warning' | 'critical';
  checkedAt: string;
}

function statusColor(s: string): string {
  if (s === 'healthy' || s === 'ok') return '#16a34a';
  if (s === 'warning') return '#ca8a04';
  return '#dc2626';
}

export default function OpsHealthPage() {
  const [health, setHealth] = useState<OpsHealthResponse | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setHealth(await apiGet<OpsHealthResponse>('/ops/health'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const m = health?.monitoring ?? {};

  return (
    <div className="whq-page">
      <h1 className="whq-page-title">🏥 Operational Health</h1>
      <p className="whq-muted">
        Owner only — production monitoring · <Link to="/ops">Ops Console</Link>
      </p>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      {health && (
        <>
          <p>
            Overall:{' '}
            <strong style={{ color: statusColor(health.overallStatus) }}>
              {health.overallStatus.toUpperCase()}
            </strong>
            {' · '}
            Checked {new Date(health.checkedAt).toLocaleString('th-TH')}
          </p>

          {health.alerts.length > 0 && (
            <WorkHQCard title="Active Alerts" className="whq-detail-card">
              <ul>
                {health.alerts.map((a) => (
                  <li key={a.id} style={{ color: statusColor(a.severity === 'info' ? 'ok' : a.severity) }}>
                    [{a.severity}] {a.message}
                  </li>
                ))}
              </ul>
            </WorkHQCard>
          )}

          <WorkHQCard title="Infrastructure" className="whq-detail-card">
            <table className="data-table">
              <tbody>
                <tr><td>PostgreSQL</td><td style={{ color: statusColor('ok') }}>{health.db.ok ? 'OK' : 'FAIL'}</td></tr>
                <tr><td>Redis</td><td style={{ color: statusColor(health.redis.ok ? 'ok' : 'critical') }}>{health.redis.ok ? 'OK' : 'FAIL'}</td></tr>
                <tr><td>Storage ({health.storage.driver})</td><td style={{ color: statusColor(health.storage.ok ? 'ok' : 'critical') }}>{health.storage.ok ? 'OK' : 'FAIL'}</td></tr>
                <tr><td>Telegram Bot</td><td>{health.telegram.configured ? 'Configured' : 'Missing token'}</td></tr>
                <tr><td>Migrations</td><td>{health.migrations.ok ? 'OK' : health.migrations.note}</td></tr>
                <tr><td>Scheduler TZ</td><td>{String(health.schedulers.timezone ?? 'Asia/Bangkok')}</td></tr>
              </tbody>
            </table>
          </WorkHQCard>

          <WorkHQCard title="Monitoring (24h)" className="whq-detail-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Outbox backlog</td><td>{m.outboxBacklog ?? '—'}</td><td>{health.outbox.ok ? 'OK' : 'WARN'}</td></tr>
                <tr><td>Stuck outbox (≥3 attempts)</td><td>{m.outboxStuck ?? '—'}</td><td>{health.queue.ok ? 'OK' : 'FAIL'}</td></tr>
                <tr><td>Formula fallback usage</td><td>{m.formulaFallbackUsage24h ?? '—'}</td><td>{health.formulaEngine.ok ? 'OK' : 'WARN'}</td></tr>
                <tr><td>Failed approvals</td><td>{m.failedApprovals24h ?? '—'}</td><td>—</td></tr>
                <tr><td>Failed document generation</td><td>{m.failedDocumentGeneration ?? '—'}</td><td>{m.failedDocumentGeneration === 0 ? 'OK' : 'WARN'}</td></tr>
                <tr><td>AI generation failures</td><td>{m.aiGenerationFailures24h ?? '—'}</td><td>—</td></tr>
                <tr><td>Open payroll cycles</td><td>{m.payrollOpenCycles ?? '—'}</td><td>—</td></tr>
                <tr><td>Telegram delivery failures (proxy)</td><td>{m.telegramDeliveryFailures24h ?? '—'}</td><td>—</td></tr>
              </tbody>
            </table>
          </WorkHQCard>

          <WorkHQCard title="Schedulers" className="whq-detail-card">
            <ul>
              {Object.entries(health.schedulers)
                .filter(([k]) => k !== 'timezone')
                .map(([k, v]) => (
                  <li key={k}>{k}: {v ? '✓' : '—'}</li>
                ))}
            </ul>
          </WorkHQCard>
        </>
      )}
    </div>
  );
}
