import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  EDITABLE_BUSINESS_ROLES,
  updateEmployeeBusinessRole,
} from '../../../api/employee-employment';
import { roleLabel } from '../../../i18n/th-labels';
import { WorkHQButton, WorkHQField, WorkHQInput, WorkHQSelect } from '../../ui';

function formatBusinessRoleSaveError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'ไม่สามารถบันทึกบทบาทได้ กรุณาลองใหม่';
  }

  const msg = err.message;
  if (msg.includes('last Owner') || msg.includes('At least one Owner')) {
    return 'ต้องมีเจ้าของอย่างน้อย 1 คน — ไม่สามารถลดบทบาทเจ้าของคนสุดท้ายได้';
  }
  if (msg.includes('Only Owner can change an existing Owner')) {
    return 'เฉพาะเจ้าของเท่านั้นที่สามารถเปลี่ยนบทบาทของเจ้าของคนอื่นได้';
  }
  if (msg.includes('Only Owner can assign')) {
    return 'เฉพาะเจ้าของเท่านั้นที่สามารถมอบบทบาทเจ้าของได้';
  }
  if (msg.includes('Only Owner or Secretary')) {
    return 'เฉพาะเจ้าของหรือเลขานุการเท่านั้นที่สามารถเปลี่ยนบทบาทได้';
  }
  if (err.status === 403) {
    return 'คุณไม่มีสิทธิ์เปลี่ยนบทบาทนี้';
  }

  return msg || 'ไม่สามารถบันทึกบทบาทได้ กรุณาลองใหม่';
}

export interface EmployeeBusinessRoleEditorProps {
  employeeId: string;
  companyId: string;
  currentRole: string | null;
  canAssignOwnerRole: boolean;
  onSaved?: () => void | Promise<void>;
}

export function EmployeeBusinessRoleEditor({
  employeeId,
  companyId,
  currentRole,
  canAssignOwnerRole,
  onSaved,
}: EmployeeBusinessRoleEditorProps) {
  const normalizedRole = currentRole ?? 'employee';
  const [role, setRole] = useState(normalizedRole);
  const [baseline, setBaseline] = useState(normalizedRole);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setRole(normalizedRole);
    setBaseline(normalizedRole);
  }, [normalizedRole]);

  const roleOptions = useMemo(() => {
    const roles = [...EDITABLE_BUSINESS_ROLES];
    if (!canAssignOwnerRole) return roles.filter((r) => r !== 'owner');
    return roles;
  }, [canAssignOwnerRole]);

  const dirty = role !== baseline;

  async function save() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateEmployeeBusinessRole(
        employeeId,
        { businessRole: role, reason: reason.trim() || undefined },
        companyId,
      );
      const savedRole = updated.employment.businessRole ?? role;
      setRole(savedRole);
      setBaseline(savedRole);
      setReason('');
      setSuccess('บันทึกบทบาทเรียบร้อยแล้ว — ส่ง /start ใน Telegram เพื่อรีเฟรชเมนู');
      await onSaved?.();
    } catch (err) {
      setError(formatBusinessRoleSaveError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="whq-role-editor" data-testid="employment-role-editor">
      <div className="whq-role-editor-row">
        <WorkHQField label="บทบาท">
          <WorkHQSelect
            data-testid="employment-role-select"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setSuccess(null);
            }}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </WorkHQSelect>
        </WorkHQField>
        <WorkHQField label="เหตุผล (ไม่บังคับ)">
          <WorkHQInput
            data-testid="employment-role-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ทดสอบ workflow พนักงาน"
          />
        </WorkHQField>
      </div>
      <p className="whq-muted whq-role-editor-hint" data-testid="employment-role-warning">
        การเปลี่ยนบทบาทมีผลต่อเมนู Telegram, สิทธิ์การมองเห็นข้อมูล และ workflow ในระบบ
      </p>
      {error && (
        <p className="whq-error" data-testid="employment-role-error">{error}</p>
      )}
      {success && <p className="whq-success" data-testid="employment-role-success">{success}</p>}
      <div className="whq-action-row">
        <WorkHQButton
          type="button"
          variant="primary"
          data-testid="employment-role-save-button"
          disabled={saving || !dirty}
          onClick={() => void save()}
        >
          บันทึกบทบาท
        </WorkHQButton>
      </div>
    </div>
  );
}
