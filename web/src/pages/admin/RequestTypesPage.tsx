import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listRequestTypes, publishRequestType } from '../../api/request-platform';
import { useCompanyId } from '../../context/AuthContext';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';

export default function RequestTypesPage() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await listRequestTypes(companyId ?? undefined));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <Link to="/settings">← ตั้งค่า</Link>
          <h1>ประเภทคำร้อง</h1>
        </div>
        <button type="button" onClick={() => void load()}>รีเฟรช</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>ชื่อ</th>
            <th>หมวด</th>
            <th>สถานะ</th>
            <th>เวอร์ชัน</th>
            <th>Telegram</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              <td>{String(r.nameTh)} {r.isSystem ? '(ระบบ)' : ''}</td>
              <td>{String(r.category)}</td>
              <td><StatusBadge status={String(r.status)} /></td>
              <td>{String(r.versionNumber)}</td>
              <td>{r.activeInTelegram ? 'ใช้งาน' : '—'}</td>
              <td>
                {r.status === 'draft' && (
                  <button type="button" onClick={async () => { await publishRequestType(String(r.id)); load(); }}>
                    เผยแพร่
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="ไม่มีประเภทคำร้อง" />}
    </div>
  );
}
