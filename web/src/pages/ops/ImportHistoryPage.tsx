import { useCallback, useEffect, useState } from 'react';
import { listImports, type ImportJob } from '../../api/data-exchange';
import { useCompanyId } from '../../context/AuthContext';
import { ImportWizard } from '../../components/data-exchange/ImportWizard';
import { WorkHQButton } from '../../components/ui';

export default function ImportHistoryPage() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<ImportJob[]>([]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setRows(await listImports(companyId));
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  if (!companyId) return <p>เลือกบริษัทก่อน</p>;

  return (
    <div className="whq-page">
      <h1 className="whq-page-title">📥 Import History</h1>
      <p className="whq-muted">
        <a href="/ops/exports">Exports</a> · <a href="/ops/scheduled-exports">Scheduled Exports</a>
      </p>
      <ImportWizard companyId={companyId} onComplete={load} />
      <WorkHQButton onClick={() => void load()}>Refresh</WorkHQButton>
      <table className="whq-table">
        <thead>
          <tr>
            <th>Module</th><th>Status</th><th>Total</th><th>Valid</th>
            <th>Invalid</th><th>Applied</th><th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id}>
              <td>{j.module}</td>
              <td>{j.status}</td>
              <td>{j.totalRows}</td>
              <td>{j.validRows}</td>
              <td>{j.invalidRows}</td>
              <td>{j.appliedRows}</td>
              <td>{new Date(j.createdAt).toLocaleString('th-TH')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
