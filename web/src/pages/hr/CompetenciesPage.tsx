import { useEffect, useState } from 'react';
import { listCompetencies } from '../../api/phase2-hr-os';
import { useCompanyId } from '../../context/AuthContext';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { Link } from 'react-router-dom';

export default function CompetenciesPage() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setLoading(true);
    listCompetencies(companyId ?? undefined)
      .then(setRows)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <Link to="/settings">← ตั้งค่า</Link>
          <h1>ทักษะและสมรรถนะ</h1>
        </div>
      </div>
      <table>
        <thead><tr><th>ชื่อ</th><th>หมวด</th><th>สถานะ</th><th>ระดับ</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              <td>{String(r.name)}</td>
              <td>{String(r.category ?? '—')}</td>
              <td>{String(r.status)}</td>
              <td>{Array.isArray(r.levels) ? r.levels.length : 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="ยังไม่มีข้อมูลทักษะ" />}
    </div>
  );
}
