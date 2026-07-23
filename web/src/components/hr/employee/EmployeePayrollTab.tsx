import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../api/client';
import { fetchPayrollOverviewEmployeeDetail } from '../../../api/payroll-overview';
import {
  fetchEmployeePayroll,
  syncEmployeePayrollOpenCycles,
  type EmployeePayrollHistoryItem,
  type EmployeePayrollResponse,
} from '../../../api/employee-payroll';
import { formatThaiDate, NO_DATA } from '../../../lib/employee-date-utils';
import {
  filterPayrollHistory,
  formatPayrollMoney,
  payrollStatusLabel,
  payrollStatusVariant,
  payrollYearOptions,
  salaryTypeLabel,
} from '../../../lib/employee-payroll-utils';
import { th } from '../../../i18n/th-labels';
import { downloadConsolidatedPayslipPdf } from '../../../api/manual-payroll-items';
import { PayrollOverviewEmployeeDetailModal } from '../../payroll/PayrollOverviewEmployeeDetailModal';
import { EmployeeCompensationSection } from '../EmployeeCompensationSection';
import {
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPageState,
} from '../../workhq';
import { WorkHQAlert, WorkHQButton, WorkHQCard, WorkHQField, WorkHQInput, WorkHQSelect } from '../../ui';

function moneyCell(value: number | null | undefined): string {
  return formatPayrollMoney(value ?? 0).replace(/ บาท$/, '');
}

function PayrollSummarySkeleton() {
  return (
    <div className="whq-stat-grid whq-employee-payroll-summary-skeleton" data-testid="employee-payroll-summary-skeleton">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="whq-stat-card whq-stat-card--skeleton" />
      ))}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="whq-stat-card" data-testid={`payroll-summary-${tone}`}>
      <div className="whq-stat-value">{value}</div>
      <div className="whq-stat-label">{label}</div>
    </div>
  );
}

interface EmployeePayrollTabProps {
  employeeId: string;
  companyId: string;
}

export function EmployeePayrollTab({ employeeId, companyId }: EmployeePayrollTabProps) {
  const [data, setData] = useState<EmployeePayrollResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchPayrollOverviewEmployeeDetail>> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [syncingPayroll, setSyncingPayroll] = useState(false);
  const payrollSyncKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchEmployeePayroll(employeeId, companyId));
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.summary.salaryNeedsRebuild || syncingPayroll) return;
    const syncKey = `${employeeId}:${companyId}`;
    if (payrollSyncKeyRef.current === syncKey) return;
    payrollSyncKeyRef.current = syncKey;
    void (async () => {
      setSyncingPayroll(true);
      try {
        await syncEmployeePayrollOpenCycles(employeeId, companyId);
        await load();
      } catch {
        payrollSyncKeyRef.current = null;
      } finally {
        setSyncingPayroll(false);
      }
    })();
  }, [companyId, data?.summary.salaryNeedsRebuild, employeeId, load, syncingPayroll]);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => payrollYearOptions(data?.history ?? [], currentYear),
    [currentYear, data?.history],
  );

  useEffect(() => {
    if (!year && yearOptions.length) setYear(yearOptions[0]);
  }, [year, yearOptions]);

  const filteredHistory = useMemo(
    () => filterPayrollHistory(data?.history ?? [], { year, status, search }),
    [data?.history, year, status, search],
  );

  const tableState = loading
    ? 'loading' as const
    : error
      ? 'error' as const
      : !data || data.history.length === 0
        ? 'empty' as const
        : filteredHistory.length === 0
          ? 'empty' as const
          : 'success' as const;

  const summary = data?.summary;
  const isSharedPayroll = summary?.payrollAllocationMode === 'shared_across_companies';
  const needsInitialSalary = Boolean(summary && !summary.currentSalary);
  const latestHistoryCycleId = data?.history[0]?.payrollCycleId ?? null;
  const statusVariant = summary?.payrollStatus ? payrollStatusVariant(summary.payrollStatus) : 'neutral';

  async function openDetail(row: EmployeePayrollHistoryItem) {
    setSelectedCycleId(row.payrollCycleId);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchPayrollOverviewEmployeeDetail(row.payrollCycleId, employeeId));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedCycleId(null);
    setDetail(null);
    setDetailLoading(false);
  }

  async function refreshDetail() {
    if (!selectedCycleId) return;
    setDetailLoading(true);
    try {
      setDetail(await fetchPayrollOverviewEmployeeDetail(selectedCycleId, employeeId));
      await load();
    } catch {
      // keep previous detail if refresh fails
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="whq-employee-payroll-tab" data-testid="employee-payroll-tab">
      {needsInitialSalary && (
        <div id="salary-setup">
          <EmployeeCompensationSection
            employeeId={employeeId}
            companyId={companyId}
            initialSetup
            mode="setup-only"
          />
        </div>
      )}

      <WorkHQPageState
        state={loading ? 'loading' : error ? 'error' : 'success'}
        loading={<PayrollSummarySkeleton />}
        error={(
          <WorkHQErrorState
            referenceCode={error instanceof ApiError ? error.requestId : undefined}
            onRetry={() => void load()}
          />
        )}
      >
        {summary && (summary.currentSalary ?? 0) > 0 && (
          <>
            <div className="whq-payroll-hero" data-testid="employee-payroll-summary">
              <div className="whq-payroll-hero__main">
                <div className="whq-payroll-hero__label">
                  {isSharedPayroll ? 'เงินเดือนรวม (ทุกบริษัท)' : 'เงินเดือนปัจจุบัน'}
                </div>
                <div className="whq-payroll-hero__salary" data-testid="payroll-summary-current-salary">
                  {formatPayrollMoney(summary.currentSalary)}
                </div>
                <div className="whq-payroll-hero__meta">
                  {salaryTypeLabel(summary.salaryType)}
                  {isSharedPayroll && summary.perCompanySalary != null && summary.activeCompanyCount
                    ? ` · แบ่ง ${summary.activeCompanyCount} บริษัท ≈ ${formatPayrollMoney(summary.perCompanySalary)}/บริษัท`
                    : ''}
                  {summary.salaryEffectiveFrom
                    ? ` · มีผล ${formatThaiDate(summary.salaryEffectiveFrom)}`
                    : ''}
                </div>
              </div>
              <div className="whq-payroll-hero__side">
                <div className="whq-payroll-hero__stat">
                  <span className="whq-payroll-hero__stat-label">สุทธิล่าสุด</span>
                  <strong data-testid="payroll-summary-latest-net-pay">
                    {formatPayrollMoney(summary.latestNetPay)}
                  </strong>
                </div>
                <div className="whq-payroll-hero__stat">
                  <span className="whq-payroll-hero__stat-label">สถานะรอบล่าสุด</span>
                  <span
                    className={`whq-badge whq-badge-${statusVariant}`}
                    data-testid="payroll-summary-current-status"
                  >
                    {summary.payrollStatus
                      ? payrollStatusLabel(summary.payrollStatus)
                      : NO_DATA}
                  </span>
                </div>
                <div className="whq-payroll-hero__stat">
                  <span className="whq-payroll-hero__stat-label">รอบจ่ายปัจจุบัน</span>
                  <strong data-testid="payroll-summary-pay-period">
                    {summary.payPeriod ?? NO_DATA}
                  </strong>
                </div>
              </div>
            </div>

            {isSharedPayroll && latestHistoryCycleId && (
              <WorkHQCard className="whq-detail-card whq-mb-md">
                <p className="whq-muted whq-mb-sm">{th.sharedPayroll.consolidatedPayslipHint}</p>
                <WorkHQButton
                  type="button"
                  variant="primary"
                  onClick={() => void downloadConsolidatedPayslipPdf(employeeId, latestHistoryCycleId)}
                >
                  {th.sharedPayroll.consolidatedPayslip}
                </WorkHQButton>
              </WorkHQCard>
            )}

            <div className="whq-stat-grid whq-employee-payroll-summary-mini">
              <SummaryCard
                label="วันจ่ายล่าสุด"
                value={summary.lastPayrollDate ? formatThaiDate(summary.lastPayrollDate) : NO_DATA}
                tone="last-payroll-date"
              />
              <SummaryCard
                label="ประเภทเงินเดือน"
                value={salaryTypeLabel(summary.salaryType)}
                tone="salary-type"
              />
              <SummaryCard
                label="หักล่วงหน้ารอบนี้"
                value={formatPayrollMoney(summary.advanceDeductionTotal)}
                tone="advance-deduction"
              />
              <SummaryCard
                label="ครบกำหนดทบทวน"
                value={summary.salaryReviewDue ? 'ถึงเวลาทบทวน' : 'ยังไม่ถึง'}
                tone="salary-review-due"
              />
            </div>
          </>
        )}
      </WorkHQPageState>

      {summary?.salaryNeedsRebuild && (
        <WorkHQAlert
          tone="warning"
          message={
            syncingPayroll
              ? 'กำลังคำนวณรายการเงินเดือนในรอบที่เปิดอยู่…'
              : 'ตั้งเงินเดือนแล้ว แต่รอบจ่ายล่าสุดยังไม่มีเงินเดือนฐาน — ระบบจะซิงค์อัตโนมัติ หรือไปที่หน้ารอบเงินเดือนแล้วกด 「คำนวณเงินเดือน」'
          }
        />
      )}
      {summary?.salaryEffectiveAfterPeriod && (
        <WorkHQAlert
          tone="warning"
          message={`วันมีผลเงินเดือน (${summary.salaryEffectiveFrom ? formatThaiDate(summary.salaryEffectiveFrom) : '—'}) อยู่หลังรอบจ่ายล่าสุด — เงินเดือนฐานจะเข้ารอบถัดไป`}
        />
      )}

      <WorkHQCard title="ประวัติการจ่าย" className="whq-detail-card whq-detail-card--wide">
        <p className="whq-muted whq-employee-payroll-formula-hint">
          {th.payrollCycle.payrollFormulaHint}
        </p>
        <div className="whq-employee-payroll-toolbar">
          <WorkHQField label="ปี">
            <WorkHQSelect
              value={year}
              data-testid="payroll-filter-year"
              onChange={(event) => setYear(event.target.value)}
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="สถานะ">
            <WorkHQSelect
              value={status}
              data-testid="payroll-filter-status"
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="draft">ร่าง</option>
              <option value="calculated">คำนวณแล้ว</option>
              <option value="approved">อนุมัติแล้ว</option>
              <option value="paid">จ่ายแล้ว</option>
              <option value="cancelled">ยกเลิก</option>
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="ค้นหา">
            <WorkHQInput
              type="search"
              value={search}
              placeholder="ค้นหารอบจ่าย หรือสถานะ"
              data-testid="payroll-search"
              onChange={(event) => setSearch(event.target.value)}
            />
          </WorkHQField>
        </div>

        <WorkHQPageState
          state={tableState}
          loading={<PayrollSummarySkeleton />}
          error={(
            <WorkHQErrorState
              referenceCode={error instanceof ApiError ? error.requestId : undefined}
              onRetry={() => void load()}
            />
          )}
          empty={(
            <WorkHQEmptyState
              title="ยังไม่มีประวัติการจ่าย"
              description="เมื่อเปิดรอบเงินเดือนและคำนวณแล้ว รายการจะแสดงที่นี่"
            />
          )}
        >
          <div className="whq-table-wrap">
            <table className="whq-table whq-employee-payroll-table" data-testid="employee-payroll-table">
              <thead>
                <tr>
                  <th>รอบจ่าย</th>
                  <th>{th.payrollCycle.colSalary}</th>
                  <th>{th.payrollCycle.colMeal}</th>
                  <th>{th.payrollCycle.colCrossBorder}</th>
                  <th>{th.payrollCycle.colLate}</th>
                  <th>{th.payrollCycle.colAbsence}</th>
                  <th>{th.payrollCycle.colBonus}</th>
                  <th>{th.payrollCycle.colOt}</th>
                  <th>{th.payrollCycle.colDeposit}</th>
                  <th>{th.payrollCycle.colNet}</th>
                  <th>สถานะ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => {
                  const variant = payrollStatusVariant(row.status);
                  return (
                    <tr
                      key={row.payrollCycleId}
                      data-testid={`payroll-row-${row.payrollCycleId}`}
                      className="whq-table-row-clickable"
                      onClick={() => void openDetail(row)}
                    >
                      <td>
                        <div className="whq-payroll-period">
                          {formatThaiDate(row.periodStart)} – {formatThaiDate(row.periodEnd)}
                        </div>
                        <div className="whq-muted whq-text-sm">
                          จ่าย {formatThaiDate(row.payDate)}
                        </div>
                      </td>
                      <td data-testid={`payroll-salary-${row.payrollCycleId}`}>
                        {moneyCell(row.baseSalary)}
                      </td>
                      <td data-testid={`payroll-meal-${row.payrollCycleId}`}>
                        <div>{moneyCell(row.mealAllowance)}</div>
                        {(row.mealEligibleDays ?? 0) > 0 && (
                          <div className="whq-muted whq-text-sm">{row.mealEligibleDays} วัน</div>
                        )}
                      </td>
                      <td>
                        <div>{moneyCell(row.crossBorderAllowance)}</div>
                        {(row.crossBorderEligibleDays ?? 0) > 0 && (
                          <div className="whq-muted whq-text-sm">{row.crossBorderEligibleDays} วัน</div>
                        )}
                      </td>
                      <td>{moneyCell(row.lateDeduction)}</td>
                      <td>{moneyCell(row.absenceDeduction)}</td>
                      <td>{moneyCell(row.bonusAmount)}</td>
                      <td>{moneyCell(row.otAmount)}</td>
                      <td>{moneyCell(row.deposit)}</td>
                      <td>
                        <strong className="whq-payroll-net">{moneyCell(row.netPay)}</strong>
                      </td>
                      <td>
                        <span
                          className={`whq-badge whq-badge-${variant}`}
                          data-testid={`payroll-status-${row.payrollCycleId}`}
                        >
                          {payrollStatusLabel(row.status)}
                        </span>
                      </td>
                      <td>
                        <WorkHQButton
                          type="button"
                          variant="secondary"
                          data-testid={`payroll-view-${row.payrollCycleId}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void openDetail(row);
                          }}
                        >
                          ดูรายละเอียด
                        </WorkHQButton>
                        {isSharedPayroll && (
                          <WorkHQButton
                            type="button"
                            variant="secondary"
                            className="whq-ml-sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void downloadConsolidatedPayslipPdf(employeeId, row.payrollCycleId);
                            }}
                          >
                            {th.sharedPayroll.consolidatedPayslipShort}
                          </WorkHQButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="whq-muted whq-text-sm whq-mt-sm">
            กดแถวเพื่อดูรายการย่อยทั้งหมด (คอม, หักอื่นๆ, หมายเหตุ)
          </p>
        </WorkHQPageState>
      </WorkHQCard>

      {!needsInitialSalary && (
        <WorkHQCard title="จัดการเงินเดือน / ประกัน" className="whq-detail-card whq-detail-card--wide">
          <p className="whq-muted whq-mb-sm">
            ปรับฐานเงินเดือน เลื่อนตำแหน่ง หรือตั้งค่าเงินประกัน — เปิดเมื่อต้องการแก้ไขเท่านั้น
          </p>
          <WorkHQButton
            type="button"
            variant="secondary"
            data-testid="payroll-toggle-manage"
            onClick={() => setShowManage((v) => !v)}
          >
            {showManage ? 'ซ่อนการจัดการ' : 'เปิดการจัดการ'}
          </WorkHQButton>
          {showManage && (
            <div className="whq-payroll-manage-panel" id="salary-setup">
              <EmployeeCompensationSection
                employeeId={employeeId}
                companyId={companyId}
                mode="manage"
              />
            </div>
          )}
        </WorkHQCard>
      )}

      {selectedCycleId && (
        <PayrollOverviewEmployeeDetailModal
          detail={detail}
          loading={detailLoading}
          onClose={closeDetail}
          cycleId={selectedCycleId}
          onChanged={() => void refreshDetail()}
        />
      )}
    </div>
  );
}
