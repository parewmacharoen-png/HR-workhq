import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useCompanyId } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { StatusBadge } from '../components/StatusBadge';

interface ReportRow {
  id: string;
  reportDate: string;
  employeeName: string;
  teamName: string | null;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  status: string;
  submittedAt: string | null;
}

export default function ReportsPage() {
  const companyId = useCompanyId();
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await apiGet<ReportRow[]>('/marketing/reports', {
        companyId,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setRows(data);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" description="Choose a company from the top bar to load reports." />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>Marketing Reports</h1>
        <button type="button" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      <div className="toolbar">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="draft">draft</option>
            <option value="submitted">submitted</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="voided">voided</option>
          </select>
        </label>
        <label>From<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label>To<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        <button type="button" className="secondary" onClick={load}>Apply filters</button>
      </div>
      {error ? <ErrorState error={error} onRetry={load} /> : null}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Employee</th>
            <th>Team</th>
            <th>Contacted</th>
            <th>New Members</th>
            <th>Deposit</th>
            <th>Started Work</th>
            <th>Status</th>
            <th>Submitted At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.reportDate}</td>
              <td>{row.employeeName}</td>
              <td>{row.teamName ?? '-'}</td>
              <td>{row.contactedCount}</td>
              <td>{row.newMemberCount}</td>
              <td>{row.depositAmount}</td>
              <td>{row.startedWorkCount}</td>
              <td><span className="status">{row.status}</span></td>
              <td>{row.submittedAt ? new Date(row.submittedAt).toLocaleString('th-TH') : '-'}</td>
              <td><Link to={`/marketing/reports/${row.id}`}>View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
