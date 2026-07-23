import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useCompanyId } from '../../context/AuthContext';
import { WorkHQButton, WorkHQCard } from '../../components/ui';

interface SavedReport {
  id: string;
  module: string;
  name: string;
  description: string | null;
  defaultFormat: string;
  isFavorite: boolean;
}

export default function SavedReportsPage() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<SavedReport[]>([]);
  const [name, setName] = useState('');
  const [module, setModule] = useState('employees');

  const load = useCallback(async () => {
    if (!companyId) return;
    setRows(await apiGet<SavedReport[]>('/saved-reports', { companyId }));
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!companyId) return;
    await apiPost('/saved-reports', { companyId, module, name, defaultFormat: 'google_sheets' });
    setName('');
    await load();
  }

  async function run(id: string) {
    await apiPost(`/saved-reports/${id}/run`, {});
  }

  if (!companyId) return <p>เลือกบริษัทก่อน</p>;

  return (
    <div className="whq-page">
      <h1 className="whq-page-title">📋 Saved Reports</h1>
      <p className="whq-muted">
        <a href="/ops/exports">Exports</a> · <a href="/ops/imports">Imports</a> · <a href="/ops/scheduled-exports">Scheduled</a>
      </p>
      <WorkHQCard title="Create saved report" className="whq-detail-card">
        <input className="whq-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="whq-input" placeholder="module" value={module} onChange={(e) => setModule(e.target.value)} />
        <WorkHQButton onClick={() => void create()}>Save (Google Sheets default)</WorkHQButton>
      </WorkHQCard>
      <table className="whq-table">
        <thead>
          <tr><th>Name</th><th>Module</th><th>Format</th><th>Favorite</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.module}</td>
              <td>{r.defaultFormat}</td>
              <td>{r.isFavorite ? '★' : '—'}</td>
              <td><button type="button" onClick={() => void run(r.id)}>Run now</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
