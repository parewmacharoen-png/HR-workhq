import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import { useCompanyId } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';

interface CommissionAdjustment {
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
  createdAt: string;
}

export default function CommissionAdjustmentsPage() {
  const companyId = useCompanyId();
  const [adjustments, setAdjustments] = useState<CommissionAdjustment[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    earnCycleId: '',
    commissionCycleId: '',
    type: 'marketing',
    employeeId: '',
    reason: '',
    adjustmentAmount: '1000',
    direction: 'increase',
  });

  async function load() {
    if (!companyId) return;
    try {
      setAdjustments(await apiGet<CommissionAdjustment[]>('/commission/adjustments', { companyId }));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function createRequest(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    try {
      const created = await apiPost<CommissionAdjustment>('/commission/adjustments', {
        companyId,
        earnCycleId: form.earnCycleId,
        type: form.type,
        employeeId: form.employeeId,
        reason: form.reason,
        adjustmentAmount: Number(form.adjustmentAmount),
        direction: form.direction,
      });
      setMessage(`Created adjustment ${created.id.slice(0, 8)} (${created.status})`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;

  return (
    <div className="card">
      <h1>Commission Adjustments</h1>
      <p>Post-lock corrections require workflow approval. Locked cycles cannot be edited directly.</p>

      <div className="toolbar">
        <button type="button" onClick={load}>Refresh</button>
      </div>

      <form onSubmit={createRequest} className="toolbar">
        <h2>Request adjustment</h2>
        <label>
          Earn cycle ID
          <input value={form.earnCycleId} onChange={(e) => setForm({ ...form, earnCycleId: e.target.value })} required />
        </label>
        <label>
          Type
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="marketing">marketing</option>
            <option value="admin">admin</option>
            <option value="referral">referral</option>
            <option value="recruitment">recruitment</option>
          </select>
        </label>
        <label>
          Employee ID
          <input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} required />
        </label>
        <label>
          Reason
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
        </label>
        <label>
          Amount
          <input value={form.adjustmentAmount} onChange={(e) => setForm({ ...form, adjustmentAmount: e.target.value })} required />
        </label>
        <label>
          Direction
          <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
            <option value="increase">increase</option>
            <option value="decrease">decrease</option>
          </select>
        </label>
        <button type="submit">Create draft</button>
      </form>

      {message && <p>{message}</p>}
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Request</th>
            <th>Type</th>
            <th>Employee</th>
            <th>Amount</th>
            <th>Direction</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {adjustments.map((row) => (
            <tr key={row.id}>
              <td><Link to={`/commission/adjustments/${row.id}`}>{row.id.slice(0, 8)}</Link></td>
              <td>{row.type}</td>
              <td>{row.employeeId.slice(0, 8)}</td>
              <td>{row.adjustmentAmount.toLocaleString()}</td>
              <td>{row.direction}</td>
              <td>{row.status}</td>
              <td>{new Date(row.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
