import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';

interface RegistrationRow {
  id: string;
  employeeId: string | null;
  employeeGlobalId: string | null;
  employeeName: string | null;
  telegramUserId: string;
  telegramUsername: string | null;
  requestStatus: string;
  submittedEmployeeCode: string | null;
  submittedPhone: string | null;
  createdAt: string;
}

export default function PendingRegistrationsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const canWrite = can('security:write');

  async function load() {
    setLoading(true);
    try {
      setRows(await apiGet<RegistrationRow[]>('/security/registrations', { status: 'PENDING' }));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function approve(id: string, employeeId?: string | null) {
    await apiPost(`/security/registrations/${id}/approve`, { employeeId: employeeId ?? undefined });
    await load();
  }

  async function reject(id: string) {
    const reason = window.prompt('Rejection reason') ?? 'Rejected by HR';
    await apiPost(`/security/registrations/${id}/reject`, { reason });
    await load();
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <Link to="/settings">← Settings</Link>
          <h1>Pending Telegram Registrations</h1>
        </div>
        <button type="button" onClick={load}>Refresh</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Telegram</th>
            <th>Submitted</th>
            <th>Created</th>
            {canWrite && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.employeeName ?? row.submittedEmployeeCode ?? '—'}</td>
              <td>{row.telegramUsername ?? row.telegramUserId}</td>
              <td>{row.submittedEmployeeCode} / {row.submittedPhone ?? '—'}</td>
              <td>{new Date(row.createdAt).toLocaleString()}</td>
              {canWrite && (
                <td>
                  <button type="button" onClick={() => approve(row.id, row.employeeId ?? undefined)}>Approve</button>
                  {' '}
                  <button type="button" onClick={() => reject(row.id)}>Reject</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
