import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  buildPayrollCycle,
  fetchPayrollBuildPreview,
  fetchPayrollCycle,
  generatePayslip,
  lockPayrollCycle,
  markPayrollCyclePaid,
  PayrollBuilderPreview,
  PayrollCycle,
} from '../../api/payroll';
import { downloadPayrollSummaryPdf, downloadConsolidatedPayslipPdf } from '../../api/manual-payroll-items';
import { fetchPayrollOverview, PayrollOverviewSummary } from '../../api/payroll-overview';
import {
  createPayrollExportBatch,
  downloadPayrollExportBatch,
  fetchPayrollExportBatches,
  fetchPayrollExportPreview,
  formatExportException,
  PayrollExportBatch,
  PayrollExportPreview,
} from '../../api/payroll-export';
import { useAuth } from '../../context/AuthContext';
import { usePayrollCycleCompanySync } from '../../hooks/usePayrollCycleCompanySync';
import { ErrorState } from '../../components/ErrorState';
import { FlashMessage } from '../../components/FlashMessage';
import { LoadingState } from '../../components/LoadingState';
import {
  WorkHQAlert,
  WorkHQBadge,
  WorkHQButton,
  WorkHQCard,
  WorkHQPage,
  WorkHQPageHeader,
  WorkHQStatCard,
} from '../../components/ui';
import { th } from '../../i18n/th-labels';
import { ManualPayrollItemBuilder } from '../../components/payroll/ManualPayrollItemBuilder';
import { PayrollCycleWizard } from '../../components/payroll/PayrollCycleWizard';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

export default function PayrollCycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can, user } = useAuth();
  const canRead = can('payroll:read');
  const canWrite = can('payroll:write');
  const canViewOverview = canRead
    && (user?.businessRole === 'owner'
      || user?.businessRole === 'secretary'
      || user?.businessRole === 'big_leader');
  const canExport = can('payroll:read')
    && (user?.businessRole === 'owner' || user?.businessRole === 'secretary');
  const isOwner = user?.businessRole === 'owner';

  const [cycle, setCycle] = useState<PayrollCycle | null>(null);
  const [preview, setPreview] = useState<PayrollBuilderPreview | null>(null);
  const [overviewSummary, setOverviewSummary] = useState<PayrollOverviewSummary | null>(null);
  const [exportPreview, setExportPreview] = useState<PayrollExportPreview | null>(null);
  const [exportBatches, setExportBatches] = useState<PayrollExportBatch[]>([]);
  const [activeBatch, setActiveBatch] = useState<PayrollExportBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'preview' | 'build' | 'lock' | 'paid' | 'exportPreview' | 'exportCreate' | 'exportDownload' | 'pdfSummary' | 'payslips' | null>(null);
  const [payslipBusyId, setPayslipBusyId] = useState<string | null>(null);
  const [payslipReadyIds, setPayslipReadyIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<unknown>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!id) return null;
    const row = await fetchPayrollBuildPreview(id);
    setPreview(row);
    return row;
  }, [id]);

  const loadOverviewSummary = useCallback(async () => {
    if (!id || !canViewOverview) return;
    try {
      const overview = await fetchPayrollOverview(id);
      setOverviewSummary(overview.summary);
    } catch {
      setOverviewSummary(null);
    }
  }, [id, canViewOverview]);

  const loadCycle = useCallback(async () => {
    if (!id) return;
    const row = await fetchPayrollCycle(id);
    setCycle(row);
  }, [id]);

  const loadExportHistory = useCallback(async () => {
    if (!id || !canExport) return;
    const batches = await fetchPayrollExportBatches(id);
    setExportBatches(batches);
    const latest = batches.find((batch) => batch.status === 'completed') ?? null;
    setActiveBatch(latest);
  }, [id, canExport]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const row = await fetchPayrollCycle(id);
      setCycle(row);
      if (canExport) {
        await loadExportHistory();
      }
      await loadPreview();
      await loadOverviewSummary();
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id, loadExportHistory, canExport, loadPreview, loadOverviewSummary]);

  useEffect(() => { void load(); }, [load]);

  const {
    syncing: companySyncing,
    scopeMismatch,
    noMatchingCycle,
    cycleCompanyLabel,
    selectedCompanyLabel,
  } = usePayrollCycleCompanySync({ cycle });

  async function runPreview() {
    if (!id) return;
    setBusy('preview');
    try {
      await loadPreview();
      setFlash(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function runCalculate() {
    if (!id) return;
    setBusy('build');
    try {
      await loadPreview();
      const result = await buildPayrollCycle(id);
      setFlash(`คำนวณเงินเดือนเรียบร้อย · พนักงาน ${result.employeesProcessed} คน · อัปเดต ${result.itemsUpdated} รายการ`);
      await loadCycle();
      await loadPreview();
      await loadOverviewSummary();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function runLock() {
    if (!id) return;
    if (!window.confirm('ล็อครอบนี้? หลังล็อคจะแก้ไขรายการเงินเดือนไม่ได้จนกว่าจะเปิดรอบใหม่')) return;
    setBusy('lock');
    try {
      setCycle(await lockPayrollCycle(id));
      let payslipOk = 0;
      let payslipFail = 0;
      const employees = preview?.employees ?? [];
      const done = new Set(payslipReadyIds);
      for (const row of employees) {
        try {
          await generatePayslip(id, row.employeeId);
          payslipOk += 1;
          done.add(row.employeeId);
        } catch {
          payslipFail += 1;
        }
      }
      setPayslipReadyIds(done);
      setFlash(
        payslipOk > 0
          ? `ล็อครอบเรียบร้อย · สร้างสลิป ${payslipOk} คน — พนักงานขอใน Telegram ได้แล้ว`
          : payslipFail > 0
            ? 'ล็อครอบเรียบร้อย แต่ยังสร้างสลิปไม่ได้ (กดคำนวณเงินเดือนก่อน)'
            : 'ล็อครอบเงินเดือนเรียบร้อย — พร้อมส่งออกไฟล์โอนได้',
      );
      await loadOverviewSummary();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function runDownloadSummaryPdf() {
    if (!id) return;
    setBusy('pdfSummary');
    try {
      await downloadPayrollSummaryPdf(id);
      setFlash(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function runPaid() {
    if (!id) return;
    setBusy('paid');
    try {
      setCycle(await markPayrollCyclePaid(id));
      setFlash('ทำเครื่องหมายว่าจ่ายแล้วเรียบร้อย');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function runGenerateAllPayslips() {
    if (!id || !preview?.employees.length) return;
    setBusy('payslips');
    let ok = 0;
    let fail = 0;
    const done = new Set(payslipReadyIds);
    for (const row of preview.employees) {
      try {
        await generatePayslip(id, row.employeeId);
        ok += 1;
        done.add(row.employeeId);
      } catch {
        fail += 1;
      }
    }
    setPayslipReadyIds(done);
    setFlash(th.payrollCycle.payslipGenerateAllSuccess(ok, fail));
    setBusy(null);
  }

  async function runGenerateOnePayslip(employeeId: string) {
    if (!id) return;
    setPayslipBusyId(employeeId);
    try {
      await generatePayslip(id, employeeId);
      setPayslipReadyIds((prev) => new Set(prev).add(employeeId));
      setFlash(th.payrollCycle.payslipGenerateOneSuccess);
    } catch (err) {
      setError(err);
    } finally {
      setPayslipBusyId(null);
    }
  }

  async function runQuickExport() {
    if (!id) return;
    if (activeBatch?.status === 'completed') {
      setBusy('exportDownload');
      try {
        await downloadPayrollExportBatch(activeBatch.id, 'xlsx');
      } catch (err) {
        setError(err);
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy('exportPreview');
    try {
      const previewData = await fetchPayrollExportPreview(id);
      setExportPreview(previewData);
      if (previewData.exceptionCount > 0 && !isOwner) {
        setFlash(th.payrollCycle.exportBlockedNeedOwner);
        return;
      }
      if (previewData.exceptionCount > 0 && isOwner) {
        const ok = window.confirm(
          `มีข้อยกเว้น ${previewData.exceptionCount} รายการ — ยืนยันสร้างไฟล์โอนต่อหรือไม่?`,
        );
        if (!ok) return;
      }
      setBusy('exportCreate');
      const batch = await createPayrollExportBatch(id, {
        confirmExceptions: previewData.exceptionCount > 0 && isOwner,
      });
      setActiveBatch(batch);
      setExportPreview(null);
      setFlash('สร้างไฟล์โอนเรียบร้อย — กำลังดาวน์โหลด…');
      await loadExportHistory();
      if (batch.status === 'completed') {
        setBusy('exportDownload');
        await downloadPayrollExportBatch(batch.id, 'xlsx');
      }
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (message.includes('Owner confirmation')) {
        setFlash(th.payrollCycle.exportBlockedNeedOwner);
      } else {
        setError(err);
      }
    } finally {
      setBusy(null);
    }
  }

  async function runExportPreview() {
    if (!id) return;
    setBusy('exportPreview');
    try {
      setExportPreview(await fetchPayrollExportPreview(id));
      setFlash(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function runExportCreate(confirmExceptions = false) {
    if (!id) return;
    setBusy('exportCreate');
    try {
      const batch = await createPayrollExportBatch(id, { confirmExceptions });
      setActiveBatch(batch);
      setExportPreview(null);
      setFlash(th.payrollCycle.exportCreatedSuccess);
      await loadExportHistory();
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (message.includes('Owner confirmation')) {
        setFlash(th.payrollCycle.exportBlockedNeedOwner);
      } else {
        setError(err);
      }
    } finally {
      setBusy(null);
    }
  }

  async function runExportDownload(format: 'xlsx' | 'csv') {
    if (!activeBatch) return;
    setBusy('exportDownload');
    try {
      await downloadPayrollExportBatch(activeBatch.id, format);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!cycle || !id) return null;

  const isOpen = cycle.status === 'open';
  const isLocked = cycle.status === 'locked';
  const hasSharedEmployees = preview?.employees.some(
    (row) => row.payrollAllocationMode === 'shared_across_companies',
  ) ?? false;
  const showPayslipColumn = canRead;
  const isPaid = cycle.status === 'paid';
  const canExportCycle = isLocked || isPaid;
  const exportTable = exportPreview ?? (activeBatch ? {
    cycleId: cycle.id,
    companyId: cycle.companyId,
    cycleStatus: cycle.status,
    canExport: canExportCycle,
    blockedReason: null,
    includedCount: activeBatch.includedCount,
    exceptionCount: activeBatch.exceptionCount,
    totalNetPayAmount: activeBatch.totalNetPayAmount,
    items: activeBatch.items,
    exceptions: activeBatch.items.filter((row) => row.exportStatus === 'exception'),
  } : null);

  return (
    <WorkHQPage>
      <Link to="/payroll/cycles" className="whq-back-link">{th.payrollCycle.back}</Link>

      {flash && <FlashMessage message={flash} onDismiss={() => setFlash(null)} />}

      {companySyncing && scopeMismatch && (
        <p className="whq-muted whq-mb-md">กำลังสลับไปรอบของ {selectedCompanyLabel}…</p>
      )}
      {noMatchingCycle && scopeMismatch && (
        <WorkHQAlert
          tone="warning"
          message={`รอบนี้เป็นของ ${cycleCompanyLabel} — ยังไม่มีรอบช่วง ${cycle.periodStart} → ${cycle.periodEnd} ใน ${selectedCompanyLabel} · เปิดรอบหรือกลับไปเลือกบริษัทเดิม`}
        />
      )}

      <WorkHQPageHeader
        title={th.payrollCycle.title}
        subtitle={`${cycleCompanyLabel} · ${cycle.periodStart} → ${cycle.periodEnd}`}
        actions={(
          <>
            <WorkHQBadge status={cycle.status} />
            {canRead && (
              <WorkHQButton to="/commission/admin" variant="secondary">
                {th.nav.adminCommission}
              </WorkHQButton>
            )}
            {canWrite && (
              <WorkHQButton to="/settings/payroll" variant="secondary">
                {th.sharedPayroll.migrateTitle}
              </WorkHQButton>
            )}
            {canViewOverview && (
              <Link to={`/payroll/cycles/${id}/overview`} className="whq-link whq-ml-sm">
                {th.payrollOverview.title}
              </Link>
            )}
          </>
        )}
      />

      <WorkHQCard title={th.payrollCycle.period} className="whq-detail-card">
        <div className="whq-detail-card-body">
          <div className="whq-info-row">
            <span className="whq-info-label">{th.payrollCycle.period}</span>
            <span className="whq-info-value">{cycle.periodStart} → {cycle.periodEnd}</span>
          </div>
          <div className="whq-info-row">
            <span className="whq-info-label">{th.payrollCycle.payDate}</span>
            <span className="whq-info-value">{cycle.payDate}</span>
          </div>
          <div className="whq-info-row">
            <span className="whq-info-label">{th.payrollCycle.status}</span>
            <span className="whq-info-value"><WorkHQBadge status={cycle.status} /></span>
          </div>
        </div>
      </WorkHQCard>

      {isPaid && (
        <WorkHQAlert tone="warning" message={th.payrollCycle.paidHint} />
      )}

      <PayrollCycleWizard
        cycle={cycle}
        preview={preview}
        overviewSummary={overviewSummary}
        canWrite={canWrite}
        canExport={canExport}
        isOwner={isOwner}
        busy={busy}
        hasExportBatch={Boolean(activeBatch?.status === 'completed')}
        payslipReadyCount={payslipReadyIds.size}
        onCalculate={() => void runCalculate()}
        onLock={() => void runLock()}
        onQuickExport={() => void runQuickExport()}
        onMarkPaid={() => void runPaid()}
        onRefreshPreview={() => void runPreview()}
        onGeneratePayslips={() => void runGenerateAllPayslips()}
      />

      {canWrite && isOpen && (
        <WorkHQCard title={th.payrollCycle.manualItemTitle} className="whq-detail-card">
          <div className="whq-detail-card-body">
            <ManualPayrollItemBuilder
              companyId={cycle.companyId}
              cycleId={id}
              disabled={busy !== null}
              onSuccess={async () => {
                setFlash(th.payrollCycle.manualItemSuccess);
                await loadPreview();
                await loadOverviewSummary();
              }}
            />
          </div>
        </WorkHQCard>
      )}

      {preview ? (
        <>
          <WorkHQSectionStats preview={preview} />
          {preview.warnings.length > 0 && (
            <WorkHQCard title={th.payrollCycle.warningsTitle}>
              <ul className="whq-warning-list">
                {preview.warnings.slice(0, 20).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </WorkHQCard>
          )}
          <WorkHQCard title={th.payrollCycle.employeesTitle}>
            <p className="whq-muted whq-employee-payroll-formula-hint">{th.payrollCycle.payrollFormulaHint}</p>
            {canRead && !hasSharedEmployees && (
              <WorkHQAlert
                tone="warning"
                message={`ยังไม่มีพนักงานโหมดเงินเดือนรวม — ไปที่ ตั้งค่า → กฎเงินเดือน แล้วกด 「${th.sharedPayroll.migrateTitle}」 เพื่อให้ปุ่ม ${th.sharedPayroll.consolidatedPayslipShort} แสดงในตาราง`}
              />
            )}
            {canWrite && (
              <div className="whq-payroll-wizard-actions" style={{ marginBottom: '0.75rem' }}>
                <WorkHQButton
                  type="button"
                  variant="primary"
                  disabled={busy !== null || payslipBusyId !== null}
                  onClick={() => void runGenerateAllPayslips()}
                >
                  {busy === 'payslips' ? 'กำลังสร้างสลิป…' : th.payrollCycle.payslipGenerateAll}
                </WorkHQButton>
                <span className="whq-muted whq-text-sm">{th.payrollCycle.payslipGenerateHint}</span>
              </div>
            )}
            <div className="whq-table-wrap">
              <table className="whq-table">
                <thead>
                  <tr>
                    <th>{th.payrollCycle.colEmployee}</th>
                    <th>{th.payrollCycle.colSalary}</th>
                    <th>{th.payrollCycle.colMeal}</th>
                    <th>{th.payrollCycle.colCrossBorder}</th>
                    <th>{th.payrollCycle.colLate}</th>
                    <th>{th.payrollCycle.colAbsence}</th>
                    <th>{th.payrollCycle.colBonus}</th>
                    <th>{th.payrollCycle.colOt}</th>
                    <th>{th.payrollCycle.colDeposit}</th>
                    <th>{th.payrollCycle.colNet}</th>
                    {showPayslipColumn && <th>{th.payrollCycle.payslipTitle}</th>}
                  </tr>
                </thead>
                <tbody>
                  {preview.employees.map((row) => (
                    <tr key={row.employeeId}>
                      <td>
                        <Link
                          to={`/hr/employees/${row.employeeId}?tab=payroll`}
                          className="whq-link"
                        >
                          {row.employeeName}
                        </Link>
                        <div className="whq-muted whq-text-sm">{row.globalId}</div>
                        <div className="whq-muted whq-text-sm">
                          Office {row.officeDays ?? 0} · WFH {row.wfhDays ?? 0}
                        </div>
                      </td>
                      <td>
                        <div>{formatMoney(row.salary)}</div>
                        {row.salaryMonthlyBase != null
                          && row.salary !== row.salaryMonthlyBase && (
                          <div className="whq-muted whq-text-sm">
                            {th.payrollCycle.salaryProrateHint(
                              formatMoney(row.salaryMonthlyBase),
                              row.salaryDays,
                              row.salaryPeriodDays,
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <div>{formatMoney(row.mealAllowance)}</div>
                        {(row.mealEligibleDays ?? 0) > 0 && (
                          <div className="whq-muted whq-text-sm">{row.mealEligibleDays} วัน</div>
                        )}
                      </td>
                      <td>
                        <div>{formatMoney(row.crossBorderAllowance ?? 0)}</div>
                        {(row.crossBorderEligibleDays ?? row.officeDays ?? 0) > 0 && (
                          <div className="whq-muted whq-text-sm">
                            {row.crossBorderEligibleDays ?? row.officeDays} วัน
                          </div>
                        )}
                      </td>
                      <td>{formatMoney(row.lateDeduction)}</td>
                      <td>{formatMoney(row.absenceDeduction)}</td>
                      <td>{formatMoney(row.leaveBonus)}</td>
                      <td>{formatMoney(row.overtime)}</td>
                      <td>{formatMoney(row.deposit)}</td>
                      <td>{formatMoney(row.net)}</td>
                      {showPayslipColumn && (
                        <td>
                          <div className="whq-btn-group whq-btn-group--stack">
                            {canWrite && (
                              payslipReadyIds.has(row.employeeId) ? (
                                <span className="whq-muted whq-text-sm">{th.payrollCycle.payslipReady}</span>
                              ) : (
                                <WorkHQButton
                                  type="button"
                                  variant="secondary"
                                  disabled={busy !== null || payslipBusyId !== null}
                                  onClick={() => void runGenerateOnePayslip(row.employeeId)}
                                >
                                  {payslipBusyId === row.employeeId
                                    ? '…'
                                    : th.payrollCycle.payslipGenerate}
                                </WorkHQButton>
                              )
                            )}
                            {row.payrollAllocationMode === 'shared_across_companies' && id && (
                              <WorkHQButton
                                type="button"
                                variant="secondary"
                                onClick={() => void downloadConsolidatedPayslipPdf(row.employeeId, id)}
                              >
                                {th.sharedPayroll.consolidatedPayslipShort}
                              </WorkHQButton>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </WorkHQCard>
        </>
      ) : (
        <WorkHQAlert tone="warning" message="ยังไม่มีข้อมูลตัวอย่าง — กด 「คำนวณเงินเดือน」 ด้านบน" />
      )}

      <details className="whq-payroll-advanced">
        <summary>ตัวเลือกเพิ่มเติม (PDF, ส่งออกแบบละเอียด)</summary>
        <div className="whq-payroll-advanced-body">
          {canWrite && (
            <WorkHQButton
              type="button"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void runDownloadSummaryPdf()}
            >
              {busy === 'pdfSummary' ? '…' : th.payrollCycle.exportDownloadPdf}
            </WorkHQButton>
          )}

      {canExport && (
        <WorkHQCard title={th.payrollCycle.exportTitle} className="whq-detail-card">
          <div className="whq-detail-card-body">
            {!canExportCycle && (
              <WorkHQAlert tone="warning" message={th.payrollCycle.exportNotAvailable} />
            )}
            <div className="whq-btn-group whq-btn-group--split whq-detail-card-actions">
              <WorkHQButton
                type="button"
                variant="secondary"
                disabled={!canExportCycle || busy !== null}
                onClick={() => void runExportPreview()}
              >
                {busy === 'exportPreview' ? '…' : th.payrollCycle.exportPreviewButton}
              </WorkHQButton>
              <WorkHQButton
                type="button"
                variant="primary"
                disabled={!canExportCycle || busy !== null}
                onClick={() => void runExportCreate(false)}
              >
                {busy === 'exportCreate' ? '…' : th.payrollCycle.exportCreateButton}
              </WorkHQButton>
              {isOwner && exportPreview && exportPreview.exceptionCount > 0 && (
                <WorkHQButton
                  type="button"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void runExportCreate(true)}
                >
                  {th.payrollCycle.exportConfirmExceptions}
                </WorkHQButton>
              )}
              {activeBatch && activeBatch.status === 'completed' && (
                <>
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => void runExportDownload('xlsx')}
                  >
                    {th.payrollCycle.exportDownloadXlsx}
                  </WorkHQButton>
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => void runExportDownload('csv')}
                  >
                    {th.payrollCycle.exportDownloadCsv}
                  </WorkHQButton>
                </>
              )}
            </div>

            {exportTable && (
              <>
                <div className="whq-stat-grid whq-detail-card-body">
                  <WorkHQStatCard icon="✅" value={exportTable.includedCount} label={th.payrollCycle.exportIncludedCount} tone="green" />
                  <WorkHQStatCard icon="⚠️" value={exportTable.exceptionCount} label={th.payrollCycle.exportExceptionCount} tone="warm" />
                  <WorkHQStatCard icon="💰" value={formatMoney(exportTable.totalNetPayAmount)} label={th.payrollCycle.exportTotalNet} tone="cool" />
                </div>

                {exportTable.exceptions.length > 0 && (
                  <WorkHQCard title={th.payrollCycle.exportExceptionsTitle}>
                    <div className="whq-table-wrap">
                      <table className="whq-table">
                        <thead>
                          <tr>
                            <th>{th.payrollCycle.colEmployee}</th>
                            <th>{th.payrollCycle.colNet}</th>
                            <th>{th.payrollCycle.exportColExceptions}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {exportTable.exceptions.map((row) => (
                            <tr key={row.employeeId}>
                              <td>
                                <div>{row.employeeName}</div>
                                <div className="whq-muted whq-text-sm">{row.employeeCode}</div>
                              </td>
                              <td>{formatMoney(row.netPayAmount)}</td>
                              <td>{row.exceptionFlags.map(formatExportException).join(', ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </WorkHQCard>
                )}

                <WorkHQCard title={th.payrollCycle.exportPreviewTitle}>
                  <div className="whq-table-wrap">
                    <table className="whq-table">
                      <thead>
                        <tr>
                          <th>{th.payrollCycle.colEmployee}</th>
                          <th>{th.payrollCycle.exportColBank}</th>
                          <th>{th.payrollCycle.exportColAccount}</th>
                          <th>{th.payrollCycle.colNet}</th>
                          <th>{th.payrollCycle.exportColStatus}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exportTable.items.map((row) => (
                          <tr key={row.employeeId}>
                            <td>
                              <div>{row.employeeName}</div>
                              <div className="whq-muted whq-text-sm">{row.employeeCode}</div>
                            </td>
                            <td>{row.bankName ?? '—'}</td>
                            <td>{row.bankAccountNo ?? '—'}</td>
                            <td>{formatMoney(row.netPayAmount)}</td>
                            <td>{row.exportStatus}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </WorkHQCard>
              </>
            )}

            {exportBatches.length > 0 && (
              <WorkHQCard title={th.payrollCycle.exportHistoryTitle}>
                <div className="whq-table-wrap">
                  <table className="whq-table">
                    <thead>
                      <tr>
                        <th>Exported At</th>
                        <th>{th.payrollCycle.exportIncludedCount}</th>
                        <th>{th.payrollCycle.exportExceptionCount}</th>
                        <th>{th.payrollCycle.exportTotalNet}</th>
                        <th>{th.payrollCycle.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportBatches.map((batch) => (
                        <tr key={batch.id}>
                          <td>{new Date(batch.exportedAt).toLocaleString('th-TH')}</td>
                          <td>{batch.includedCount}</td>
                          <td>{batch.exceptionCount}</td>
                          <td>{formatMoney(batch.totalNetPayAmount)}</td>
                          <td>{batch.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </WorkHQCard>
            )}
          </div>
        </WorkHQCard>
      )}
        </div>
      </details>
    </WorkHQPage>
  );
}

function WorkHQSectionStats({ preview }: { preview: PayrollBuilderPreview }) {
  const { totals } = preview;
  return (
    <div className="whq-stat-grid">
      <WorkHQStatCard icon="👥" value={totals.employeeCount} label={th.payrollCycle.employeeCount} tone="cool" />
      <WorkHQStatCard icon="💰" value={formatMoney(totals.totalBaseSalary)} label={th.payrollCycle.totalSalary} tone="green" />
      <WorkHQStatCard icon="🍱" value={formatMoney(totals.totalMealAllowance)} label={th.payrollCycle.totalMeal} tone="warm" />
      <WorkHQStatCard icon="🚌" value={formatMoney(totals.totalCrossBorderAllowance ?? 0)} label={th.payrollCycle.totalCrossBorder} tone="cool" />
      <WorkHQStatCard icon="⏰" value={formatMoney(totals.totalLateDeductions)} label={th.payrollCycle.totalLate} tone="lavender" />
      <WorkHQStatCard icon="🚫" value={formatMoney(totals.totalAbsenceDeductions)} label={th.payrollCycle.totalAbsence} tone="lavender" />
      <WorkHQStatCard icon="🎁" value={formatMoney(totals.totalLeaveBonus)} label={th.payrollCycle.totalBonus} tone="green" />
      <WorkHQStatCard icon="🕒" value={formatMoney(totals.totalOvertime)} label={th.payrollCycle.totalOt} tone="cool" />
      <WorkHQStatCard icon="📊" value={formatMoney(totals.totalCommission)} label={th.payrollCycle.totalCommission} tone="warm" />
      <WorkHQStatCard icon="🏦" value={formatMoney(totals.totalDepositDeduction)} label={th.payrollCycle.totalDeposit} tone="lavender" />
      <WorkHQStatCard icon="✅" value={formatMoney(totals.estimatedNet)} label={th.payrollCycle.estimatedNet} tone="green" />
    </div>
  );
}
