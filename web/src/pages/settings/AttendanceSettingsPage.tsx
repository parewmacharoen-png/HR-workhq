import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPut } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useScopedCompanyId } from '../../hooks/useScopedCompanyId';
import { CompanyScopePicker, WorkHQSelectCompanyState } from '../../components/workhq';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { ShiftTemplatesSection } from '../../components/settings/ShiftTemplatesSection';

interface AttendanceRules {
  graceMinutes: number;
  latePenaltyMultiplier: number;
  breakMinutes: number;
  breakOveragePenaltyThresholdHours: number;
  halfDayAbsenceThresholdHours: number;
  fullDayAbsenceThresholdHours: number;
  missingCheckInAllowed: boolean;
  missingCheckOutAllowed: boolean;
  autoCloseMissingCheckOut: boolean;
  overtimeEnabled: boolean;
  minimumOvertimeMinutes: number;
  shiftStartMinutes: number;
  shiftEndMinutes: number;
  otStartDelayMinutes: number;
  otHourlyRate: number;
  checkInPreReminderMinutes: number;
  checkInReminderMinutes: number;
  checkInEscalationMinutes: number;
  breakPreReminderMinutes: number;
  breakReminderMinutes: number;
  breakEscalationMinutes: number;
  checkOutReminderMinutes: number;
  checkOutEscalationMinutes: number;
}

interface SettingRow {
  key: string;
  value: AttendanceRules;
}

const DEFAULT_RULES: AttendanceRules = {
  graceMinutes: 15,
  latePenaltyMultiplier: 2,
  breakMinutes: 60,
  breakOveragePenaltyThresholdHours: 2,
  halfDayAbsenceThresholdHours: 4,
  fullDayAbsenceThresholdHours: 6,
  missingCheckInAllowed: false,
  missingCheckOutAllowed: false,
  autoCloseMissingCheckOut: false,
  overtimeEnabled: true,
  minimumOvertimeMinutes: 60,
  shiftStartMinutes: 540,
  shiftEndMinutes: 1260,
  otStartDelayMinutes: 30,
  otHourlyRate: 50,
  checkInPreReminderMinutes: 15,
  checkInReminderMinutes: 30,
  checkInEscalationMinutes: 60,
  breakPreReminderMinutes: 5,
  breakReminderMinutes: 60,
  breakEscalationMinutes: 90,
  checkOutReminderMinutes: 30,
  checkOutEscalationMinutes: 120,
};

function validateRules(rules: AttendanceRules): string | null {
  const checks: [string, boolean][] = [
    ['นาทีสายต้องไม่ติดลบ', rules.graceMinutes >= 0],
    ['ตัวคูณหักสายต้องไม่ติดลบ', rules.latePenaltyMultiplier >= 0],
    ['นาทีพักต้องมากกว่า 0', rules.breakMinutes > 0],
    ['เกณฑ์พักเกินต้องไม่ติดลบ', rules.breakOveragePenaltyThresholdHours >= 0],
    ['เกณฑ์ขาดครึ่งวันต้องไม่ติดลบ', rules.halfDayAbsenceThresholdHours >= 0],
    ['เกณฑ์ขาดเต็มวันต้องไม่ติดลบ', rules.fullDayAbsenceThresholdHours >= 0],
    ['นาที OT ขั้นต่ำต้องไม่ติดลบ', rules.minimumOvertimeMinutes >= 0],
    ['เกณฑ์ขาดครึ่งวันต้องไม่เกินเต็มวัน', rules.halfDayAbsenceThresholdHours <= rules.fullDayAbsenceThresholdHours],
  ];
  const failed = checks.find(([, ok]) => !ok);
  return failed ? failed[0] : null;
}

export default function AttendanceSettingsPage() {
  const {
    companyId,
    hasCompanyScope,
    needsLocalPicker,
    setLocalCompanyId,
    companies,
    scopedCompanyIds,
  } = useScopedCompanyId();
  const { can } = useAuth();
  const [rules, setRules] = useState<AttendanceRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canWrite = can('settings:write');

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      const rows = await apiGet<SettingRow[]>('/settings/attendance', { companyId });
      const row = rows.find((r) => r.key === 'rules');
      if (row?.value && typeof row.value === 'object') {
        setRules({ ...DEFAULT_RULES, ...(row.value as AttendanceRules) });
      } else {
        const systemRows = await apiGet<SettingRow[]>('/settings/attendance', { companyId: 'system' });
        const systemRow = systemRows.find((r) => r.key === 'rules');
        if (systemRow?.value && typeof systemRow.value === 'object') {
          setRules({ ...DEFAULT_RULES, ...(systemRow.value as AttendanceRules) });
        }
      }
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  function update<K extends keyof AttendanceRules>(key: K, value: AttendanceRules[K]) {
    setRules((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setValidationError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !canWrite) return;
    const validation = validateRules(rules);
    if (validation) {
      setValidationError(validation);
      return;
    }
    setSaving(true);
    try {
      await apiPut('/settings/attendance/rules', { value: rules }, { companyId });
      setSaved(true);
      setValidationError(null);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  if (!hasCompanyScope) return <WorkHQSelectCompanyState />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <Link to="/settings">← ตั้งค่า</Link>
          <h1>ตั้งค่าเวลาเข้างาน</h1>
        </div>
      </div>
      {needsLocalPicker ? (
        <CompanyScopePicker
          companies={companies}
          companyIds={scopedCompanyIds}
          value={companyId}
          onChange={setLocalCompanyId}
        />
      ) : null}
      <p className="muted">
        ค่าที่บริษัทกำหนดจะแทนค่าเริ่มต้นของระบบ — ทุกการเปลี่ยนแปลงมีประวัติบันทึก
      </p>

      <ShiftTemplatesSection
        companyId={companyId}
        canWrite={can('settings:write') || can('attendance:write')}
      />

      <form className="form-grid settings-form-sections" onSubmit={onSubmit}>
        <section>
          <h2>การมาสาย</h2>
          <label>
            นาทีสายที่ไม่หักเงิน (Grace)
            <input
              type="number"
              min={0}
              value={rules.graceMinutes}
              onChange={(e) => update('graceMinutes', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
          <label>
            ตัวคูณหักเงินเมื่อสาย
            <input
              type="number"
              min={0}
              step="0.1"
              value={rules.latePenaltyMultiplier}
              onChange={(e) => update('latePenaltyMultiplier', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
        </section>

        <section>
          <h2>เวลาพัก</h2>
          <label>
            นาทีพักต่อวัน
            <input
              type="number"
              min={1}
              value={rules.breakMinutes}
              onChange={(e) => update('breakMinutes', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
          <label>
            พักเกินกี่ชั่วโมงเริ่มหัก (ชั่วโมง)
            <input
              type="number"
              min={0}
              step="0.5"
              value={rules.breakOveragePenaltyThresholdHours}
              onChange={(e) => update('breakOveragePenaltyThresholdHours', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
        </section>

        <section>
          <h2>การขาดงาน</h2>
          <label>
            เกณฑ์ขาดครึ่งวัน (ชั่วโมง)
            <input
              type="number"
              min={0}
              step="0.5"
              value={rules.halfDayAbsenceThresholdHours}
              onChange={(e) => update('halfDayAbsenceThresholdHours', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
          <label>
            เกณฑ์ขาดเต็มวัน (ชั่วโมง)
            <input
              type="number"
              min={0}
              step="0.5"
              value={rules.fullDayAbsenceThresholdHours}
              onChange={(e) => update('fullDayAbsenceThresholdHours', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
        </section>

        <section>
          <h2>โอที (OT)</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.overtimeEnabled}
              onChange={(e) => update('overtimeEnabled', e.target.checked)}
              disabled={!canWrite}
            />
            เปิดใช้งาน OT
          </label>
          <label>
            นาที OT ขั้นต่ำ
            <input
              type="number"
              min={0}
              value={rules.minimumOvertimeMinutes}
              onChange={(e) => update('minimumOvertimeMinutes', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
          <label>
            เริ่มนับ OT หลังเลิกกี่นาที
            <input
              type="number"
              min={0}
              value={rules.otStartDelayMinutes}
              onChange={(e) => update('otStartDelayMinutes', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
          <label>
            อัตรา OT ต่อชั่วโมง (บาท)
            <input
              type="number"
              min={0}
              value={rules.otHourlyRate}
              onChange={(e) => update('otHourlyRate', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
        </section>

        <section>
          <h2>แจ้งเตือนเวลาเข้างาน (Telegram)</h2>
          <p className="muted">
            ใช้เวลาเข้า–เลิกของกะที่มอบหมายให้พนักงาน (ไม่ใช่เวลา default ด้านล่าง)
          </p>
          <label>
            แจ้งเตือนก่อนเข้างาน (นาทีก่อนเริ่มกะ)
            <input type="number" min={0} value={rules.checkInPreReminderMinutes} onChange={(e) => update('checkInPreReminderMinutes', Number(e.target.value))} disabled={!canWrite} />
          </label>
          <label>
            เตือนยังไม่เช็กอิน (นาทีหลังเริ่มกะ)
            <input type="number" min={0} value={rules.checkInReminderMinutes} onChange={(e) => update('checkInReminderMinutes', Number(e.target.value))} disabled={!canWrite} />
          </label>
          <label>
            แจ้งหัวหน้าเมื่อยังไม่เช็กอิน (นาทีหลังเริ่มกะ)
            <input type="number" min={0} value={rules.checkInEscalationMinutes} onChange={(e) => update('checkInEscalationMinutes', Number(e.target.value))} disabled={!canWrite} />
          </label>
          <label>
            แจ้งเตือนใกล้ครบเวลาพัก (นาทีก่อนครบเวลาที่กำหนด)
            <input type="number" min={0} value={rules.breakPreReminderMinutes} onChange={(e) => update('breakPreReminderMinutes', Number(e.target.value))} disabled={!canWrite} />
          </label>
          <label>
            แจ้งเตือนครบเวลาพัก (นาทีหลังเริ่มพัก)
            <input type="number" min={0} value={rules.breakReminderMinutes} onChange={(e) => update('breakReminderMinutes', Number(e.target.value))} disabled={!canWrite} />
          </label>
          <label>
            แจ้งหัวหน้าเมื่อไม่กลับจากพัก (นาที)
            <input type="number" min={0} value={rules.breakEscalationMinutes} onChange={(e) => update('breakEscalationMinutes', Number(e.target.value))} disabled={!canWrite} />
          </label>
          <label>
            เตือนเช็กเอาต์ (นาทีหลังเลิกกะ)
            <input type="number" min={0} value={rules.checkOutReminderMinutes} onChange={(e) => update('checkOutReminderMinutes', Number(e.target.value))} disabled={!canWrite} />
          </label>
          <label>
            แจ้งหัวหน้าเมื่อยังไม่เช็กเอาต์ (นาที)
            <input type="number" min={0} value={rules.checkOutEscalationMinutes} onChange={(e) => update('checkOutEscalationMinutes', Number(e.target.value))} disabled={!canWrite} />
          </label>
        </section>

        <section>
          <h2>กรณีไม่ลงเวลา</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.missingCheckInAllowed}
              onChange={(e) => update('missingCheckInAllowed', e.target.checked)}
              disabled={!canWrite}
            />
            อนุญาตไม่เช็กอิน
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.missingCheckOutAllowed}
              onChange={(e) => update('missingCheckOutAllowed', e.target.checked)}
              disabled={!canWrite}
            />
            อนุญาตไม่เช็กเอาต์
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.autoCloseMissingCheckOut}
              onChange={(e) => update('autoCloseMissingCheckOut', e.target.checked)}
              disabled={!canWrite}
            />
            ปิดเช็กเอาต์อัตโนมัติเมื่อไม่ลงเวลา
          </label>
        </section>

        {validationError && <p className="error-text">{validationError}</p>}
        {saved && <p className="success-text">บันทึกการตั้งค่าแล้ว</p>}

        {canWrite && (
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกกฎเวลาเข้างาน'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
