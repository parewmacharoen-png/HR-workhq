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

interface CycleDetail {
  id: string;
  companyId: string;
  earnCycleId: string;
  type: string;
  teamId: string | null;
  status: string;
  totalCommission: number;
  totalRecipients: number;
  audits: AuditEntry[];
}

interface Preview {
  totals: {
    totalCommission: number;
    totalRecipients: number;
    carryForward: number;
    recovery: number;
    bigLeaderCommission: number;
  };
  recipients: Array<{ employeeId: string; amount: number; carryForwardIn?: number; carryForwardOut?: number }>;
  carryForwards: Array<{ employeeId: string; amount: number; status: string }>;
}

export default function CommissionCycleDetailPage() {
  const { id = '' } = useParams();
  const [cycle, setCycle] = useState<CycleDetail | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setCycle(await apiGet<CycleDetail>(`/commission/cycles/${id}`));
      setPreview(await apiGet<Preview>(`/commission/cycles/${id}/preview`));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function runAction(action: 'approve' | 'finalize' | 'lock') {
    setBusy(true);
    setMessage('');
    try {
      const result = await apiPost(`/commission/cycles/${id}/${action}`);
      setMessage(`${action} completed: ${JSON.stringify(result)}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  if (!cycle) return <div className="card"><p>Loading…</p>{error && <p className="error">{error}</p>}</div>;

  return (
    <div className="card">
      <p><Link to="/commission/cycles">← All cycles</Link></p>
      <h1>Commission Cycle</h1>
      <p>Type: {cycle.type} · Status: <strong>{cycle.status}</strong></p>
      <p>Total: {cycle.totalCommission.toLocaleString()} · Recipients: {cycle.totalRecipients}</p>

      <div className="toolbar">
        <button type="button" disabled={busy || cycle.status !== 'draft'} onClick={() => runAction('approve')}>Approve</button>
        <button type="button" disabled={busy || cycle.status !== 'approved'} onClick={() => runAction('finalize')}>Finalize</button>
        <button type="button" disabled={busy || cycle.status !== 'finalized'} onClick={() => runAction('lock')}>Lock</button>
        <button type="button" disabled={busy} onClick={load}>Refresh preview</button>
      </div>
      {message && <p>{message}</p>}
      {error && <p className="error">{error}</p>}

      {preview && (
        <>
          <h2>Preview</h2>
          <ul>
            <li>Payable total: {preview.totals.totalCommission.toLocaleString()}</li>
            <li>Carry forward: {preview.totals.carryForward.toLocaleString()}</li>
            <li>Recovery: {preview.totals.recovery.toLocaleString()}</li>
            <li>Big leader: {preview.totals.bigLeaderCommission.toLocaleString()}</li>
          </ul>
          <h3>Recipients</h3>
          <table>
            <thead>
              <tr><th>Employee</th><th>Amount</th><th>Carry in</th><th>Carry out</th></tr>
            </thead>
            <tbody>
              {preview.recipients.map((r) => (
                <tr key={r.employeeId}>
                  <td>{r.employeeId.slice(0, 8)}</td>
                  <td>{r.amount.toLocaleString()}</td>
                  <td>{r.carryForwardIn ?? 0}</td>
                  <td>{r.carryForwardOut ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.carryForwards.length > 0 && (
            <>
              <h3>Carry forwards</h3>
              <table>
                <thead><tr><th>Employee</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {preview.carryForwards.map((c) => (
                    <tr key={`${c.employeeId}-${c.status}`}>
                      <td>{c.employeeId.slice(0, 8)}</td>
                      <td>{c.amount.toLocaleString()}</td>
                      <td>{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      <h2>Audit history</h2>
      <table>
        <thead><tr><th>Action</th><th>From</th><th>To</th><th>When</th></tr></thead>
        <tbody>
          {cycle.audits.map((a) => (
            <tr key={a.id}>
              <td>{a.action}</td>
              <td>{a.beforeStatus ?? '—'}</td>
              <td>{a.afterStatus}</td>
              <td>{new Date(a.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
