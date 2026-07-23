import { FormEvent, useEffect, useState } from 'react';
import { useScopedCompanyId } from '../../hooks/useScopedCompanyId';
import { CompanyScopePicker, WorkHQSelectCompanyState } from '../../components/workhq';
import { fetchEmployeeList } from '../../api/employees';
import { listPayrollCycles, type PayrollCycle } from '../../api/payroll';
import {
  calculateAdminCommission,
  fetchAdminCommissionSummary,
  finalizeAdminCommission,
  type AdminCommissionCalculateResult,
} from '../../api/admin-commission';
import { LoadingState } from '../../components/LoadingState';
import {
  WorkHQAlert,
  WorkHQButton,
  WorkHQCard,
  WorkHQField,
  WorkHQInput,
  WorkHQPage,
  WorkHQPageHeader,
  WorkHQSelect,
} from '../../components/ui';
import { th, adminCommissionOfficeTypeLabel } from '../../i18n/th-labels';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function AdminCommissionCalculatePage() {
  const {
    companyId,
    hasCompanyScope,
    needsLocalPicker,
    setLocalCompanyId,
    companies,
    scopedCompanyIds,
  } = useScopedCompanyId();
  const [cycles, setCycles] = useState<PayrollCycle[]>([]);
  const [earnCycleId, setEarnCycleId] = useState('');
  const [netProfit, setNetProfit] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AdminCommissionCalculateResult | null>(null);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!companyId) return;
    void fetchEmployeeList({ companyId, workforceOnly: true })
      .then((rows) => {
        const map: Record<string, string> = {};
        for (const row of rows.items ?? []) {
          const label = [row.globalId, row.firstName, row.lastName].filter(Boolean).join(' · ');
          map[row.id] = label || row.id;
        }
        setEmployeeNames(map);
      })
      .catch(() => setEmployeeNames({}));
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    void listPayrollCycles(companyId)
      .then((rows) => {
        setCycles(rows);
        if (rows[0]) setEarnCycleId(rows[0].id);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [companyId]);

  async function onCalculate(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !earnCycleId) return;
    const profit = Number(netProfit);
    if (!Number.isFinite(profit)) {
      setError('กรุณากรอกกำไรสุทธิ');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const calculated = await calculateAdminCommission({
        companyId,
        earnCycleId,
        netProfit: profit,
      });
      setResult(calculated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFinalize() {
    if (!result?.cycleId) return;
    setBusy(true);
    setError('');
    try {
      const finalized = await finalizeAdminCommission(result.cycleId);
      const summary = companyId && earnCycleId
        ? await fetchAdminCommissionSummary(companyId, earnCycleId)
        : null;
      setResult((prev) => prev ? { ...prev, status: 'finalized' } : prev);
      if (summary) {
        setResult((prev) => prev ? {
          ...prev,
          totalPayable: summary.totalPayable,
          status: 'finalized',
        } : prev);
      }
      setError('');
      alert(`สร้างรายการเงินเดือน ${finalized.payrollItemsCreated} รายการแล้ว`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!hasCompanyScope) {
    return (
      <WorkHQPage shell>
        <WorkHQSelectCompanyState />
      </WorkHQPage>
    );
  }

  if (loading) return <LoadingState label="กำลังโหลดรอบเงินเดือน…" />;

  return (
    <WorkHQPage shell>
      <WorkHQPageHeader
        title={th.adminCommission.calculateTitle}
        subtitle={th.adminCommission.calculateSubtitle}
      />

      {needsLocalPicker ? (
        <CompanyScopePicker
          companies={companies}
          companyIds={scopedCompanyIds}
          value={companyId}
          onChange={setLocalCompanyId}
          label="บริษัทที่คำนวณค่าคอมแอดมิน"
        />
      ) : null}

      {error && <WorkHQAlert message={error} tone="error" autoDismissMs={0} />}

      <form onSubmit={onCalculate}>
        <WorkHQCard title={th.adminCommission.calculateFormTitle}>
          <div className="whq-form-row">
            <WorkHQField label={th.adminCommission.earnCycle}>
              <WorkHQSelect
                required
                value={earnCycleId}
                onChange={(e) => setEarnCycleId(e.target.value)}
              >
                <option value="">เลือกรอบ</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.periodStart} – {c.periodEnd} ({c.status})
                  </option>
                ))}
              </WorkHQSelect>
            </WorkHQField>
            <WorkHQField label={th.adminCommission.netProfit}>
              <WorkHQInput
                type="number"
                required
                min={0}
                step="0.01"
                value={netProfit}
                onChange={(e) => setNetProfit(e.target.value)}
                placeholder="500000"
              />
            </WorkHQField>
          </div>
          <div className="whq-form-actions">
            <WorkHQButton type="submit" variant="primary" disabled={busy || !earnCycleId}>
              {busy ? 'กำลังคำนวณ…' : th.adminCommission.calculateAction}
            </WorkHQButton>
          </div>
        </WorkHQCard>
      </form>

      {result && (
        <WorkHQCard title={th.adminCommission.resultTitle}>
          <p className="whq-muted whq-text-sm">
            สถานะ: {result.status} · สมาชิก {result.memberCount} คน
          </p>
          <div className="whq-form-row whq-mt-md">
            <div><strong>กำไรสุทธิ</strong><br />{formatMoney(result.netProfit)}</div>
            <div><strong>พูลแอดมิน (2%)</strong><br />{formatMoney(result.adminPool)}</div>
            <div><strong>จ่ายรวม</strong><br />{formatMoney(result.totalPayable)}</div>
            <div><strong>Front office</strong><br />{formatMoney(result.frontOfficeTotal)}</div>
            <div><strong>Back office</strong><br />{formatMoney(result.backOfficeTotal)}</div>
          </div>

          <table className="whq-table whq-mt-md">
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>ประเภท</th>
                <th>หักลา</th>
                <th>โบนัสแจก</th>
                <th>จ่าย</th>
              </tr>
            </thead>
            <tbody>
              {result.members.map((m) => (
                <tr key={m.employeeId}>
                  <td>{m.employeeName ?? employeeNames[m.employeeId] ?? m.globalId ?? m.employeeId}</td>
                  <td>{adminCommissionOfficeTypeLabel(m.officeType)}</td>
                  <td>{formatMoney(m.penaltyDeduction)}</td>
                  <td>{formatMoney(m.redistributionBonus)}</td>
                  <td>{formatMoney(m.finalPayout)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {result.status !== 'finalized' && (
            <div className="whq-form-actions whq-mt-md">
              <WorkHQButton type="button" variant="primary" disabled={busy} onClick={() => void onFinalize()}>
                {th.adminCommission.finalizeAction}
              </WorkHQButton>
            </div>
          )}
        </WorkHQCard>
      )}
    </WorkHQPage>
  );
}
