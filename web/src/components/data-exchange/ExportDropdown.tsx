import { useState } from 'react';
import { createExport, type ExportFormat } from '../../api/data-exchange';
import { WorkHQButton } from '../ui';

const FORMATS: Array<{ value: ExportFormat; label: string; icon: string }> = [
  { value: 'google_sheets', label: 'Google Sheets', icon: '📊' },
  { value: 'pdf', label: 'PDF', icon: '📄' },
  { value: 'csv', label: 'CSV', icon: '📁' },
  { value: 'xlsx', label: 'Excel (.xlsx)', icon: '📗' },
];

interface ExportDropdownProps {
  companyId: string;
  module: string;
  filters?: Record<string, unknown>;
  disabled?: boolean;
}

export function ExportDropdown({ companyId, module, filters, disabled }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function runExport(format: ExportFormat) {
    setOpen(false);
    setBusy(true);
    setMsg('');
    try {
      const job = await createExport(companyId, module, format, filters);
      if (job.googleSheetUrl) {
        window.open(job.googleSheetUrl, '_blank', 'noopener,noreferrer');
        setMsg('✅ ส่งออก Google Sheets สำเร็จ');
      } else if (job.status === 'completed') {
        setMsg(`✅ ส่งออกสำเร็จ (${job.rowCount} แถว)`);
      } else {
        setMsg(`สถานะ: ${job.status}`);
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="whq-export-dropdown" style={{ position: 'relative', display: 'inline-block' }}>
      <WorkHQButton
        type="button"
        variant="secondary"
        disabled={disabled || busy || !companyId}
        onClick={() => setOpen((v) => !v)}
      >
        {busy ? 'กำลังส่งออก…' : 'Export ▼'}
      </WorkHQButton>
      {open && (
        <div
          className="whq-export-menu"
          style={{
            position: 'absolute',
            right: 0,
            zIndex: 20,
            background: 'var(--whq-surface, #fff)',
            border: '1px solid var(--whq-border, #ddd)',
            borderRadius: 8,
            minWidth: 200,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              className="whq-export-menu-item"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => void runExport(f.value)}
            >
              {f.icon} {f.label}
              {f.value === 'google_sheets' && ' (Default)'}
            </button>
          ))}
        </div>
      )}
      {msg && <p className="whq-muted" style={{ marginTop: 4, fontSize: 12 }}>{msg}</p>}
    </div>
  );
}
