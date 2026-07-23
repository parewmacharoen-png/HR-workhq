import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useCompanyId } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';

interface CommissionCycle {
  id: string;
  companyId: string;
  earnCycleId: string;
  type: string;
  teamId: string | null;
  status: string;
  totalCommission: number;
  totalRecipients: number;
  updatedAt: string;
}

export default function CommissionCyclesPage() {
  const companyId = useCompanyId();
  const [cycles, setCycles] = useState<CommissionCycle[]>([]);
  const [error, setError] = useState('');

  async function load() {
    if (!companyId) return;
    try {
      setCycles(await apiGet<CommissionCycle[]>('/commission/cycles', { companyId }));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>Commission Cycles</h1>
        <button type="button" onClick={load}>Refresh</button>
      </div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Cycle</th>
            <th>Type</th>
            <th>Status</th>
            <th>Total</th>
            <th>Recipients</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((cycle) => (
            <tr key={cycle.id}>
              <td><Link to={`/commission/cycles/${cycle.id}`}>{cycle.id.slice(0, 8)}</Link></td>
              <td>{cycle.type}</td>
              <td>{cycle.status}</td>
              <td>{cycle.totalCommission.toLocaleString()}</td>
              <td>{cycle.totalRecipients}</td>
              <td>{new Date(cycle.updatedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
