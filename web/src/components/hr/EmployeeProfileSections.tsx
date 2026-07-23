import { useState } from 'react';
import { apiPatch, apiPost } from '../../api/client';

export interface EmployeeFullProfile {
  id: string;
  globalId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  lineId: string | null;
  address: string | null;
  dateOfBirth: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  department: string | null;
  position: string | null;
  employmentStatus: string;
  hireDate: string;
  probationEndDate: string | null;
  companyName: string | null;
  teamName: string | null;
  bankCode: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  archivedAt: string | null;
  terminationDate?: string | null;
  nationalIdMasked?: string | null;
  employmentType?: string | null;
}

interface EditableCardProps {
  title: string;
  employeeId: string;
  canEdit: boolean;
  children: React.ReactNode;
  onSaved: () => void;
  savePath: string;
  buildPayload: () => Record<string, unknown>;
  sensitive?: boolean;
}

function EditableCard({
  title, employeeId, canEdit, children, onSaved, savePath, buildPayload, sensitive,
}: EditableCardProps) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (sensitive && !reason.trim()) {
      setError('กรุณาระบุเหตุผล');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiPatch(`/employees/${employeeId}/${savePath}`, {
        ...buildPayload(),
        ...(sensitive ? { reason } : {}),
      });
      setEditing(false);
      setReason('');
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="whq-detail-card whq-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>{title}</h3>
        {canEdit && !editing && (
          <button type="button" className="whq-btn whq-btn--secondary" onClick={() => setEditing(true)}>
            แก้ไข
          </button>
        )}
      </div>
      {children}
      {editing && (
        <div style={{ marginTop: 12 }}>
          {sensitive && (
            <label>
              เหตุผล (จำเป็น)
              <textarea className="whq-input" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </label>
          )}
          {error && <p className="whq-error">{error}</p>}
          <button type="button" className="whq-btn whq-btn--primary" disabled={busy} onClick={() => void save()}>
            บันทึก
          </button>
          {' '}
          <button type="button" className="whq-btn" disabled={busy} onClick={() => setEditing(false)}>ยกเลิก</button>
        </div>
      )}
    </div>
  );
}

interface EmployeeProfileSectionsProps {
  profile: EmployeeFullProfile;
  employeeId: string;
  canEdit: boolean;
  onReload: () => void;
}

export function EmployeeProfileSections({ profile, employeeId, canEdit, onReload }: EmployeeProfileSectionsProps) {
  const [form, setForm] = useState({
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    nickname: profile.nickname ?? '',
    lineId: profile.lineId ?? '',
    address: profile.address ?? '',
    emergencyContactName: profile.emergencyContactName ?? '',
    emergencyContactPhone: profile.emergencyContactPhone ?? '',
    department: profile.department ?? '',
    position: profile.position ?? '',
    bankName: profile.bankCode ?? '',
    bankAccountNumber: profile.bankAccountNo ?? '',
    bankAccountHolder: profile.bankAccountName ?? '',
  });

  async function archive() {
    const reason = window.prompt('เหตุผลในการเก็บถาวร');
    if (!reason) return;
    await apiPost(`/employees/${employeeId}/archive`, { reason });
    onReload();
  }

  async function restore() {
    const reason = window.prompt('เหตุผลในการกู้คืน');
    if (!reason) return;
    await apiPost(`/employees/${employeeId}/restore`, { reason });
    onReload();
  }

  return (
    <>
      <EditableCard
        title="ข้อมูลติดต่อ"
        employeeId={employeeId}
        canEdit={canEdit}
        onSaved={onReload}
        savePath="profile"
        buildPayload={() => ({
          phone: form.phone,
          email: form.email,
          nickname: form.nickname,
          lineId: form.lineId,
          address: form.address,
          emergencyContactName: form.emergencyContactName,
          emergencyContactPhone: form.emergencyContactPhone,
        })}
      >
        <p>โทร: {editingField(canEdit, form.phone, (v) => setForm({ ...form, phone: v }))}</p>
        <p>อีเมล: {editingField(canEdit, form.email, (v) => setForm({ ...form, email: v }))}</p>
        <p>Line: {profile.lineId ?? '—'}</p>
        <p>ที่อยู่: {profile.address ?? '—'}</p>
        <p>ผู้ติดต่อฉุกเฉิน: {profile.emergencyContactName ?? '—'} ({profile.emergencyContactPhone ?? '—'})</p>
      </EditableCard>

      <EditableCard
        title="ข้อมูลการจ้างงาน"
        employeeId={employeeId}
        canEdit={canEdit}
        onSaved={onReload}
        savePath="employment"
        sensitive
        buildPayload={() => ({
          department: form.department,
          position: form.position,
          reason: 'Updated from employee detail',
        })}
      >
        <p>บริษัท: {profile.companyName ?? '—'}</p>
        <p>ทีม: {profile.teamName ?? '—'}</p>
        <p>แผนก: {profile.department ?? '—'}</p>
        <p>ตำแหน่ง: {profile.position ?? '—'}</p>
        <p>สถานะ: {profile.employmentStatus}</p>
        <p>วันเริ่มงาน: {profile.hireDate}</p>
      </EditableCard>

      {canEdit && (
        <EditableCard
          title="ข้อมูลธนาคาร / Payroll"
          employeeId={employeeId}
          canEdit={canEdit}
          onSaved={onReload}
          savePath="payroll-info"
          sensitive
          buildPayload={() => ({
            bankName: form.bankName,
            bankAccountNumber: form.bankAccountNumber,
            bankAccountHolder: form.bankAccountHolder,
            reason: 'Updated bank info',
          })}
        >
          <p>ธนาคาร: {profile.bankCode ?? '—'}</p>
          <p>เลขบัญชี: {profile.bankAccountNo ?? '—'}</p>
          <p>ชื่อบัญชี: {profile.bankAccountName ?? '—'}</p>
        </EditableCard>
      )}

      {canEdit && (
        <div className="whq-detail-card whq-card">
          <h3>การจัดการพนักงาน</h3>
          {profile.archivedAt ? (
            <button type="button" className="whq-btn" onClick={() => void restore()}>กู้คืนพนักงาน</button>
          ) : (
            <button type="button" className="whq-btn whq-btn--danger" onClick={() => void archive()}>เก็บถาวร (Archive)</button>
          )}
        </div>
      )}
    </>
  );
}

function editingField(canEdit: boolean, value: string, onChange: (v: string) => void) {
  if (!canEdit) return value || '—';
  return (
    <input className="whq-input" value={value} onChange={(e) => onChange(e.target.value)} />
  );
}
