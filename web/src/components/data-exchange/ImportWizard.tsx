import { useState } from 'react';
import {
  applyImport,
  createImport,
  previewImport,
  uploadImportFile,
  type ImportJob,
} from '../../api/data-exchange';
import { WorkHQButton, WorkHQCard } from '../ui';

const IMPORT_MODULES = [
  { value: 'employees', label: 'Employees' },
  { value: 'leave_balances', label: 'Leave Balances' },
  { value: 'salary', label: 'Salary' },
  { value: 'shift_assignments', label: 'Shift Assignments' },
];

interface ImportWizardProps {
  companyId: string;
  onComplete?: () => void;
}

export function ImportWizard({ companyId, onComplete }: ImportWizardProps) {
  const [module, setModule] = useState('employees');
  const [job, setJob] = useState<ImportJob | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewImport>> | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function startUpload(file: File) {
    setBusy(true);
    setMsg('');
    try {
      const sourceType = file.name.endsWith('.xlsx') ? 'xlsx' : 'csv';
      const created = await createImport(companyId, module, sourceType);
      const parsed = await uploadImportFile(created.id, file);
      setJob(parsed);
      setPreview(await previewImport(created.id));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!job) return;
    setBusy(true);
    try {
      const result = await applyImport(job.id);
      setJob(result);
      setMsg(`นำเข้าสำเร็จ ${result.appliedRows} แถว · ล้มเหลว ${result.failedRows}`);
      onComplete?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkHQCard title="Import Wizard" className="whq-detail-card">
      <label>
        ประเภทข้อมูล
        <select className="whq-select" value={module} onChange={(e) => setModule(e.target.value)}>
          {IMPORT_MODULES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </label>
      <p className="whq-muted">อัปโหลด CSV หรือ Excel — Google Sheets URL รองรับผ่าน API</p>
      <input
        type="file"
        accept=".csv,.xlsx"
        disabled={busy || !companyId}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void startUpload(file);
        }}
      />
      {job && (
        <p>
          สถานะ: {job.status} · ถูกต้อง {job.validRows} · ผิดพลาด {job.invalidRows}
        </p>
      )}
      {preview && preview.rows.length > 0 && (
        <table className="whq-table">
          <thead>
            <tr><th>#</th><th>Status</th><th>Errors</th></tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 20).map((r) => (
              <tr key={r.id}>
                <td>{r.rowNumber}</td>
                <td>{r.status}</td>
                <td>{r.errorsJson?.join(', ') ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {job && ['preview_ready', 'ready_to_apply'].includes(job.status) && (
        <WorkHQButton onClick={() => void apply()} disabled={busy}>
          ยืนยันนำเข้า
        </WorkHQButton>
      )}
      {msg && <p>{msg}</p>}
    </WorkHQCard>
  );
}
