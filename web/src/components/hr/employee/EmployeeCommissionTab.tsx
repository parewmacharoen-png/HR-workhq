import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../../api/client';
import { createCommissionAdjustment } from '../../../api/commission-adjustment';
import {
  fetchEmployeeCommission,
  type EmployeeCommissionHistoryItem,
  type EmployeeCommissionResponse,
} from '../../../api/employee-commission';
import { NO_DATA } from '../../../lib/employee-date-utils';
import {
  commissionCompanyOptions,
  commissionStatusLabel,
  commissionStatusVariant,
  commissionTypeLabel,
  commissionYearOptions,
  filterCommissionHistory,
  formatCommissionMoney,
} from '../../../lib/employee-commission-utils';
import {
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPageState,
} from '../../workhq';
import { useAuth } from '../../../context/AuthContext';
import { WorkHQBadge, WorkHQButton, WorkHQCard, WorkHQField, WorkHQInput, WorkHQSelect } from '../../ui';

function CommissionSummarySkeleton() {
  return (
    <div className="whq-stat-grid whq-employee-commission-summary-skeleton" data-testid="employee-commission-summary-skeleton">
      {Array.from({ length: 9 }, (_, index) => (
        <div key={index} className="whq-stat-card whq-stat-card--skeleton" />
      ))}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="whq-stat-card" data-testid={`commission-summary-${tone}`}>
      <div className="whq-stat-value">{value}</div>
      <div className="whq-stat-label">{label}</div>
    </div>
  );
}

interface EmployeeCommissionTabProps {
  employeeId: string;
  companyId: string;
}

export function EmployeeCommissionTab({ employeeId, companyId }: EmployeeCommissionTabProps) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canEditCommission = can('commission:write');
  const [data, setData] = useState<EmployeeCommissionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [year, setYear] = useState('');
  const [company, setCompany] = useState('');
  const [commissionType, setCommissionType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [adjustRow, setAdjustRow] = useState<EmployeeCommissionHistoryItem | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDirection, setAdjustDirection] = useState<'increase' | 'decrease'>('increase');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchEmployeeCommission(employeeId, companyId));
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

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => commissionYearOptions(data?.history ?? [], currentYear),
    [currentYear, data?.history],
  );
  const companyOptions = useMemo(
    () => commissionCompanyOptions(data?.history ?? []),
    [data?.history],
  );

  useEffect(() => {
    if (!year && yearOptions.length) setYear(yearOptions[0]);
  }, [year, yearOptions]);

  const filteredHistory = useMemo(
    () => filterCommissionHistory(data?.history ?? [], { year, company, commissionType, status, search }),
    [data?.history, year, company, commissionType, status, search],
  );

  const hasEngines = Boolean(data?.assignment) || (data?.history.length ?? 0) > 0;
  const tableState = loading
    ? 'loading' as const
    : error
      ? 'error' as const
      : !hasEngines
        ? 'empty' as const
        : filteredHistory.length === 0
          ? 'empty' as const
          : 'success' as const;

  const summary = data?.summary;
  const assignment = data?.assignment;
  const statusVariant = summary?.commissionStatus
    ? commissionStatusVariant(
      filteredHistory[0]?.uiStatus
      ?? (summary.commissionStatus === 'paid' ? 'paid' : 'pending'),
    )
    : 'neutral';

  function openDetail(row: EmployeeCommissionHistoryItem) {
    if (!row.finalizationCycleId) return;
    navigate(`/commission/cycles/${row.finalizationCycleId}`);
  }

  function openAdjust(row: EmployeeCommissionHistoryItem) {
    setAdjustRow(row);
    setAdjustAmount('');
    setAdjustDirection('increase');
    setAdjustReason('');
    setAdjustError(null);
    setAdjustSuccess(null);
  }

  async function submitAdjust() {
    if (!adjustRow) return;
    const amount = Number(adjustAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setAdjustError('กรุณาระบุจำนวนเงินที่ถูกต้อง');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('กรุณาระบุเหตุผล');
      return;
    }
    setAdjustSaving(true);
    setAdjustError(null);
    setAdjustSuccess(null);
    try {
      await createCommissionAdjustment({
        companyId: adjustRow.companyId || companyId,
        earnCycleId: adjustRow.sourceCycleId,
        type: adjustRow.commissionType,
        teamId: adjustRow.teamId ?? undefined,
        employeeId,
        sourceResultId: adjustRow.id,
        reason: adjustReason.trim(),
        adjustmentAmount: amount,
        direction: adjustDirection,
      });
      setAdjustSuccess('สร้างคำขอปรับค่าคอมแล้ว — รออนุมัติ');
      setAdjustRow(null);
      await load();
    } catch (err) {
      setAdjustError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setAdjustSaving(false);
    }
  }

  return (
    <div className="whq-employee-commission-tab" data-testid="employee-commission-tab">
      <div className="whq-tab-toolbar">
        <WorkHQButton to={`/commission/cycles?employeeId=${employeeId}`} variant="secondary">
          จัดการรอบค่าคอม
        </WorkHQButton>
        <WorkHQButton to={`/requests/create?employeeId=${employeeId}`} variant="ghost">
          สร้างคำขอที่เกี่ยวข้อง
        </WorkHQButton>
      </div>
      <WorkHQPageState
        state={loading ? 'loading' : error ? 'error' : 'success'}
        loading={<CommissionSummarySkeleton />}
        error={(
          <WorkHQErrorState
            referenceCode={error instanceof ApiError ? error.requestId : undefined}
            onRetry={() => void load()}
          />
        )}
      >
        {summary && (
          <div className="whq-stat-grid whq-employee-commission-summary" data-testid="employee-commission-summary">
            <SummaryCard label="รอบค่าคอมปัจจุบัน" value={summary.currentCycleLabel ?? NO_DATA} tone="current-cycle" />
            <SummaryCard label="ค่าคอมโดยประมาณ" value={formatCommissionMoney(summary.estimatedCommission)} tone="estimated" />
            <SummaryCard label="จ่ายล่าสุด" value={formatCommissionMoney(summary.lastPaidCommission)} tone="last-paid" />
            <SummaryCard label="ทีมปัจจุบัน" value={summary.currentTeamName ?? NO_DATA} tone="current-team" />
            <SummaryCard label="วิธีคิดค่าคอม" value={summary.commissionMethod ?? NO_DATA} tone="method" />
            <SummaryCard label="สิทธิ์รับค่าคอม" value={summary.eligibleStatus ?? NO_DATA} tone="eligible" />
            <SummaryCard label="สถานะยกยอด" value={summary.carryForwardStatus ?? NO_DATA} tone="carry-forward" />
            <SummaryCard label="ความคืบหน้าเป้าหมาย" value={summary.targetProgress ?? NO_DATA} tone="target-progress" />
            <div className="whq-stat-card" data-testid="commission-summary-status">
              <div className="whq-stat-value">
                {summary.commissionStatus ? (
                  <span className={`whq-badge whq-badge-${statusVariant}`}>
                    {commissionStatusLabel(summary.commissionStatus)}
                  </span>
                ) : NO_DATA}
              </div>
              <div className="whq-stat-label">สถานะค่าคอม</div>
            </div>
          </div>
        )}
      </WorkHQPageState>

      {assignment && (
        <WorkHQCard title="การมอบหมายปัจจุบัน" className="whq-detail-card whq-detail-card--wide">
          <div className="whq-employee-commission-assignment" data-testid="employee-commission-assignment">
            <div className="whq-detail-grid">
              <div><span className="whq-muted">บริษัท</span><div>{assignment.companyName}</div></div>
              <div><span className="whq-muted">ทีม</span><div>{assignment.teamName ?? NO_DATA}</div></div>
              <div><span className="whq-muted">บทบาท</span><div>{assignment.businessRole ?? NO_DATA}</div></div>
              <div><span className="whq-muted">วิธีคิดค่าคอม</span><div>{assignment.commissionMethod ?? NO_DATA}</div></div>
              <div><span className="whq-muted">Ramp %</span><div>{assignment.rampPercent ?? NO_DATA}</div></div>
              <div><span className="whq-muted">Eligibility %</span><div>{assignment.eligibilityPercent ?? NO_DATA}</div></div>
              <div><span className="whq-muted">Big Leader %</span><div>{assignment.bigLeaderPercent ?? NO_DATA}</div></div>
              <div><span className="whq-muted">Employee %</span><div>{assignment.employeePercent ?? NO_DATA}</div></div>
              <div><span className="whq-muted">เป้าหมาย</span><div>{assignment.target ?? NO_DATA}</div></div>
              <div><span className="whq-muted">ยกยอด</span><div>{assignment.carryForward ?? NO_DATA}</div></div>
            </div>
          </div>
        </WorkHQCard>
      )}

      <WorkHQCard title="ประวัติค่าคอมมิชชั่น" className="whq-detail-card whq-detail-card--wide">
        <div className="whq-employee-commission-toolbar">
          <WorkHQField label="ปี">
            <WorkHQSelect
              value={year}
              data-testid="commission-filter-year"
              onChange={(event) => setYear(event.target.value)}
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="บริษัท">
            <WorkHQSelect
              value={company}
              data-testid="commission-filter-company"
              onChange={(event) => setCompany(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              {companyOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="ประเภท">
            <WorkHQSelect
              value={commissionType}
              data-testid="commission-filter-type"
              onChange={(event) => setCommissionType(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="marketing">Marketing</option>
              <option value="admin">Admin</option>
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="สถานะ">
            <WorkHQSelect
              value={status}
              data-testid="commission-filter-status"
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="eligible">Eligible</option>
              <option value="pending">Pending</option>
              <option value="carry_forward">Carry Forward</option>
              <option value="paid">Paid</option>
              <option value="rejected">Rejected</option>
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="ค้นหา">
            <WorkHQInput
              type="search"
              value={search}
              placeholder="ค้นหารอบ ทีม หรือสถานะ"
              data-testid="commission-search"
              onChange={(event) => setSearch(event.target.value)}
            />
          </WorkHQField>
        </div>

        <WorkHQPageState
          state={tableState}
          loading={<CommissionSummarySkeleton />}
          error={(
            <WorkHQErrorState
              referenceCode={error instanceof ApiError ? error.requestId : undefined}
              onRetry={() => void load()}
            />
          )}
          empty={(
            <WorkHQEmptyState
              title="ยังไม่มีข้อมูลค่าคอมมิชชั่น"
              description="พนักงานไม่ได้อยู่ในระบบ Marketing หรือ Admin Commission"
            />
          )}
        >
          <div className="whq-table-wrap">
            <table className="whq-table whq-employee-commission-table" data-testid="employee-commission-table">
              <thead>
                <tr>
                  <th>รอบ</th>
                  <th>บริษัท</th>
                  <th>ทีม</th>
                  <th>ประเภท</th>
                  <th>วิธี</th>
                  <th>เป้าหมาย</th>
                  <th>ทำได้</th>
                  <th>ค่าคอม</th>
                  <th>โบนัส</th>
                  <th>ยกยอด</th>
                  <th>สถานะ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => (
                  <tr
                    key={row.id}
                    className={row.finalizationCycleId ? 'whq-table-row-clickable' : undefined}
                    onClick={() => openDetail(row)}
                    data-testid={`commission-history-row-${row.id}`}
                  >
                    <td>{row.periodLabel}</td>
                    <td>{row.companyName}</td>
                    <td>{row.teamName ?? NO_DATA}</td>
                    <td>{commissionTypeLabel(row.commissionType)}</td>
                    <td>{row.method}</td>
                    <td>{row.target ?? NO_DATA}</td>
                    <td>{row.achieved ?? NO_DATA}</td>
                    <td>{formatCommissionMoney(row.commission)}</td>
                    <td>{formatCommissionMoney(row.bonus)}</td>
                    <td>{formatCommissionMoney(row.carryForward)}</td>
                    <td>
                      <WorkHQBadge
                        status={row.uiStatus}
                        label={commissionStatusLabel(row.status)}
                      />
                    </td>
                    <td>
                      {row.finalizationCycleId ? (
                        <Link
                          to={`/commission/cycles/${row.finalizationCycleId}`}
                          className="whq-link"
                          onClick={(event) => event.stopPropagation()}
                        >
                          ดูรายละเอียด
                        </Link>
                      ) : NO_DATA}
                      {canEditCommission && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            className="whq-link-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openAdjust(row);
                            }}
                          >
                            ปรับค่าคอม
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkHQPageState>
      </WorkHQCard>

      {adjustRow && (
        <div className="whq-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setAdjustRow(null)}>
          <div className="whq-modal whq-card" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>ปรับค่าคอม — {adjustRow.periodLabel}</h3>
            <p className="whq-muted">{adjustRow.companyName} · {commissionTypeLabel(adjustRow.commissionType)}</p>
            <div className="whq-form-grid">
              <WorkHQField label="ทิศทาง">
                <WorkHQSelect
                  value={adjustDirection}
                  onChange={(event) => setAdjustDirection(event.target.value as 'increase' | 'decrease')}
                >
                  <option value="increase">เพิ่ม</option>
                  <option value="decrease">ลด</option>
                </WorkHQSelect>
              </WorkHQField>
              <WorkHQField label="จำนวนเงิน (บาท)">
                <WorkHQInput
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={adjustAmount}
                  onChange={(event) => setAdjustAmount(event.target.value)}
                />
              </WorkHQField>
              <WorkHQField label="เหตุผล">
                <WorkHQInput
                  value={adjustReason}
                  onChange={(event) => setAdjustReason(event.target.value)}
                  placeholder="เช่น ปรับตามผลงานจริง"
                />
              </WorkHQField>
              {adjustError && <p className="whq-error-text">{adjustError}</p>}
              {adjustSuccess && <p className="whq-success-text">{adjustSuccess}</p>}
              <div className="whq-action-row">
                <WorkHQButton type="button" variant="primary" disabled={adjustSaving} onClick={() => void submitAdjust()}>
                  {adjustSaving ? 'กำลังบันทึก…' : 'ส่งคำขอปรับค่าคอม'}
                </WorkHQButton>
                <WorkHQButton type="button" variant="ghost" onClick={() => setAdjustRow(null)}>
                  ยกเลิก
                </WorkHQButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
