import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';

interface IdentityRow {
  id: string;
  employeeId: string;
  telegramUserId: string;
  telegramUsername: string | null;
  status: string;
  linkedAt: string;
  lastSeenAt: string | null;
}

export default function TelegramIdentitiesPage() {
  const [rows, setRows] = useState<IdentityRow[]>([]);
  const [status, setStatus] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await apiGet<IdentityRow[]>('/security/telegram-identities', { status, search }));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <Link to="/settings">← Settings</Link>
          <h1>Telegram Identities</h1>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="REVOKED">Revoked</option>
          </select>
        </label>
        <label>
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="button" onClick={load}>Search</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Telegram</th>
            <th>Status</th>
            <th>Linked</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><Link to={`/hr/employees/${row.employeeId}`}>{row.employeeId.slice(0, 8)}…</Link></td>
              <td>{row.telegramUsername ?? row.telegramUserId}</td>
              <td>{row.status}</td>
              <td>{new Date(row.linkedAt).toLocaleString()}</td>
              <td>{row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
