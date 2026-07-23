import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPut } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useScopedCompanyId } from '../../hooks/useScopedCompanyId';
import { CompanyScopePicker, WorkHQSelectCompanyState } from '../../components/workhq';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';

interface DepositRules {
  enabled: boolean;
  monthlyDeductionAmount: number;
  maximumBalanceAmount: number;
  minimumNetPayAfterDeposit: number;
  deductionItemType: string;
  refundOnProperResignation: boolean;
  allowPartialRefund: boolean;
  refundRequiresApproval: boolean;
}

interface SettingRow {
  key: string;
  value: DepositRules;
}

const DEFAULT_RULES: DepositRules = {
  enabled: true,
  monthlyDeductionAmount: 500,
  maximumBalanceAmount: 3000,
  minimumNetPayAfterDeposit: 0,
  deductionItemType: 'deposit',
  refundOnProperResignation: true,
  allowPartialRefund: true,
  refundRequiresApproval: true,
};

function validateRules(rules: DepositRules): string | null {
  if (rules.monthlyDeductionAmount < 0) return 'ยอดหักรายเดือนต้องไม่ติดลบ';
  if (rules.maximumBalanceAmount < 0) return 'ยอดสะสมสูงสุดต้องไม่ติดลบ';
  if (!rules.deductionItemType.trim()) return 'กรุณาระบุประเภทรายการหัก';
  if (rules.enabled && rules.maximumBalanceAmount < rules.monthlyDeductionAmount) {
    return 'ยอดสะสมสูงสุดต้องไม่น้อยกว่ายอดหักรายเดือนเมื่อเปิดใช้งาน';
  }
  return null;
}

export default function DepositSettingsPage() {
  const {
    companyId,
    hasCompanyScope,
    needsLocalPicker,
    setLocalCompanyId,
    companies,
    scopedCompanyIds,
  } = useScopedCompanyId();
  const { can } = useAuth();
  const [rules, setRules] = useState<DepositRules>(DEFAULT_RULES);
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
      const rows = await apiGet<SettingRow[]>('/settings/deposit', { companyId });
      const row = rows.find((r) => r.key === 'rules');
      if (row?.value && typeof row.value === 'object') {
        setRules({ ...DEFAULT_RULES, ...(row.value as DepositRules) });
      } else {
        const systemRows = await apiGet<SettingRow[]>('/settings/deposit', { companyId: 'system' });
        const systemRow = systemRows.find((r) => r.key === 'rules');
        if (systemRow?.value && typeof systemRow.value === 'object') {
          setRules({ ...DEFAULT_RULES, ...(systemRow.value as DepositRules) });
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

  function update<K extends keyof DepositRules>(key: K, value: DepositRules[K]) {
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
      await apiPut('/settings/deposit/rules', { value: rules }, { companyId });
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
          <h1>ตั้งค่าเงินประกัน</h1>
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
        กำหนดการหักเงินประกันรายเดือนและเพดานยอดสะสม — ทุกการเปลี่ยนแปลงมีประวัติบันทึก
      </p>

      <form className="form-grid settings-form-sections" onSubmit={onSubmit}>
        <section>
          <h2>การหักเงิน</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.enabled}
              onChange={(e) => update('enabled', e.target.checked)}
              disabled={!canWrite}
            />
            เปิดใช้งาน
          </label>
          <label>
            ยอดหักรายเดือน (บาท)
            <input
              type="number"
              min={0}
              value={rules.monthlyDeductionAmount}
              onChange={(e) => update('monthlyDeductionAmount', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
          <label>
            ยอดสะสมสูงสุด (บาท)
            <input
              type="number"
              min={0}
              value={rules.maximumBalanceAmount}
              onChange={(e) => update('maximumBalanceAmount', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
          <label>
            เงินเดือนสุทธิขั้นต่ำหลังหักประกัน (บาท)
            <input
              type="number"
              min={0}
              value={rules.minimumNetPayAfterDeposit}
              onChange={(e) => update('minimumNetPayAfterDeposit', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
          <label>
            ประเภทรายการหัก
            <input
              type="text"
              value={rules.deductionItemType}
              onChange={(e) => update('deductionItemType', e.target.value)}
              disabled={!canWrite}
            />
          </label>
        </section>

        <section>
          <h2>นโยบายคืนเงิน</h2>
          <p className="muted">สำรองสำหรับขั้นตอนลาออก/คืนเงินในอนาคต — บันทึกค่าไว้แล้วแต่ยังไม่เชื่อมระบบ</p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.refundOnProperResignation}
              onChange={(e) => update('refundOnProperResignation', e.target.checked)}
              disabled={!canWrite}
            />
            คืนเมื่อลาออกตามขั้นตอน
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.allowPartialRefund}
              onChange={(e) => update('allowPartialRefund', e.target.checked)}
              disabled={!canWrite}
            />
            อนุญาตคืนบางส่วน
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.refundRequiresApproval}
              onChange={(e) => update('refundRequiresApproval', e.target.checked)}
              disabled={!canWrite}
            />
            ต้องอนุมัติก่อนคืนเงิน
          </label>
        </section>

        {validationError && <p className="error-text">{validationError}</p>}
        {saved && <p className="success-text">บันทึกการตั้งค่าแล้ว</p>}

        {canWrite && (
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกกฎเงินประกัน'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
