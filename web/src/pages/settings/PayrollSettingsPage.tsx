import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPut } from '../../api/client';
import { migrateSharedPayrollEmployees, reconcileSharedPayroll } from '../../api/shared-payroll';
import { useAuth } from '../../context/AuthContext';
import { useScopedCompanyId } from '../../hooks/useScopedCompanyId';
import { CompanyScopePicker, WorkHQSelectCompanyState } from '../../components/workhq';import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { th } from '../../i18n/th-labels';

interface PayrollRules {
  mealAllowancePerDay: number;
  crossBorderAllowancePerDay: number;
}

interface SettingRow {
  key: string;
  value: PayrollRules & { crossBorderAllowancePerMonth?: number };
}

const DEFAULT_RULES: PayrollRules = {
  mealAllowancePerDay: 100,
  crossBorderAllowancePerDay: 100,
};

function normalizeRules(value: SettingRow['value'] | undefined): PayrollRules {
  if (!value) return { ...DEFAULT_RULES };
  const legacyMonthly = value.crossBorderAllowancePerMonth;
  const perDay = typeof value.crossBorderAllowancePerDay === 'number'
    ? value.crossBorderAllowancePerDay
    : typeof legacyMonthly === 'number' && legacyMonthly < 500
      ? legacyMonthly
      : DEFAULT_RULES.crossBorderAllowancePerDay;
  return {
    mealAllowancePerDay: value.mealAllowancePerDay ?? DEFAULT_RULES.mealAllowancePerDay,
    crossBorderAllowancePerDay: perDay,
  };
}

export default function PayrollSettingsPage() {
  const {
    companyId,
    hasCompanyScope,
    needsLocalPicker,
    setLocalCompanyId,
    companies,
    scopedCompanyIds,
  } = useScopedCompanyId();
  const { can } = useAuth();
  const [rules, setRules] = useState<PayrollRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [sharedBusy, setSharedBusy] = useState(false);
  const [sharedMessage, setSharedMessage] = useState<string | null>(null);
  const canWrite = can('settings:write');
  const canPayrollWrite = can('payroll:write');

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      const rows = await apiGet<SettingRow[]>('/settings/payroll', { companyId });
      const row = rows.find((r) => r.key === 'rules');
      if (row?.value) {
        setRules(normalizeRules(row.value));
      } else {
        const systemRows = await apiGet<SettingRow[]>('/settings/payroll', { companyId: 'system' });
        const systemRow = systemRows.find((r) => r.key === 'rules');
        setRules(normalizeRules(systemRow?.value));
      }
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [companyId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !canWrite) return;
    if (rules.mealAllowancePerDay < 0) {
      setValidationError('ค่าอาหารต่อวันต้องไม่ติดลบ');
      return;
    }
    if (rules.crossBorderAllowancePerDay < 0) {
      setValidationError('ค่าข้ามต่อวันต้องไม่ติดลบ');
      return;
    }
    setSaving(true);
    try {
      await apiPut('/settings/payroll/rules', { value: rules }, { companyId });
      setSaved(true);
      setValidationError(null);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  async function onReconcileShared() {
    setSharedBusy(true);
    setSharedMessage(null);
    try {
      const res = await reconcileSharedPayroll();
      setSharedMessage(`ซิงค์พนักงานเงินเดือนรวม ${res.employeesUpdated} คน`);
    } catch (err) {
      setSharedMessage(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setSharedBusy(false);
    }
  }

  async function onMigrateShared() {
    if (!window.confirm('ย้ายพนักงานแอดมินที่เข้าเกณฑ์เป็นโหมดเงินเดือนรวม?')) return;
    setSharedBusy(true);
    setSharedMessage(null);
    try {
      const rows = await migrateSharedPayrollEmployees();
      const migrated = rows.filter((r) => r.migrated).length;
      setSharedMessage(`migrate สำเร็จ ${migrated} จาก ${rows.length} คน`);
    } catch (err) {
      setSharedMessage(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setSharedBusy(false);
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
          <h1>ตั้งค่าเงินเดือน</h1>
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
        รอบเงินเดือนนับจากวันที่ 25 ถึงวันที่ 24 ของเดือนถัดไป — ค่าที่บริษัทกำหนดจะแทนค่าเริ่มต้นของระบบ
      </p>

      <form className="form-grid settings-form-sections" onSubmit={onSubmit}>
        <section>
          <h2>เบี้ยเลี้ยง &amp; สวัสดิการ</h2>
          <label>
            ค่าอาหารต่อวันออฟฟิศ (บาท)
            <input
              type="number"
              min={0}
              value={rules.mealAllowancePerDay}
              onChange={(e) => {
                setRules({ ...rules, mealAllowancePerDay: Number(e.target.value) });
                setSaved(false);
                setValidationError(null);
              }}
              disabled={!canWrite}
            />
          </label>
          <p className="muted">
            นับเฉพาะวันที่เช็กอินเป็น Office (วัน WFH ไม่ได้ค่าอาหาร) — วันหยุดประจำเดือนที่อนุมัติแล้วนับรวมได้สูงสุด 4 วัน
          </p>
          <label>
            ค่าข้ามต่อวันออฟฟิศ (บาท)
            <input
              type="number"
              min={0}
              value={rules.crossBorderAllowancePerDay}
              onChange={(e) => {
                setRules({ ...rules, crossBorderAllowancePerDay: Number(e.target.value) });
                setSaved(false);
                setValidationError(null);
              }}
              disabled={!canWrite}
            />
          </label>
          <p className="muted">
            นับเฉพาะวันที่เช็กอินเป็น Office (วัน WFH ไม่ได้ค่าข้าม) — ค่าเริ่มต้น ฿100/วัน
          </p>
        </section>

        {validationError && <p className="error-text">{validationError}</p>}
        {saved && <p className="success-text">บันทึกการตั้งค่าแล้ว</p>}
        {canWrite && (
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกกฎเงินเดือน'}
            </button>
          </div>
        )}
      </form>

      {canPayrollWrite && (
        <section className="settings-form-sections" style={{ marginTop: '2rem' }}>
          <h2>{th.sharedPayroll.migrateTitle}</h2>
          <p className="muted">{th.sharedPayroll.migrateDesc}</p>
          <p className="muted">{th.sharedPayroll.reconcileDesc}</p>
          {sharedMessage && <p className="success-text">{sharedMessage}</p>}
          <div className="form-actions">
            <button type="button" disabled={sharedBusy} onClick={() => void onMigrateShared()}>
              {sharedBusy ? 'กำลังทำงาน…' : th.sharedPayroll.migrateTitle}
            </button>
            <button type="button" disabled={sharedBusy} onClick={() => void onReconcileShared()}>
              {sharedBusy ? 'กำลังทำงาน…' : th.sharedPayroll.reconcileTitle}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
