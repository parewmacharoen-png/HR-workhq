import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useCompanyId } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';

interface AuditRow {
  id: string;
  reportId: string;
  actorName: string | null;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const companyId = useCompanyId();
  const [reportId, setReportId] = useState('');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState('');

  async function load() {
    if (!companyId) return;
    try {
      setRows(await apiGet<AuditRow[]>('/marketing/audit', {
        companyId,
        reportId: reportId || undefined,
      }));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;

  return (
    <div className="card">
      <h1>Audit History</h1>
      <div className="toolbar">
        <label>
          Report ID
          <input value={reportId} onChange={(e) => setReportId(e.target.value)} />
        </label>
        <button type="button" onClick={load}>Search</button>
      </div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Report</th>
            <th>User</th>
            <th>Action</th>
            <th>Field</th>
            <th>Old</th>
            <th>New</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{new Date(row.createdAt).toLocaleString('th-TH')}</td>
              <td><Link to={`/marketing/reports/${row.reportId}`}>{row.reportId.slice(0, 8)}</Link></td>
              <td>{row.actorName ?? '-'}</td>
              <td>{row.action}</td>
              <td>{row.fieldName ?? '-'}</td>
              <td>{row.oldValue ?? '-'}</td>
              <td>{row.newValue ?? '-'}</td>
              <td>{row.reason ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
