import { useEffect, useState } from 'react';
import { getRequestDashboard, listRequests, RequestListItem } from '../../api/request-platform';
import { useCompanyId } from '../../context/AuthContext';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';
import { Link } from 'react-router-dom';

export default function RequestsListPage() {
  const companyId = useCompanyId();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<RequestListItem[]>([]);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getRequestDashboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      const [list, dash] = await Promise.all([
        listRequests({ companyId, status: status || undefined }),
        getRequestDashboard(companyId),
      ]);
      setRows(list);
      setDashboard(dash);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId, status]);

  if (!companyId) return <EmptyState title="เลือกบริษัท" />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>ศูนย์คำร้อง</h1>
        <div className="toolbar">
          <Link to="/requests/pending" className="button-link">รออนุมัติของฉัน</Link>
          <Link to="/admin/request-types" className="button-link">จัดการประเภทคำร้อง</Link>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ทุกสถานะ</option>
            <option value="draft">แบบร่าง</option>
            <option value="in_review">รออนุมัติ</option>
            <option value="approved">อนุมัติแล้ว</option>
            <option value="rejected">ไม่อนุมัติ</option>
            <option value="cancelled">ยกเลิก</option>
          </select>
          <button type="button" onClick={load}>รีเฟรช</button>
        </div>
      </div>

      {dashboard && (
        <div className="stats-grid" style={{ marginBottom: '1rem' }}>
          <div className="stat-card"><strong>{dashboard.submittedToday}</strong><span>ส่งวันนี้</span></div>
          <div className="stat-card"><strong>{dashboard.pendingApproval}</strong><span>รออนุมัติ</span></div>
          <div className="stat-card"><strong>{dashboard.overdue}</strong><span>เกินกำหนด</span></div>
          <div className="stat-card"><strong>{dashboard.myPendingApprovals}</strong><span>รอฉันอนุมัติ</span></div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>หัวข้อ</th>
            <th>ผู้ขอ</th>
            <th>สถานะ</th>
            <th>ส่งเมื่อ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link to={`/requests/${r.id}`}>{r.title}</Link></td>
              <td>{r.requesterEmployee ? `${r.requesterEmployee.firstName} ${r.requesterEmployee.lastName}` : '—'}</td>
              <td><StatusBadge status={r.status} /></td>
              <td>{r.submittedAt ? new Date(r.submittedAt).toLocaleString('th-TH') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="ไม่มีคำร้อง" />}
    </div>
  );
}
