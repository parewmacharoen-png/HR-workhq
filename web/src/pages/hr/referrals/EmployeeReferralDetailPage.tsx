import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { approveReferralBonus, getEmployeeReferral, markReferralPaid } from '../../../api/request-platform';
import { apiPost } from '../../../api/client';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { StatusBadge } from '../../../components/StatusBadge';

export default function EmployeeReferralDetailPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [employeeId, setEmployeeId] = useState('');

  async function load() {
    setLoading(true);
    try {
      setData(await getEmployeeReferral(id));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="card">
      <h1>{String(data.candidateName)}</h1>
      <p>สถานะ: <StatusBadge status={String(data.status)} /></p>
      <p>โทร: {String(data.candidatePhone)}</p>
      <p>ตำแหน่ง: {String(data.targetPosition ?? '—')}</p>

      <div className="toolbar">
        <button type="button" onClick={async () => { await apiPost(`/employee-referrals/${id}/mark-hired`, {}); load(); }}>
          บันทึกจ้างแล้ว
        </button>
        <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Employee UUID" />
        <button type="button" onClick={async () => {
          await apiPost(`/employee-referrals/${id}/link-employee`, { referredEmployeeId: employeeId });
          load();
        }}>เชื่อมพนักงาน</button>
        {data.status === 'bonus_eligible' && (
          <button type="button" onClick={async () => { await approveReferralBonus(id); load(); }}>อนุมัติโบนัส</button>
        )}
        {data.status === 'bonus_approved' && (
          <button type="button" onClick={async () => { await markReferralPaid(id); load(); }}>บันทึกจ่ายแล้ว</button>
        )}
      </div>
    </div>
  );
}
