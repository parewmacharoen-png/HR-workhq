import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  fetchEmployeePersonal,
  updateEmployeePersonal,
  type EmployeePersonalResponse,
} from '../../../api/employee-personal';
import { useAuth } from '../../../context/AuthContext';
import { NO_DATA } from '../../../lib/employee-date-utils';
import {
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQLoadingState,
  WorkHQPageState,
} from '../../workhq';
import { WorkHQButton, WorkHQCard, WorkHQField, WorkHQInput } from '../../ui';
import { WorkHQDateInput } from '../../ui/WorkHQDateInput';
import { formatEmployeeDateDdMmYyyy } from '../../../i18n/employee-dates';
import { EmployeeIdentityDocuments } from './EmployeeIdentityDocuments';

interface PersonalFormState {
  firstName: string;
  lastName: string;
  nickname: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  nationalId: string;
  passportNumber: string;
}

function toFormState(data: EmployeePersonalResponse): PersonalFormState {
  return {
    firstName: data.personalInformation.firstName,
    lastName: data.personalInformation.lastName,
    nickname: data.personalInformation.nickname ?? '',
    dateOfBirth: data.personalInformation.dateOfBirth ?? '',
    gender: data.personalInformation.gender ?? '',
    phone: data.contactInformation.phone ?? '',
    email: data.contactInformation.email ?? '',
    nationalId: data.governmentInformation.nationalId ?? '',
    passportNumber: data.governmentInformation.passportNumber ?? '',
  };
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="whq-info-row">
      <span className="whq-info-label">{label}</span>
      <span className="whq-info-value">{value || NO_DATA}</span>
    </div>
  );
}

function FieldInput({
  label,
  value,
  editing,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  if (!editing) {
    const display = type === 'date' && value ? formatEmployeeDateDdMmYyyy(value) : value;
    return <InfoRow label={label} value={display} />;
  }
  if (type === 'date') {
    return (
      <WorkHQField label={label}>
        <WorkHQDateInput value={value} disabled={disabled} onChange={onChange} />
      </WorkHQField>
    );
  }
  return (
    <WorkHQField label={label}>
      <WorkHQInput
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </WorkHQField>
  );
}

interface EmployeePersonalTabProps {
  employeeId: string;
  canEdit: boolean;
  onReload: () => void;
}

export function EmployeePersonalTab({ employeeId, canEdit, onReload }: EmployeePersonalTabProps) {
  const { can } = useAuth();
  const canViewSensitive = can('employee:sensitive:read');
  const canManageDocuments = can('document:write');

  const [data, setData] = useState<EmployeePersonalResponse | null>(null);
  const [form, setForm] = useState<PersonalFormState | null>(null);
  const [baseline, setBaseline] = useState<PersonalFormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const personal = await fetchEmployeePersonal(employeeId);
      setData(personal);
      const nextForm = toFormState(personal);
      setForm(nextForm);
      setBaseline(nextForm);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => editing && baseline && form && JSON.stringify(form) !== JSON.stringify(baseline),
    [editing, baseline, form],
  );

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function updateField<K extends keyof PersonalFormState>(key: K, value: PersonalFormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function startEdit() {
    if (!form) return;
    setBaseline(form);
    setEditing(true);
    setSaveError(null);
  }

  function cancelEdit() {
    if (dirty && !window.confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการยกเลิกหรือไม่?')) {
      return;
    }
    if (baseline) setForm(baseline);
    setEditing(false);
    setSaveError(null);
  }

  async function savePersonal() {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload: Parameters<typeof updateEmployeePersonal>[1] = {
        firstName: form.firstName,
        lastName: form.lastName,
        nickname: form.nickname,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender,
        phone: form.phone,
        email: form.email,
      };
      if (canViewSensitive) {
        payload.nationalId = form.nationalId;
        payload.passportNumber = form.passportNumber;
      }
      const updated = await updateEmployeePersonal(employeeId, payload);
      setData(updated);
      const nextForm = toFormState(updated);
      setForm(nextForm);
      setBaseline(nextForm);
      setEditing(false);
      onReload();
    } catch (err) {
      setSaveError(err instanceof ApiError ? 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่' : 'เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  }

  const pageState = loading
    ? 'loading' as const
    : error
      ? 'error' as const
      : !data || !form
        ? 'empty' as const
        : 'success' as const;

  return (
    <WorkHQPageState
      state={pageState}
      loading={<WorkHQLoadingState label="กำลังโหลดข้อมูลส่วนตัว…" />}
      error={(
        <WorkHQErrorState
          referenceCode={error instanceof ApiError ? error.requestId : undefined}
          onRetry={() => void load()}
        />
      )}
      empty={<WorkHQEmptyState title={NO_DATA} description="ไม่พบข้อมูลส่วนตัว" />}
    >
      {data && form && (
        <div className="whq-personal-sections">
          <div className="whq-action-row">
            {canEdit && !editing && (
              <WorkHQButton type="button" variant="primary" data-testid="personal-edit-button" onClick={startEdit}>
                แก้ไข
              </WorkHQButton>
            )}
            {canEdit && editing && (
              <>
                <WorkHQButton type="button" variant="primary" disabled={saving} data-testid="personal-save-button" onClick={() => void savePersonal()}>
                  บันทึก
                </WorkHQButton>
                <WorkHQButton type="button" variant="secondary" disabled={saving} data-testid="personal-cancel-button" onClick={cancelEdit}>
                  ยกเลิก
                </WorkHQButton>
              </>
            )}
          </div>
          {saveError && <p className="whq-error">{saveError}</p>}

          <WorkHQCard title="ข้อมูลส่วนตัว" className="whq-detail-card">
            <div className="whq-detail-card-body">
              <FieldInput label="ชื่อ" value={form.firstName} editing={editing} onChange={(v) => updateField('firstName', v)} />
              <FieldInput label="นามสกุล" value={form.lastName} editing={editing} onChange={(v) => updateField('lastName', v)} />
              <FieldInput label="ชื่อเล่น" value={form.nickname} editing={editing} onChange={(v) => updateField('nickname', v)} />
              <FieldInput label="วันเกิด" value={form.dateOfBirth} editing={editing} type="date" onChange={(v) => updateField('dateOfBirth', v)} />
              <FieldInput label="เพศ" value={form.gender} editing={editing} onChange={(v) => updateField('gender', v)} />
            </div>
          </WorkHQCard>

          <WorkHQCard title="ข้อมูลติดต่อ" className="whq-detail-card">
            <div className="whq-detail-card-body">
              <FieldInput label="เบอร์โทร" value={form.phone} editing={editing} onChange={(v) => updateField('phone', v)} />
              <FieldInput label="Email" value={form.email} editing={editing} type="email" onChange={(v) => updateField('email', v)} />
            </div>
          </WorkHQCard>

          <WorkHQCard title="ข้อมูลทางราชการ" className="whq-detail-card">
            <div className="whq-detail-card-body">
              <FieldInput
                label="เลขบัตรประชาชน"
                value={form.nationalId}
                editing={editing}
                disabled={!canViewSensitive}
                onChange={(v) => updateField('nationalId', v)}
              />
              <FieldInput
                label="เลขหนังสือเดินทาง"
                value={form.passportNumber}
                editing={editing}
                disabled={!canViewSensitive}
                onChange={(v) => updateField('passportNumber', v)}
              />
            </div>
          </WorkHQCard>

          <WorkHQCard title="เอกสารยืนยันตัวตน" className="whq-detail-card">
            <EmployeeIdentityDocuments
              employeeId={employeeId}
              documents={data.identityDocuments}
              canManage={canManageDocuments}
              onChanged={() => void load()}
            />
          </WorkHQCard>
        </div>
      )}
    </WorkHQPageState>
  );
}
