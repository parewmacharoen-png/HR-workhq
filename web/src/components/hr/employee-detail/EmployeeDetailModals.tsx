import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../../api/client';
import { archiveEmployee, hardDeleteEmployee, updateEmployeeEmployment } from '../../../api/employee-profile';
import { WorkHQErrorState } from '../../workhq/states/WorkHQErrorState';
import { WorkHQButton, WorkHQField, WorkHQInput } from '../../ui';

const DELETE_CONFIRMATION = 'DELETE EMPLOYEE';

export { DELETE_CONFIRMATION };

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function ModalShell({ title, onClose, children }: ModalShellProps) {
  return (
    <div className="whq-modal-backdrop" role="dialog" aria-modal="true">
      <div className="whq-modal whq-card">
        <h3>{title}</h3>
        {children}
        <div className="whq-modal-actions">
          <WorkHQButton type="button" variant="ghost" onClick={onClose}>ยกเลิก</WorkHQButton>
        </div>
      </div>
    </div>
  );
}

interface ArchiveEmployeeModalProps {
  employeeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ArchiveEmployeeModal({ employeeId, onClose, onSuccess }: ArchiveEmployeeModalProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await archiveEmployee(employeeId, reason.trim());
      onSuccess();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="เก็บถาวรพนักงาน (Archive)" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="whq-form-grid">
        <WorkHQField label="เหตุผล *">
          <WorkHQInput
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="ระบุเหตุผลในการเก็บถาวร"
          />
        </WorkHQField>
        {error != null && (
          <WorkHQErrorState
            referenceCode={error instanceof ApiError ? error.requestId : undefined}
            onRetry={() => setError(null)}
          />
        )}
        <WorkHQButton type="submit" variant="danger" disabled={busy || !reason.trim()}>
          {busy ? 'กำลังบันทึก…' : 'ยืนยันเก็บถาวร'}
        </WorkHQButton>
      </form>
    </ModalShell>
  );
}

interface DeleteEmployeeModalProps {
  employeeId: string;
  employeeName: string;
  isTargetOwner: boolean;
  suggestArchive: boolean;
  onClose: () => void;
  onArchived: () => void;
}

export function DeleteEmployeeModal({
  employeeId,
  employeeName,
  isTargetOwner,
  suggestArchive,
  onClose,
  onArchived,
}: DeleteEmployeeModalProps) {
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [showArchive, setShowArchive] = useState(false);

  if (showArchive) {
    return (
      <ArchiveEmployeeModal
        employeeId={employeeId}
        onClose={onClose}
        onSuccess={onArchived}
      />
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (confirmation !== DELETE_CONFIRMATION || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await hardDeleteEmployee(employeeId, { reason: reason.trim(), confirmation });
      navigate('/hr/employees');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="ลบพนักงานถาวร" onClose={onClose}>
      {isTargetOwner ? (
        <>
          <p className="whq-muted">ไม่สามารถลบบัญชี Owner ได้</p>
        </>
      ) : suggestArchive ? (
        <>
          <p className="whq-muted">
            พนักงาน {employeeName} มีข้อมูล payroll / attendance / leave / เอกสาร — แนะนำให้เก็บถาวร (Archive) แทนการลบ
          </p>
          <WorkHQButton type="button" variant="primary" onClick={() => setShowArchive(true)}>
            ไปที่ Archive
          </WorkHQButton>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="whq-form-grid">
          <p className="whq-muted">
            พิมพ์ <strong>{DELETE_CONFIRMATION}</strong> เพื่อยืนยันการลบ
          </p>
          <WorkHQField label="ยืนยันการลบ *">
            <WorkHQInput
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={DELETE_CONFIRMATION}
              autoComplete="off"
            />
          </WorkHQField>
          <WorkHQField label="เหตุผล *">
            <WorkHQInput value={reason} onChange={(e) => setReason(e.target.value)} required />
          </WorkHQField>
          {error != null && (
            <WorkHQErrorState
              referenceCode={error instanceof ApiError ? error.requestId : undefined}
              onRetry={() => setError(null)}
            />
          )}
          <WorkHQButton
            type="submit"
            variant="danger"
            disabled={busy || confirmation !== DELETE_CONFIRMATION || !reason.trim()}
          >
            {busy ? 'กำลังลบ…' : 'ลบถาวร'}
          </WorkHQButton>
        </form>
      )}
    </ModalShell>
  );
}

interface TransferTeamModalProps {
  employeeId: string;
  teams: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSuccess: () => void;
}

export function TransferTeamModal({ employeeId, teams, onClose, onSuccess }: TransferTeamModalProps) {
  const [teamId, setTeamId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!teamId || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateEmployeeEmployment(employeeId, { teamId, reason: reason.trim() });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="ย้ายทีม" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="whq-form-grid">
        <WorkHQField label="ทีมใหม่ *">
          <select className="whq-input" value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
            <option value="">— เลือกทีม —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </WorkHQField>
        <WorkHQField label="เหตุผล *">
          <WorkHQInput value={reason} onChange={(e) => setReason(e.target.value)} required />
        </WorkHQField>
        {error != null && (
          <WorkHQErrorState
            referenceCode={error instanceof ApiError ? error.requestId : undefined}
            onRetry={() => setError(null)}
          />
        )}
        <WorkHQButton type="submit" variant="primary" disabled={busy || !teamId || !reason.trim()}>
          {busy ? 'กำลังบันทึก…' : 'ย้ายทีม'}
        </WorkHQButton>
      </form>
    </ModalShell>
  );
}

export type EmployeeDetailModal =
  | 'archive'
  | 'delete'
  | 'transfer';
