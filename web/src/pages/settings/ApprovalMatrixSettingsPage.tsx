import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchApprovalMatrices,
  updateApprovalMatrix,
  type ApprovalMatrix,
} from '../../api/approval';
import { useAuth } from '../../context/AuthContext';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';

const STRATEGY_LABELS: Record<string, string> = {
  direct_manager: 'หัวหน้าโดยตรง',
  big_leader: 'หัวหน้าทีมใหญ่',
  owner: 'เจ้าของ',
  secretary: 'เลขา',
  any_owner: 'เจ้าของคนใดก็ได้',
  fixed_user: 'ผู้ใช้ที่กำหนด',
  fixed_role: 'บทบาทที่กำหนด',
  workflow_override: 'แทนที่ด้วยเวิร์กโฟลว์',
};

export default function ApprovalMatrixSettingsPage() {
  const { can } = useAuth();
  const canWrite = can('settings:write');
  const [rows, setRows] = useState<ApprovalMatrix[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await fetchApprovalMatrices());
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveRow(row: ApprovalMatrix, e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setSavingId(row.id);
    try {
      await updateApprovalMatrix(row.id, {
        name: row.name,
        minApprovalCount: row.minApprovalCount,
        steps: row.steps,
      });
      await load();
    } finally {
      setSavingId(null);
    }
  }

  function updateStepCount(rowId: string, count: number) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, minApprovalCount: count } : r)));
  }

  if (loading) return <LoadingState label="กำลังโหลดเมทริกซ์อนุมัติ…" />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="hr-page-card">
      <div className="page-header">
        <div>
          <Link to="/settings">← ตั้งค่า</Link>
          <h1>เมทริกซ์การอนุมัติ</h1>
          <p className="muted">กำหนดผู้อนุมัติแต่ละประเภทคำขอ — ทุกการเปลี่ยนแปลงมีประวัติบันทึก</p>
        </div>
      </div>

      <div className="approval-matrix-grid">
        {rows.map((row) => (
          <form key={row.id} className="approval-matrix-card" onSubmit={(e) => void saveRow(row, e)}>
            <div className="approval-matrix-card-header">
              <h2>{row.name}</h2>
              <span className="muted">{row.workflowType}</span>
            </div>
            <label>
              จำนวนการอนุมัติขั้นต่ำ
              <input
                type="number"
                min={1}
                value={row.minApprovalCount}
                disabled={!canWrite}
                onChange={(e) => updateStepCount(row.id, Number(e.target.value))}
              />
            </label>
            <div className="approval-matrix-steps">
              <strong>ผู้อนุมัติ</strong>
              {row.steps.map((step) => (
                <div key={step.stepOrder} className="approval-matrix-step">
                  <span>{step.stepOrder}. {step.label}</span>
                  <span className="muted">{STRATEGY_LABELS[step.approverStrategy] ?? step.approverStrategy}</span>
                </div>
              ))}
            </div>
            {canWrite && (
              <button type="submit" disabled={savingId === row.id}>
                {savingId === row.id ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            )}
          </form>
        ))}
      </div>
    </div>
  );
}
