import { useCallback, useEffect, useState } from 'react';
import { deleteExport, listExports, retryExport, type ExportJob } from '../../api/data-exchange';
import { useCompanyId } from '../../context/AuthContext';
import { WorkHQButton } from '../../components/ui';

function durationMs(job: ExportJob): string {
  if (!job.startedAt || !job.completedAt) return '—';
  const ms = new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export default function ExportHistoryPage() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<ExportJob[]>([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!companyId) return;
    setRows(await listExports(companyId));
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function retry(id: string) {
    await retryExport(id);
    setMsg('Retry started');
    await load();
  }

  async function remove(id: string) {
    await deleteExport(id);
    await load();
  }

  if (!companyId) return <p>เลือกบริษัทก่อน</p>;

  return (
    <div className="whq-page">
      <h1 className="whq-page-title">📤 Export History</h1>
      <p className="whq-muted">
        <a href="/ops/imports">Imports</a> · <a href="/ops/scheduled-exports">Scheduled Exports</a>
      </p>
      {msg && <p>{msg}</p>}
      <WorkHQButton onClick={() => void load()}>Refresh</WorkHQButton>
      <table className="whq-table">
        <thead>
          <tr>
            <th>Module</th><th>Format</th><th>Rows</th><th>Status</th>
            <th>Started</th><th>Completed</th><th>Duration</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id}>
              <td>{j.module}</td>
              <td>{j.format}</td>
              <td>{j.rowCount}</td>
              <td>{j.status}</td>
              <td>{j.startedAt ? new Date(j.startedAt).toLocaleString('th-TH') : '—'}</td>
              <td>{j.completedAt ? new Date(j.completedAt).toLocaleString('th-TH') : '—'}</td>
              <td>{durationMs(j)}</td>
              <td>
                {j.googleSheetUrl && (
                  <a href={j.googleSheetUrl} target="_blank" rel="noreferrer">Sheets</a>
                )}
                {j.storageKey && (
                  <a href={`/api/v1/exports/${j.id}/download`}>Download</a>
                )}
                {j.status === 'failed' && (
                  <button type="button" onClick={() => void retry(j.id)}>Retry</button>
                )}
                <button type="button" onClick={() => void remove(j.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
