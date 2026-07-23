import { useEffect, useState } from 'react';
import { listPendingApproval } from '../../api/request-platform';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';

export default function RequestsPendingPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPendingApproval>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await listPendingApproval());
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <h1>คำร้องรออนุมัติ</h1>
      <table>
        <thead>
          <tr><th>หัวข้อ</th><th>ผู้ขอ</th><th>สถานะ</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link to={`/requests/${r.id}`}>{r.title}</Link></td>
              <td>{r.requesterEmployee ? `${r.requesterEmployee.firstName}` : '—'}</td>
              <td><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="ไม่มีคำร้องรออนุมัติ" />}
    </div>
  );
}
