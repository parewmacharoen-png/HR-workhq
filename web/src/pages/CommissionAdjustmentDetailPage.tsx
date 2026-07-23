import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api';

interface AuditEntry {
  id: string;
  action: string;
  userId: string;
  beforeStatus: string | null;
  afterStatus: string;
  createdAt: string;
}

interface Entry {
  id: string;
  employeeId: string;
  originalAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  payrollItemId: string | null;
}

interface AdjustmentDetail {
  id: string;
  companyId: string;
  earnCycleId: string;
  commissionCycleId: string;
  type: string;
  employeeId: string;
  reason: string;
  adjustmentAmount: number;
  direction: string;
  status: string;
  audits: AuditEntry[];
  entry: Entry | null;
}

export default function CommissionAdjustmentDetailPage() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<AdjustmentDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setDetail(await apiGet<AdjustmentDetail>(`/commission/adjustments/${id}`));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function runAction(action: 'submit' | 'approve' | 'reject') {
    setBusy(true);
    setMessage('');
    try {
      const result = await apiPost(`/commission/adjustments/${id}/${action}`, action === 'reject' ? { reason: 'Rejected from web' } : {});
      setMessage(`${action} completed: ${JSON.stringify(result)}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  if (!detail) return <div className="card"><p>Loading…</p>{error && <p className="error">{error}</p>}</div>;

  return (
    <div className="card">
      <p><Link to="/commission/adjustments">← All adjustments</Link></p>
      <h1>Commission Adjustment</h1>
      <p>Status: <strong>{detail.status}</strong> · Type: {detail.type}</p>
      <p>Employee: {detail.employeeId}</p>
      <p>Reason: {detail.reason}</p>
      <p>
        {detail.direction} {detail.adjustmentAmount.toLocaleString()} THB
      </p>

      <div className="toolbar">
        {detail.status === 'draft' && (
          <button type="button" disabled={busy} onClick={() => runAction('submit')}>Submit</button>
        )}
        {detail.status === 'submitted' && (
          <>
            <button type="button" disabled={busy} onClick={() => runAction('approve')}>Approve</button>
            <button type="button" disabled={busy} onClick={() => runAction('reject')}>Reject</button>
          </>
        )}
      </div>

      {message && <p>{message}</p>}
      {error && <p className="error">{error}</p>}

      {detail.entry && (
        <section>
          <h2>Employee impact</h2>
          <p>Original: {detail.entry.originalAmount.toLocaleString()}</p>
          <p>Adjustment: {detail.entry.adjustmentAmount.toLocaleString()}</p>
          <p>Net payable: {detail.entry.netAmount.toLocaleString()}</p>
          {detail.entry.payrollItemId && <p>Payroll item: {detail.entry.payrollItemId.slice(0, 8)}</p>}
        </section>
      )}

      <section>
        <h2>Audit history</h2>
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>User</th>
              <th>From</th>
              <th>To</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {detail.audits.map((audit) => (
              <tr key={audit.id}>
                <td>{audit.action}</td>
                <td>{audit.userId.slice(0, 8)}</td>
                <td>{audit.beforeStatus ?? '—'}</td>
                <td>{audit.afterStatus}</td>
                <td>{new Date(audit.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
