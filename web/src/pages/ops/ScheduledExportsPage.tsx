import { useCallback, useEffect, useState } from 'react';
import {
  createScheduledExport,
  listScheduledExports,
  runScheduledExportNow,
  toggleScheduledExport,
  type ScheduledExport,
} from '../../api/data-exchange';
import { useCompanyId } from '../../context/AuthContext';
import { WorkHQButton, WorkHQCard } from '../../components/ui';

export default function ScheduledExportsPage() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<ScheduledExport[]>([]);
  const [module, setModule] = useState('attendance');
  const [cron, setCron] = useState('0 8 * * *');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!companyId) return;
    setRows(await listScheduledExports(companyId));
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (!companyId) return;
    await createScheduledExport({ companyId, module, scheduleCron: cron, format: 'google_sheets' });
    setMsg('Schedule created');
    await load();
  }

  if (!companyId) return <p>เลือกบริษัทก่อน</p>;

  return (
    <div className="whq-page">
      <h1 className="whq-page-title">⏰ Scheduled Exports</h1>
      <p className="whq-muted">
        <a href="/ops/exports">Exports</a> · <a href="/ops/imports">Imports</a>
      </p>
      <WorkHQCard title="Create schedule" className="whq-detail-card">
        <input className="whq-input" value={module} onChange={(e) => setModule(e.target.value)} placeholder="module" />
        <input className="whq-input" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="cron" />
        <WorkHQButton onClick={() => void create()}>Create (Google Sheets default)</WorkHQButton>
        {msg && <p>{msg}</p>}
      </WorkHQCard>
      <table className="whq-table">
        <thead>
          <tr>
            <th>Module</th><th>Format</th><th>Cron</th><th>Enabled</th>
            <th>Last Run</th><th>Next Run</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.module}</td>
              <td>{r.format}</td>
              <td>{r.scheduleCron}</td>
              <td>{r.enabled ? 'Yes' : 'No'}</td>
              <td>{r.lastRunAt ? new Date(r.lastRunAt).toLocaleString('th-TH') : '—'}</td>
              <td>{r.nextRunAt ? new Date(r.nextRunAt).toLocaleString('th-TH') : '—'}</td>
              <td>
                <button type="button" onClick={() => void runScheduledExportNow(r.id).then(load)}>Run now</button>
                {' '}
                <button type="button" onClick={() => void toggleScheduledExport(r.id, !r.enabled).then(load)}>
                  {r.enabled ? 'Disable' : 'Enable'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
