import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPut } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useScopedCompanyId } from '../../hooks/useScopedCompanyId';
import { CompanyScopePicker, WorkHQSelectCompanyState } from '../../components/workhq';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';

type ReferralPayoutMode = 'one_time';

interface ReferralRules {
  rewardAmount: number;
  requiredEmploymentDays: number;
  payoutMode: ReferralPayoutMode;
  autoCreatePayrollItem: boolean;
  allowMultipleReferrals: boolean;
  duplicateCheckEnabled: boolean;
}

interface SettingRow {
  key: string;
  value: ReferralRules;
}

const DEFAULT_RULES: ReferralRules = {
  rewardAmount: 2000,
  requiredEmploymentDays: 90,
  payoutMode: 'one_time',
  autoCreatePayrollItem: true,
  allowMultipleReferrals: true,
  duplicateCheckEnabled: true,
};

function validateRules(rules: ReferralRules): string | null {
  if (rules.rewardAmount < 0) return 'จำนวนเงินรางวัลต้องไม่ติดลบ';
  if (rules.requiredEmploymentDays < 0) return 'จำนวนวันทำงานขั้นต่ำต้องไม่ติดลบ';
  if (rules.payoutMode !== 'one_time') return 'รูปแบบจ่ายต้องเป็นจ่ายครั้งเดียว';
  return null;
}

export default function ReferralSettingsPage() {
  const {
    companyId,
    hasCompanyScope,
    needsLocalPicker,
    setLocalCompanyId,
    companies,
    scopedCompanyIds,
  } = useScopedCompanyId();
  const { can } = useAuth();
  const [rules, setRules] = useState<ReferralRules>(DEFAULT_RULES);
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
      const rows = await apiGet<SettingRow[]>('/settings/referral', { companyId });
      const row = rows.find((r) => r.key === 'rules');
      if (row?.value && typeof row.value === 'object') {
        setRules({ ...DEFAULT_RULES, ...(row.value as ReferralRules) });
      } else {
        const systemRows = await apiGet<SettingRow[]>('/settings/referral', { companyId: 'system' });
        const systemRow = systemRows.find((r) => r.key === 'rules');
        if (systemRow?.value && typeof systemRow.value === 'object') {
          setRules({ ...DEFAULT_RULES, ...(systemRow.value as ReferralRules) });
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

  function update<K extends keyof ReferralRules>(key: K, value: ReferralRules[K]) {
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
      await apiPut('/settings/referral/rules', { value: rules }, { companyId });
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
          <h1>ตั้งค่าแนะนำเพื่อน</h1>
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
        กำหนดเงินรางวัลและเงื่อนไขการได้รับโบนัส — ทุกการเปลี่ยนแปลงมีประวัติบันทึก
      </p>

      <form className="form-grid settings-form-sections" onSubmit={onSubmit}>
        <section>
          <h2>รางวัล</h2>
          <label>
            จำนวนเงินรางวัล (บาท)
            <input
              type="number"
              min={0}
              value={rules.rewardAmount}
              onChange={(e) => update('rewardAmount', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
          <label>
            ต้องทำงานครบกี่วัน
            <input
              type="number"
              min={0}
              value={rules.requiredEmploymentDays}
              onChange={(e) => update('requiredEmploymentDays', Number(e.target.value))}
              disabled={!canWrite}
            />
          </label>
          <label>
            รูปแบบการจ่าย
            <select
              value={rules.payoutMode}
              onChange={(e) => update('payoutMode', e.target.value as ReferralPayoutMode)}
              disabled={!canWrite}
            >
              <option value="one_time">จ่ายครั้งเดียว</option>
            </select>
          </label>
        </section>

        <section>
          <h2>พฤติกรรมระบบ</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.autoCreatePayrollItem}
              onChange={(e) => update('autoCreatePayrollItem', e.target.checked)}
              disabled={!canWrite}
            />
            สร้างรายการในเงินเดือนอัตโนมัติ
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.allowMultipleReferrals}
              onChange={(e) => update('allowMultipleReferrals', e.target.checked)}
              disabled={!canWrite}
            />
            อนุญาตแนะนำหลายคน
            <span className="muted"> (สำรอง — ยังไม่เชื่อมระบบ)</span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rules.duplicateCheckEnabled}
              onChange={(e) => update('duplicateCheckEnabled', e.target.checked)}
              disabled={!canWrite}
            />
            ตรวจสอบข้อมูลซ้ำ
          </label>
        </section>

        {validationError && <p className="error-text">{validationError}</p>}
        {saved && <p className="success-text">บันทึกการตั้งค่าแล้ว</p>}

        {canWrite && (
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'กำลังบันทึก…' : 'บันทึกกฎแนะนำเพื่อน'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
