import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listWorkflows, publishWorkflow } from '../../api/phase2-hr-os';
import { useCompanyId } from '../../context/AuthContext';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { StatusBadge } from '../../components/StatusBadge';

const STATUS_LABELS: Record<string, string> = {
  draft: 'ร่าง',
  published: 'เผยแพร่แล้ว',
  archived: 'เก็บถาวร',
};

const CATEGORY_LABELS: Record<string, string> = {
  hr: 'ทรัพยากรบุคคล',
  leave: 'การลา',
  general: 'ทั่วไป',
};

export default function WorkflowsPage() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await listWorkflows(companyId ?? undefined, status || undefined, category || undefined));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [companyId, status, category]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <Link to="/settings">← ตั้งค่า</Link>
          <h1>เวิร์กโฟลว์</h1>
        </div>
        <div className="filters">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ทุกสถานะ</option>
            <option value="draft">ร่าง</option>
            <option value="published">เผยแพร่แล้ว</option>
            <option value="archived">เก็บถาวร</option>
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">ทุกหมวด</option>
            <option value="hr">ทรัพยากรบุคคล</option>
            <option value="leave">การลา</option>
            <option value="general">ทั่วไป</option>
          </select>
          <button type="button" onClick={() => void load()}>รีเฟรช</button>
        </div>
      </div>
      <p className="muted">สร้างและจัดการขั้นตอนอนุมัติคำขอในระบบ</p>
      <table>
        <thead>
          <tr><th>ชื่อ</th><th>หมวด</th><th>สถานะ</th><th>เวอร์ชัน</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              <td>{String(r.nameTh)}</td>
              <td>{CATEGORY_LABELS[String(r.category)] ?? String(r.category)}</td>
              <td><StatusBadge status={STATUS_LABELS[String(r.status)] ?? String(r.status)} /></td>
              <td>{String(r.versionNumber ?? '—')}</td>
              <td>
                {r.status === 'draft' && (
                  <button type="button" onClick={async () => { await publishWorkflow(String(r.id)); void load(); }}>
                    เผยแพร่
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="ไม่มีเวิร์กโฟลว์" description="สร้างเวิร์กโฟลว์ใหม่จากแพลตฟอร์มคำขอ" />}
    </div>
  );
}
