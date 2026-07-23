import { useEffect, useState } from 'react';
import { qaReadiness } from '../../api/qa';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';

function statusColor(c: string): string {
  if (c === 'green' || c === 'complete') return '#16a34a';
  if (c === 'yellow' || c === 'partial' || c === 'conditional') return '#ca8a04';
  return '#dc2626';
}

export default function QaReadinessPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    qaReadiness()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  if (!data) return null;

  const health = (data.health as Record<string, string>) ?? {};
  const modules = (data.modules as Array<Record<string, unknown>>) ?? [];
  const blockers = (data.blockers as string[]) ?? [];

  return (
    <div className="card">
      <h1>QA Readiness Dashboard</h1>
      <p>
        Overall: <strong style={{ color: statusColor(String(data.goNoGo)) }}>{String(data.overallPercent)}%</strong>
        {' — '}
        Go/No-Go: <strong>{String(data.goNoGo)}</strong>
      </p>

      <h2>Health</h2>
      <div className="grid-stats">
        {Object.entries(health).map(([k, v]) => (
          <div key={k} className="stat">
            <span>{k}</span>
            <strong style={{ color: statusColor(String(v)) }}>{String(v)}</strong>
          </div>
        ))}
      </div>

      <h2>Blockers</h2>
      <ul>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>

      <h2>Modules ({modules.length})</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Module</th>
            <th>Status</th>
            <th>Risk</th>
            <th>Telegram</th>
            <th>Tests</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <tr key={String(m.key)}>
              <td>{String(m.name)}</td>
              <td style={{ color: statusColor(String(m.status)) }}>{String(m.status)}</td>
              <td>{String(m.risk)}</td>
              <td>{m.telegram ? '✓' : '—'}</td>
              <td>{String(m.tests)}</td>
              <td>{String(m.notes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
