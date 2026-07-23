import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPut } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useScopedCompanyId } from '../../hooks/useScopedCompanyId';
import { CompanyScopePicker, WorkHQSelectCompanyState } from '../../components/workhq';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';

interface NewEmployeeEmergencyLeave {
  remainingHalfYearAtLeastMonths: number;
  daysIfAtLeastThreshold: number;
  daysIfBelowThreshold: number;
}

interface AbsencePenalties {
  employee: number;
  subLeader: number;
  bigLeader: number;
  secretary: number;
}

interface LeaveRules {
  monthlyOffDays: number;
  minimumRecommendedOffDays: number;
  unusedOffDayBonusAmount: number;
  unusedOffDayBonusCap: number;
  defaultLeaveNoticeDays: number;
  unpaidLeaveNoticeDays: number;
  emergencyLeaveEnabled: boolean;
  emergencyLeaveEligibilityMonths: number;
  emergencyLeaveDaysPerHalfYear: number;
  newEmployeeEmergencyLeave: NewEmployeeEmergencyLeave;
  sickLeaveRequiresCertificateAfterDays: number;
  sickLeaveAdjacentToOffDayRequiresCertificate: boolean;
  rescheduleNoticeDays: number;
  maxReschedulesPerRequest: number;
  rescheduleMustMoveForward: boolean;
  rescheduleMustKeepSameDuration: boolean;
  allowSplitFullDayLeave: boolean;
  emergencyRescheduleExceptionAllowed: boolean;
  shiftSwapNoticeDays: number;
  shiftSwapRequiresBothConsent: boolean;
  shiftSwapRequiresManagementApproval: boolean;
  consecutiveLeavePenaltyEnabled: boolean;
  consecutiveLeaveBaseDays: number;
  additionalConsecutiveLeavePenaltyLaborUnits: number;
  absencePenalties: AbsencePenalties;
  minRescheduleReasonLength: number;
  excessOffDayNoticeDays: number;
  excessOffDayAdvanceDailyMultiplier: number;
  excessOffDaySuddenDailyMultiplier: number;
}

interface SettingRow {
  key: string;
  value: LeaveRules;
}

const DEFAULT_RULES: LeaveRules = {
  monthlyOffDays: 4,
  minimumRecommendedOffDays: 2,
  unusedOffDayBonusAmount: 600,
  unusedOffDayBonusCap: 1200,
  defaultLeaveNoticeDays: 7,
  unpaidLeaveNoticeDays: 7,
  emergencyLeaveEnabled: true,
  emergencyLeaveEligibilityMonths: 3,
  emergencyLeaveDaysPerHalfYear: 4,
  newEmployeeEmergencyLeave: {
    remainingHalfYearAtLeastMonths: 3,
    daysIfAtLeastThreshold: 2,
    daysIfBelowThreshold: 1,
  },
  sickLeaveRequiresCertificateAfterDays: 1,
  sickLeaveAdjacentToOffDayRequiresCertificate: true,
  rescheduleNoticeDays: 7,
  maxReschedulesPerRequest: 1,
  rescheduleMustMoveForward: true,
  rescheduleMustKeepSameDuration: true,
  allowSplitFullDayLeave: false,
  emergencyRescheduleExceptionAllowed: true,
  shiftSwapNoticeDays: 7,
  shiftSwapRequiresBothConsent: true,
  shiftSwapRequiresManagementApproval: true,
  consecutiveLeavePenaltyEnabled: true,
  consecutiveLeaveBaseDays: 2,
  additionalConsecutiveLeavePenaltyLaborUnits: 5,
  absencePenalties: { employee: 1000, subLeader: 2000, bigLeader: 3000, secretary: 3000 },
  minRescheduleReasonLength: 10,
  excessOffDayNoticeDays: 7,
  excessOffDayAdvanceDailyMultiplier: 1,
  excessOffDaySuddenDailyMultiplier: 2,
};

function validateRules(rules: LeaveRules): string | null {
  if (rules.monthlyOffDays < rules.minimumRecommendedOffDays) {
    return 'วันหยุดประจำเดือนต้องไม่น้อยกว่าวันหยุดขั้นต่ำที่แนะนำ';
  }
  const checks: [string, boolean][] = [
    ['วันหยุดประจำเดือนต้องไม่ติดลบ', rules.monthlyOffDays >= 0],
    ['วันแจ้งล่วงหน้าต้องไม่ติดลบ', rules.rescheduleNoticeDays >= 0],
    ['จำนวนครั้งเลื่อนต้องไม่ติดลบ', rules.maxReschedulesPerRequest >= 0],
    ['ค่าปรับขาดงานต้องไม่ติดลบ', rules.absencePenalties.employee >= 0],
  ];
  const failed = checks.find(([, ok]) => !ok);
  return failed ? failed[0] : null;
}

export default function LeaveSettingsPage() {
  const {
    companyId,
    hasCompanyScope,
    needsLocalPicker,
    setLocalCompanyId,
    companies,
    scopedCompanyIds,
  } = useScopedCompanyId();
  const { can } = useAuth();
  const [rules, setRules] = useState<LeaveRules>(DEFAULT_RULES);
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
      const rows = await apiGet<SettingRow[]>('/settings/leave', { companyId });
      const row = rows.find((r) => r.key === 'rules');
      if (row?.value) {
        setRules({
          ...DEFAULT_RULES,
          ...row.value,
          newEmployeeEmergencyLeave: {
            ...DEFAULT_RULES.newEmployeeEmergencyLeave,
            ...row.value.newEmployeeEmergencyLeave,
          },
          absencePenalties: {
            ...DEFAULT_RULES.absencePenalties,
            ...row.value.absencePenalties,
          },
        });
      } else {
        const systemRows = await apiGet<SettingRow[]>('/settings/leave', { companyId: 'system' });
        const systemRow = systemRows.find((r) => r.key === 'rules');
        if (systemRow?.value) {
          setRules({
            ...DEFAULT_RULES,
            ...systemRow.value,
            newEmployeeEmergencyLeave: {
              ...DEFAULT_RULES.newEmployeeEmergencyLeave,
              ...systemRow.value.newEmployeeEmergencyLeave,
            },
            absencePenalties: {
              ...DEFAULT_RULES.absencePenalties,
              ...systemRow.value.absencePenalties,
            },
          });
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

  function update<K extends keyof LeaveRules>(key: K, value: LeaveRules[K]) {
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
      await apiPut('/settings/leave/rules', { value: rules }, { companyId });
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
          <h1>ตั้งค่าการลา</h1>
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
      <p className="muted">ค่าที่บริษัทกำหนดจะแทนค่าเริ่มต้นของระบบ — ทุกการเปลี่ยนแปลงมีประวัติบันทึก</p>

      <form className="form-grid settings-form-sections" onSubmit={onSubmit}>
        <section>
          <h2>วันหยุดประจำเดือน</h2>
          <label>จำนวนวันหยุดต่อเดือน<input type="number" min={0} value={rules.monthlyOffDays} onChange={(e) => update('monthlyOffDays', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>วันหยุดขั้นต่ำที่แนะนำ<input type="number" min={0} value={rules.minimumRecommendedOffDays} onChange={(e) => update('minimumRecommendedOffDays', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>โบนัสวันหยุดไม่ใช้ (บาท/วัน)<input type="number" min={0} value={rules.unusedOffDayBonusAmount} onChange={(e) => update('unusedOffDayBonusAmount', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>เพดานโบนัสวันหยุดไม่ใช้ (บาท)<input type="number" min={0} value={rules.unusedOffDayBonusCap} onChange={(e) => update('unusedOffDayBonusCap', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>แจ้งล่วงหน้าวันหยุดเกินโควต้า (วัน)<input type="number" min={0} value={rules.excessOffDayNoticeDays} onChange={(e) => update('excessOffDayNoticeDays', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>ตัวคูณหัก (แจ้งล่วงหน้าครบ)<input type="number" min={0} step={0.5} value={rules.excessOffDayAdvanceDailyMultiplier} onChange={(e) => update('excessOffDayAdvanceDailyMultiplier', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>ตัวคูณหัก (แจ้งไม่ครบ)<input type="number" min={0} step={0.5} value={rules.excessOffDaySuddenDailyMultiplier} onChange={(e) => update('excessOffDaySuddenDailyMultiplier', Number(e.target.value))} disabled={!canWrite} /></label>
          <p className="muted">วันหยุดเกินโควต้า: แจ้งล่วงหน้าครบกำหนด = คูณค่าแรงรายวัน (เท่า) แจ้งไม่ครบ = คูณอัตรากระทันหัน — นับจากวันที่ส่งคำขอถึงวันหยุด</p>
        </section>

        <section>
          <h2>ระยะแจ้งล่วงหน้า</h2>
          <p className="muted">นับจากวันที่ส่งคำขอ (ไม่ใช่วันที่อนุมัติ)</p>
          <label>ลาทั่วไป (วัน)<input type="number" min={0} value={rules.defaultLeaveNoticeDays} onChange={(e) => update('defaultLeaveNoticeDays', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>ลาไม่รับค่าจ้าง (วัน)<input type="number" min={0} value={rules.unpaidLeaveNoticeDays} onChange={(e) => update('unpaidLeaveNoticeDays', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>เลื่อนวันลา (วัน)<input type="number" min={0} value={rules.rescheduleNoticeDays} onChange={(e) => update('rescheduleNoticeDays', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>สลับกะ (วัน)<input type="number" min={0} value={rules.shiftSwapNoticeDays} onChange={(e) => update('shiftSwapNoticeDays', Number(e.target.value))} disabled={!canWrite} /></label>
        </section>

        <section>
          <h2>ลาฉุกเฉิน</h2>
          <label className="checkbox-row"><input type="checkbox" checked={rules.emergencyLeaveEnabled} onChange={(e) => update('emergencyLeaveEnabled', e.target.checked)} disabled={!canWrite} />เปิดใช้งาน</label>
          <label>อายุงานขั้นต่ำ (เดือน)<input type="number" min={0} value={rules.emergencyLeaveEligibilityMonths} onChange={(e) => update('emergencyLeaveEligibilityMonths', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>วันต่อครึ่งปี<input type="number" min={0} value={rules.emergencyLeaveDaysPerHalfYear} onChange={(e) => update('emergencyLeaveDaysPerHalfYear', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>พนักงานใหม่ — เกณฑ์เดือน<input type="number" min={0} value={rules.newEmployeeEmergencyLeave.remainingHalfYearAtLeastMonths} onChange={(e) => update('newEmployeeEmergencyLeave', { ...rules.newEmployeeEmergencyLeave, remainingHalfYearAtLeastMonths: Number(e.target.value) })} disabled={!canWrite} /></label>
          <label>วันลา (ถึงเกณฑ์)<input type="number" min={0} value={rules.newEmployeeEmergencyLeave.daysIfAtLeastThreshold} onChange={(e) => update('newEmployeeEmergencyLeave', { ...rules.newEmployeeEmergencyLeave, daysIfAtLeastThreshold: Number(e.target.value) })} disabled={!canWrite} /></label>
          <label>วันลา (ต่ำกว่าเกณฑ์)<input type="number" min={0} value={rules.newEmployeeEmergencyLeave.daysIfBelowThreshold} onChange={(e) => update('newEmployeeEmergencyLeave', { ...rules.newEmployeeEmergencyLeave, daysIfBelowThreshold: Number(e.target.value) })} disabled={!canWrite} /></label>
        </section>

        <section>
          <h2>ลาป่วย</h2>
          <label>ต้องมีใบรับรองหลังกี่วัน<input type="number" min={0} value={rules.sickLeaveRequiresCertificateAfterDays} onChange={(e) => update('sickLeaveRequiresCertificateAfterDays', Number(e.target.value))} disabled={!canWrite} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={rules.sickLeaveAdjacentToOffDayRequiresCertificate} onChange={(e) => update('sickLeaveAdjacentToOffDayRequiresCertificate', e.target.checked)} disabled={!canWrite} />ติดวันหยุดต้องมีใบรับรอง</label>
        </section>

        <section>
          <h2>เลื่อนวันลา</h2>
          <label>เลื่อนได้สูงสุดกี่ครั้งต่อคำขอ<input type="number" min={0} value={rules.maxReschedulesPerRequest} onChange={(e) => update('maxReschedulesPerRequest', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>เหตุผลขั้นต่ำ (ตัวอักษร)<input type="number" min={0} value={rules.minRescheduleReasonLength} onChange={(e) => update('minRescheduleReasonLength', Number(e.target.value))} disabled={!canWrite} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={rules.rescheduleMustMoveForward} onChange={(e) => update('rescheduleMustMoveForward', e.target.checked)} disabled={!canWrite} />เลื่อนไปข้างหน้าเท่านั้น</label>
          <label className="checkbox-row"><input type="checkbox" checked={rules.rescheduleMustKeepSameDuration} onChange={(e) => update('rescheduleMustKeepSameDuration', e.target.checked)} disabled={!canWrite} />จำนวนวันเท่าเดิม</label>
          <label className="checkbox-row"><input type="checkbox" checked={rules.allowSplitFullDayLeave} onChange={(e) => update('allowSplitFullDayLeave', e.target.checked)} disabled={!canWrite} />อนุญาตแบ่งลาเต็มวัน</label>
          <label className="checkbox-row"><input type="checkbox" checked={rules.emergencyRescheduleExceptionAllowed} onChange={(e) => update('emergencyRescheduleExceptionAllowed', e.target.checked)} disabled={!canWrite} />ยกเว้นกรณีฉุกเฉิน</label>
        </section>

        <section>
          <h2>สลับกะ</h2>
          <label className="checkbox-row"><input type="checkbox" checked={rules.shiftSwapRequiresBothConsent} onChange={(e) => update('shiftSwapRequiresBothConsent', e.target.checked)} disabled={!canWrite} />ต้องยินยอมทั้งสองฝ่าย</label>
          <label className="checkbox-row"><input type="checkbox" checked={rules.shiftSwapRequiresManagementApproval} onChange={(e) => update('shiftSwapRequiresManagementApproval', e.target.checked)} disabled={!canWrite} />ต้องอนุมัติจากผู้บริหาร</label>
        </section>

        <section>
          <h2>ค่าปรับ</h2>
          <label className="checkbox-row"><input type="checkbox" checked={rules.consecutiveLeavePenaltyEnabled} onChange={(e) => update('consecutiveLeavePenaltyEnabled', e.target.checked)} disabled={!canWrite} />หักกรณีลาติดกัน</label>
          <label>ลาติดกันเกินกี่วันเริ่มหัก<input type="number" min={0} value={rules.consecutiveLeaveBaseDays} onChange={(e) => update('consecutiveLeaveBaseDays', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>หน่วยแรงงานเพิ่ม<input type="number" min={0} value={rules.additionalConsecutiveLeavePenaltyLaborUnits} onChange={(e) => update('additionalConsecutiveLeavePenaltyLaborUnits', Number(e.target.value))} disabled={!canWrite} /></label>
          <label>ปรับขาดงาน — พนักงาน (บาท)<input type="number" min={0} value={rules.absencePenalties.employee} onChange={(e) => update('absencePenalties', { ...rules.absencePenalties, employee: Number(e.target.value) })} disabled={!canWrite} /></label>
          <label>ปรับขาดงาน — หัวหน้าย่อย (บาท)<input type="number" min={0} value={rules.absencePenalties.subLeader} onChange={(e) => update('absencePenalties', { ...rules.absencePenalties, subLeader: Number(e.target.value) })} disabled={!canWrite} /></label>
          <label>ปรับขาดงาน — หัวหน้าใหญ่ (บาท)<input type="number" min={0} value={rules.absencePenalties.bigLeader} onChange={(e) => update('absencePenalties', { ...rules.absencePenalties, bigLeader: Number(e.target.value) })} disabled={!canWrite} /></label>
          <label>ปรับขาดงาน — เลขา (บาท)<input type="number" min={0} value={rules.absencePenalties.secretary ?? 3000} onChange={(e) => update('absencePenalties', { ...rules.absencePenalties, secretary: Number(e.target.value) })} disabled={!canWrite} /></label>
          <p className="muted">ตำแหน่งเจ้าของไม่ถูกนับขาดงานและไม่ถูกหักเงิน</p>
        </section>

        {validationError && <p className="error-text">{validationError}</p>}
        {saved && <p className="success-text">บันทึกการตั้งค่าแล้ว</p>}
        {canWrite && (
          <div className="form-actions">
            <button type="submit" disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึกกฎการลา'}</button>
          </div>
        )}
      </form>
    </div>
  );
}
