import { useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import { useCompanyId } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';

interface KpiRow {
  employeeName: string;
  teamName: string | null;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  targetCount: number;
  remainingCount: number;
  conversionPercent: number;
  status: string;
}

export default function KpiReviewPage() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<KpiRow[]>([]);
  const [error, setError] = useState('');

  async function load() {
    if (!companyId) return;
    try {
      setRows(await apiGet<KpiRow[]>('/marketing/kpi/review', { companyId }));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;

  return (
    <div className="card">
      <h1>KPI Review</h1>
      <div className="toolbar">
        <button type="button" onClick={load}>Refresh</button>
      </div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Team</th>
            <th>Contacted</th>
            <th>New Members</th>
            <th>Deposit</th>
            <th>Started Work</th>
            <th>Target</th>
            <th>Remaining</th>
            <th>Conversion</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.employeeName}-${idx}`}>
              <td>{row.employeeName}</td>
              <td>{row.teamName ?? '-'}</td>
              <td>{row.contactedCount}</td>
              <td>{row.newMemberCount}</td>
              <td>{row.depositAmount}</td>
              <td>{row.startedWorkCount}</td>
              <td>{row.targetCount}</td>
              <td>{row.remainingCount}</td>
              <td>{row.conversionPercent}%</td>
              <td><span className="status">{row.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
