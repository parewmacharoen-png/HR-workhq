import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/client';
import {
  defaultPayrollPeriodDates,
  listPayrollCycles,
  openPayrollCycle,
  type PayrollCycle,
} from '../../api/payroll';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { fetchForEachCompany, mergePayrollCycles } from '../../utils/multi-company';
import {
  AppPageLayout,
  WorkHQPageState,
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPermissionDenied,
  WorkHQSelectCompanyState,
} from '../../components/workhq';
import { WorkHQBadge, WorkHQButton, WorkHQCard, WorkHQField, WorkHQDateInput, WorkHQSelect } from '../../components/ui';
import { th } from '../../i18n/th-labels';

type PayrollCycleRow = PayrollCycle & { companyLabel?: string };

function payrollNextAction(status: string): { label: string; hint: string } {
  switch (status) {
    case 'open':
      return { label: 'คำนวณเงินเดือน', hint: 'ขั้นต่อไป: คำนวณและล็อครอบ' };
    case 'locked':
      return { label: 'ส่งออกไฟล์โอน', hint: 'ขั้นต่อไป: ดาวน์โหลดไฟล์โอน' };
    case 'paid':
      return { label: 'ดูรายละเอียด', hint: 'จ่ายเงินเรียบร้อยแล้ว' };
    default:
      return { label: 'จัดการ', hint: '' };
  }
}

export default function PayrollCyclesPage() {
  const navigate = useNavigate();
  const { companies, can } = useAuth();
  const { companyId, isAllCompanies: allCompanies, scopedCompanyIds, hasCompanyScope, companyLabel } = useCompanyScope();
  const [rows, setRows] = useState<PayrollCycleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [openCompanyId, setOpenCompanyId] = useState('');

  const defaults = defaultPayrollPeriodDates();
  const [periodStart, setPeriodStart] = useState(defaults.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaults.periodEnd);
  const [payDate, setPayDate] = useState(defaults.payDate);

  const canRead = can('payroll:read');
  const canWrite = can('payroll:write');
  const companyIds = useMemo(
    () => (allCompanies ? scopedCompanyIds : companyId ? [companyId] : []),
    [allCompanies, scopedCompanyIds, companyId],
  );
  const effectiveOpenCompanyId = allCompanies ? openCompanyId : companyId;

  async function load() {
    if (!hasCompanyScope || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const results = await fetchForEachCompany(companyIds, async (cid) => {
        const cycles = await listPayrollCycles(cid);
        const label = companies.find((c) => c.id === cid)?.name;
        return cycles;
      });
      const labeled = results.map((row) => ({
        companyId: row.companyId,
        companyLabel: companies.find((c) => c.id === row.companyId)?.name,
        result: row.result,
      }));
      setRows(mergePayrollCycles(labeled));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!hasCompanyScope || !canRead) {
      setLoading(false);
      return;
    }
    void load();
  }, [hasCompanyScope, canRead, companyIds.join(',')]);

  useEffect(() => {
    if (!allCompanies && companyId) setOpenCompanyId(companyId);
    else if (allCompanies && !openCompanyId && scopedCompanyIds[0]) {
      setOpenCompanyId(scopedCompanyIds[0]);
    }
  }, [allCompanies, companyId, openCompanyId, scopedCompanyIds]);

  async function handleOpenCycle(e: FormEvent) {
    e.preventDefault();
    if (!effectiveOpenCompanyId) return;
    setOpening(true);
    setOpenError(null);
    try {
      const cycle = await openPayrollCycle({
        companyId: effectiveOpenCompanyId,
        periodStart,
        periodEnd,
        payDate,
      });
      setShowOpenForm(false);
      await load();
      navigate(`/payroll/cycles/${cycle.id}`);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setOpening(false);
    }
  }

  const pageState = !canRead
    ? 'permissionDenied' as const
    : !hasCompanyScope
      ? 'empty' as const
      : loading
        ? 'loading' as const
        : error
          ? 'error' as const
          : rows.length === 0 && !showOpenForm
            ? 'empty' as const
            : 'success' as const;

  const referenceCode = error instanceof ApiError ? error.requestId : undefined;

  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'เงินเดือน' }]}
      title={th.nav.payrollCycles}
      description={`ตรวจสอบและจัดการรอบเงินเดือน${companyLabel ? ` · ${companyLabel}` : ''}`}
      primaryAction={canWrite ? (
        <WorkHQButton type="button" variant="primary" onClick={() => setShowOpenForm((v) => !v)}>
          {showOpenForm ? th.payrollCycle.openCycleCancel : th.payrollCycle.openCycleButton}
        </WorkHQButton>
      ) : undefined}
      secondaryActions={canRead ? (
        <>
          <WorkHQButton to="/hr/compensation-reviews" variant="secondary">
            {th.payrollCycle.compensationLink}
          </WorkHQButton>
          <WorkHQButton to="/commission/admin" variant="secondary">
            ค่าคอมแอดมิน
          </WorkHQButton>
        </>
      ) : undefined}
    >
      <WorkHQPageState
        state={pageState}
        permissionDenied={<WorkHQPermissionDenied />}
        empty={!hasCompanyScope ? <WorkHQSelectCompanyState /> : (
          <WorkHQEmptyState
            icon="💰"
            title="ยังไม่มีรอบเงินเดือน"
            description="เปิดรอบใหม่เมื่อพร้อมคำนวณเงินเดือน"
            action={canWrite ? (
              <WorkHQButton type="button" variant="primary" onClick={() => setShowOpenForm(true)}>
                {th.payrollCycle.openCycleButton}
              </WorkHQButton>
            ) : undefined}
          />
        )}
        error={<WorkHQErrorState referenceCode={referenceCode} onRetry={() => void load()} />}
      >
        {canRead && (
          <WorkHQCard title="เครื่องมือเงินเดือน" className="whq-detail-card whq-mb-md">
            <div className="whq-quick-actions">
              <WorkHQButton to="/commission/admin" variant="primary">
                {th.nav.adminCommission}
              </WorkHQButton>
              {canWrite && (
                <WorkHQButton to="/settings/payroll" variant="secondary">
                  {th.sharedPayroll.migrateTitle}
                </WorkHQButton>
              )}
            </div>
            <p className="whq-muted whq-text-sm whq-mt-sm">
              กรอกกำไรสุทธิต่อบริษัทเพื่อคำนวณค่าคอมแอดมิน · ย้ายพนักงานแอดมินเป็นโหมดเงินเดือนรวมเพื่อเปิดปุ่ม {th.sharedPayroll.consolidatedPayslipShort}
            </p>
          </WorkHQCard>
        )}

        {showOpenForm && canWrite && (
          <WorkHQCard title={th.payrollCycle.openCycleTitle} className="whq-detail-card">
            <form onSubmit={(e) => void handleOpenCycle(e)} className="whq-form-stack">
              {allCompanies && (
                <WorkHQField label="บริษัท">
                  <WorkHQSelect value={openCompanyId} onChange={(e) => setOpenCompanyId(e.target.value)} required>
                    <option value="">เลือกบริษัท…</option>
                    {scopedCompanyIds.map((cid) => {
                      const c = companies.find((row) => row.id === cid);
                      return <option key={cid} value={cid}>{c ? `${c.name} (${c.code})` : cid}</option>;
                    })}
                  </WorkHQSelect>
                </WorkHQField>
              )}
              <WorkHQField label={th.payrollCycle.period}>
                <WorkHQDateInput value={periodStart} onChange={setPeriodStart} required />
                {' — '}
                <WorkHQDateInput value={periodEnd} onChange={setPeriodEnd} required />
              </WorkHQField>
              <WorkHQField label={th.payrollCycle.payDate}>
                <WorkHQDateInput value={payDate} onChange={setPayDate} required />
              </WorkHQField>
              {openError ? <p className="whq-error-text">{openError}</p> : null}
              <div className="whq-quick-actions">
                <WorkHQButton type="submit" variant="primary" disabled={opening || !effectiveOpenCompanyId}>
                  {opening ? '…' : th.payrollCycle.openCycleSubmit}
                </WorkHQButton>
                <WorkHQButton type="button" variant="ghost" onClick={() => setShowOpenForm(false)}>
                  {th.payrollCycle.openCycleCancel}
                </WorkHQButton>
              </div>
            </form>
          </WorkHQCard>
        )}

        <WorkHQCard>
          <div className="whq-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {allCompanies && <th>บริษัท</th>}
                  <th>ช่วงเวลา</th>
                  <th>วันจ่าย</th>
                  <th>สถานะ</th>
                  <th>ขั้นตอนถัดไป</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const next = payrollNextAction(row.status);
                  return (
                  <tr key={row.id}>
                    {allCompanies && <td>{row.companyLabel ?? '—'}</td>}
                    <td>{row.periodStart} — {row.periodEnd}</td>
                    <td>{row.payDate}</td>
                    <td><WorkHQBadge status={row.status} /></td>
                    <td className="whq-muted whq-text-sm">{next.hint}</td>
                    <td>
                      <WorkHQButton to={`/payroll/cycles/${row.id}`} variant="primary">
                        {next.label}
                      </WorkHQButton>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </WorkHQCard>
      </WorkHQPageState>
    </AppPageLayout>
  );
}
