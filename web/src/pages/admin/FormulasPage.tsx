import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listFormulas, testFormula } from '../../api/phase2-hr-os';
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

export default function FormulasPage() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [testResult, setTestResult] = useState<string>('');

  async function load() {
    setLoading(true);
    try {
      setRows(await listFormulas(companyId ?? undefined));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [companyId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <Link to="/settings">← ตั้งค่า</Link>
          <h1>สูตรคำนวณ</h1>
        </div>
      </div>
      <p className="muted">ตั้งสูตรคำนวณเงินเดือน หักเงิน และโบนัส</p>
      {testResult && <p className="hint">{testResult}</p>}
      <table>
        <thead>
          <tr><th>คีย์</th><th>ชื่อ</th><th>หมวด</th><th>สถานะ</th><th>นิพจน์</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              <td>{String(r.key)}</td>
              <td>{String(r.name)}</td>
              <td>{String(r.domain ?? '—')}</td>
              <td><StatusBadge status={STATUS_LABELS[String(r.configStatus ?? 'draft')] ?? String(r.configStatus ?? 'draft')} /></td>
              <td><code>{String(r.expression ?? '').slice(0, 60)}</code></td>
              <td>
                <button type="button" onClick={async () => {
                  const res = await testFormula(String(r.id), { baseSalary: 30000, allowance: 2000, commission: 1000, leaveDays: 5 });
                  setTestResult(res.error ? `ข้อผิดพลาด: ${res.error}` : `ผลลัพธ์: ${res.result}`);
                }}>ทดสอบ</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="ไม่มีสูตร" />}
    </div>
  );
}
