import { useCallback, useEffect, useState } from 'react';
import { fetchCompanies } from '../../../api/client';
import {
  fetchSharedPayrollInfo,
  updateSharedPayrollSettings,
  type SharedPayrollInfo,
} from '../../../api/shared-payroll';
import { useAuth } from '../../../context/AuthContext';
import { th } from '../../../i18n/th-labels';
import { WorkHQButton, WorkHQCard } from '../../ui';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

interface Props {
  employeeId: string;
  compact?: boolean;
}

export function EmployeeSharedPayrollSection({ employeeId, compact = false }: Props) {
  const { can } = useAuth();
  const canEdit = can('payroll:write');
  const [info, setInfo] = useState<SharedPayrollInfo | null>(null);
  const [companies, setCompanies] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!compact);
  const [masterSalary, setMasterSalary] = useState('');
  const [depositCompanyId, setDepositCompanyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [row, companyList] = await Promise.all([
        fetchSharedPayrollInfo(employeeId),
        canEdit ? fetchCompanies() : Promise.resolve([]),
      ]);
      setInfo(row);
      setMasterSalary(row.masterMonthlySalary != null ? String(row.masterMonthlySalary) : '');
      setDepositCompanyId(row.depositCollectionCompanyId ?? '');
      setCompanies(companyList);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [canEdit, employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <WorkHQCard title={th.sharedPayroll.sectionTitle} className="whq-detail-card">
        <p className="whq-muted">{th.common.loading}</p>
      </WorkHQCard>
    );
  }

  if (!info?.qualifies && info?.mode !== 'shared_across_companies') {
    return null;
  }

  const isShared = info.mode === 'shared_across_companies';
  const master = info.masterMonthlySalary ?? 0;

  async function save() {
    const amount = Math.round(Number(masterSalary));
    if (!Number.isFinite(amount) || amount < 1) {
      setError('กรุณากรอกเงินเดือนรวมอย่างน้อย 1 บาท');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSharedPayrollSettings(employeeId, {
        masterMonthlySalary: amount,
        depositCollectionCompanyId: depositCompanyId || null,
      });
      setInfo(updated);
      setMasterSalary(updated.masterMonthlySalary != null ? String(updated.masterMonthlySalary) : '');
      setDepositCompanyId(updated.depositCollectionCompanyId ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkHQCard
      title={th.sharedPayroll.sectionTitle}
      className="whq-detail-card whq-detail-card--wide"
      data-testid="employee-shared-payroll-section"
    >
      <p className="whq-muted">{th.sharedPayroll.sectionDesc}</p>

      <div className="whq-deposit-summary-strip whq-mb-md">
        <div className="whq-deposit-summary-item">
          <span className="whq-deposit-summary-label">โหมด</span>
          <strong>{isShared ? 'แบ่งตามบริษัท' : 'มาตรฐาน (ยังไม่ migrate)'}</strong>
        </div>
        {master > 0 && (
          <>
            <div className="whq-deposit-summary-item">
              <span className="whq-deposit-summary-label">เงินเดือนรวม</span>
              <strong>฿{formatMoney(master)}</strong>
            </div>
            {info.perCompanySalary != null && (
              <div className="whq-deposit-summary-item">
                <span className="whq-deposit-summary-label">
                  ต่อบริษัท ({info.activeCompanyCount} แห่ง)
                </span>
                <strong>฿{formatMoney(info.perCompanySalary)}</strong>
              </div>
            )}
          </>
        )}
      </div>

      {error && <p className="whq-error">{error}</p>}

      {canEdit ? (
        <>
          {compact && (
            <div className="whq-btn-group whq-mb-md">
              <WorkHQButton type="button" variant="secondary" onClick={() => setShowForm((v) => !v)}>
                {showForm ? 'ซ่อนฟอร์ม' : 'แก้ไขเงินเดือนรวม'}
              </WorkHQButton>
            </div>
          )}
          {showForm && (
            <div className="whq-form-grid whq-form-grid--2">
              <label className="whq-field">
                <span className="whq-field-label">{th.addEmployee.sharedMonthlySalary}</span>
                <input
                  className="whq-input"
                  type="number"
                  min={1}
                  value={masterSalary}
                  onChange={(e) => setMasterSalary(e.target.value)}
                />
                {info.perCompanySalary != null && masterSalary && (
                  <p className="whq-muted whq-text-sm whq-mt-sm">
                    {th.addEmployee.sharedMonthlySalaryHint(
                      Math.round(Number(masterSalary)) || 0,
                      info.perCompanySalary,
                      info.activeCompanyCount,
                    )}
                  </p>
                )}
              </label>
              <label className="whq-field">
                <span className="whq-field-label">{th.addEmployee.depositCollectionCompany}</span>
                <select
                  className="whq-input"
                  value={depositCompanyId}
                  onChange={(e) => setDepositCompanyId(e.target.value)}
                >
                  <option value="">— เลือกบริษัท —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
                <p className="whq-muted whq-text-sm whq-mt-sm">
                  {th.addEmployee.depositCollectionCompanyHint}
                </p>
              </label>
              <div className="whq-btn-group">
                <WorkHQButton type="button" variant="primary" disabled={saving} onClick={() => void save()}>
                  {saving ? th.common.saving : 'บันทึก'}
                </WorkHQButton>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="whq-muted">ติดต่อ HR หากต้องการปรับเงินเดือนรวม</p>
      )}
    </WorkHQCard>
  );
}
