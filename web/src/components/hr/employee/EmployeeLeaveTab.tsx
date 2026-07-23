import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  deleteEmployeeLeaveRequest,
  fetchEmployeeLeave,
  updateEmployeeLeaveBalances,
  type EmployeeLeaveBalanceEdit,
  type EmployeeLeaveHistoryItem,
  type EmployeeLeaveResponse,
} from '../../../api/employee-leave';
import { useAuth } from '../../../context/AuthContext';
import { formatThaiDate } from '../../../lib/employee-date-utils';
import {
  filterLeaveHistory,
  leaveStatusLabel,
  leaveStatusVariant,
  leaveTypeDisplayName,
  leaveTypeOptions,
  leaveUserReason,
  leaveYearOptions,
} from '../../../lib/employee-leave-utils';
import { LeaveRequestDetailModal } from '../../leave/LeaveRequestDetailModal';
import { LeaveRequestEditModal } from '../../leave/LeaveRequestEditModal';
import {
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPageState,
} from '../../workhq';
import { WorkHQButton, WorkHQCard, WorkHQField, WorkHQInput, WorkHQSelect } from '../../ui';

function LeaveSummarySkeleton() {
  return (
    <div className="whq-leave-overview-skeleton" data-testid="employee-leave-summary-skeleton">
      <div className="whq-stat-card whq-stat-card--skeleton" />
      <div className="whq-stat-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="whq-stat-card whq-stat-card--skeleton" />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="whq-stat-card" data-testid={`leave-summary-${tone}`}>
      <div className="whq-stat-value">{value}</div>
      <div className="whq-stat-label">{label}</div>
    </div>
  );
}

interface EmployeeLeaveTabProps {
  employeeId: string;
  companyId: string;
}

export function EmployeeLeaveTab({ employeeId, companyId }: EmployeeLeaveTabProps) {
  const { can } = useAuth();
  const canWrite = can('leave:write');
  const [data, setData] = useState<EmployeeLeaveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [year, setYear] = useState('');
  const [leaveType, setLeaveType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EmployeeLeaveHistoryItem | null>(null);
  const [editing, setEditing] = useState<EmployeeLeaveHistoryItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPriorForm, setShowPriorForm] = useState(false);
  const [priorDraft, setPriorDraft] = useState<EmployeeLeaveBalanceEdit[]>([]);
  const [priorSaving, setPriorSaving] = useState(false);
  const [priorError, setPriorError] = useState<string | null>(null);
  const [priorSaved, setPriorSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchEmployeeLeave(employeeId, companyId);
      setData(next);
      setPriorDraft(next.balances ?? []);
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
    if (data?.balances) setPriorDraft(data.balances);
  }, [data?.balances]);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => leaveYearOptions(data?.history ?? [], currentYear),
    [currentYear, data?.history],
  );
  const typeOptions = useMemo(
    () => leaveTypeOptions(data?.history ?? []),
    [data?.history],
  );

  useEffect(() => {
    if (!year && yearOptions.length) setYear(yearOptions[0]);
  }, [year, yearOptions]);

  const filteredHistory = useMemo(
    () => filterLeaveHistory(data?.history ?? [], { year, leaveType, status, search }),
    [data?.history, year, leaveType, status, search],
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
  const yearUsage = summary?.yearUsage ?? [];

  function updatePriorDraft(
    code: EmployeeLeaveBalanceEdit['leaveTypeCode'],
    field: 'priorUsed' | 'entitled',
    value: string,
  ) {
    const parsed = value === '' ? 0 : Number(value);
    const safe = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    setPriorDraft((rows) => rows.map((row) => (
      row.leaveTypeCode === code ? { ...row, [field]: safe } : row
    )));
    setPriorSaved(false);
  }

  async function handleSavePriorUsage() {
    setPriorSaving(true);
    setPriorError(null);
    setPriorSaved(false);
    try {
      const next = await updateEmployeeLeaveBalances(employeeId, companyId, {
        items: priorDraft.map((row) => ({
          leaveTypeCode: row.leaveTypeCode,
          priorUsed: row.priorUsed,
          entitled: row.entitledEditable ? row.entitled : undefined,
        })),
      });
      setData(next);
      setPriorDraft(next.balances ?? []);
      setPriorSaved(true);
    } catch (err) {
      setPriorError(err instanceof ApiError ? err.message : 'บันทึกยอดใช้ก่อนเริ่มระบบไม่สำเร็จ');
    } finally {
      setPriorSaving(false);
    }
  }

  async function handleDelete(row: EmployeeLeaveHistoryItem) {
    const confirmed = window.confirm(
      `ต้องการลบ "${row.leaveTypeName}" วันที่ ${formatThaiDate(row.startDate)} ใช่หรือไม่?\nระบบจะอัปเดตวันลา วันหยุด การเข้างาน และเงินเดือนรอบที่ยังเปิดอยู่ให้ครบ`,
    );
    if (!confirmed) return;

    setDeletingId(row.id);
    setActionError(null);
    try {
      setData(await deleteEmployeeLeaveRequest(employeeId, companyId, row));
      if (selected?.id === row.id) setSelected(null);
      if (editing?.id === row.id) setEditing(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="whq-employee-leave-tab" data-testid="employee-leave-tab">
      <div className="whq-tab-toolbar">
        <WorkHQButton to={`/requests/create?employeeId=${employeeId}`} variant="secondary">
          สร้างคำขอลาแทนพนักงาน
        </WorkHQButton>
      </div>
      <WorkHQPageState
        state={loading ? 'loading' : error ? 'error' : 'success'}
        loading={<LeaveSummarySkeleton />}
        error={(
          <WorkHQErrorState
            referenceCode={error instanceof ApiError ? error.requestId : undefined}
            onRetry={() => void load()}
          />
        )}
      >
        {summary && (
          <div className="whq-leave-overview" data-testid="employee-leave-summary">
            <div className="whq-leave-overview__status">
              <div className="whq-leave-overview__title">สถานะคำขอปีนี้</div>
              <div className="whq-leave-overview__counts">
                <div className="whq-leave-overview__count" data-testid="leave-summary-year-total">
                  <strong>{summary.leaveRequestsThisYear}</strong>
                  <span>คำขอทั้งหมด</span>
                </div>
                <div className="whq-leave-overview__count" data-testid="leave-summary-approved">
                  <strong>{summary.approvedRequests}</strong>
                  <span>อนุมัติแล้ว</span>
                </div>
                <div className="whq-leave-overview__count" data-testid="leave-summary-pending">
                  <strong>{summary.pendingRequests}</strong>
                  <span>รออนุมัติ</span>
                </div>
                <div className="whq-leave-overview__count" data-testid="leave-summary-rejected">
                  <strong>{summary.rejectedRequests}</strong>
                  <span>ไม่อนุมัติ</span>
                </div>
                <div className="whq-leave-overview__count" data-testid="leave-summary-cancelled">
                  <strong>{summary.cancelledRequests}</strong>
                  <span>ยกเลิก</span>
                </div>
              </div>
            </div>

            <div className="whq-stat-grid whq-employee-leave-summary">
              <SummaryCard
                label="ลากรณีฉุกเฉินคงเหลือ"
                value={summary.emergencyLeaveRemaining}
                tone="emergency"
              />
              <SummaryCard label="ลาป่วยทั้งปี" value={summary.sickLeaveUsed} tone="sick" />
              <SummaryCard
                label="ลาไม่รับค่าจ้างทั้งปี"
                value={summary.unpaidLeaveUsed}
                tone="unpaid"
              />
            </div>
          </div>
        )}
      </WorkHQPageState>

      {canWrite && (data?.balances?.length ?? 0) > 0 && (
        <WorkHQCard title="ยอดใช้ก่อนเริ่มระบบ" className="whq-detail-card whq-detail-card--wide">
          <p className="whq-muted whq-mb-sm">
            กรอกจำนวนวันที่ใช้ไปแล้วนอกระบบก่อนเริ่มใช้ WorkHQ — ระบบจะรวมกับรายการที่อนุมัติในระบบให้อัตโนมัติ
          </p>
          <WorkHQButton
            type="button"
            variant="secondary"
            data-testid="leave-toggle-prior"
            onClick={() => setShowPriorForm((value) => !value)}
          >
            {showPriorForm ? 'ซ่อนฟอร์ม' : 'กรอกยอดใช้ก่อนเริ่มระบบ'}
          </WorkHQButton>
          {showPriorForm && (
            <div className="whq-leave-prior-form" data-testid="leave-prior-form">
              <div className="whq-leave-prior-grid">
                {priorDraft.map((row) => (
                  <div key={row.leaveTypeCode} className="whq-leave-prior-item">
                    <div className="whq-leave-prior-item__title">{row.leaveTypeName}</div>
                    <WorkHQField label="ใช้ไปก่อนเริ่มระบบ (วัน)">
                      <WorkHQInput
                        type="number"
                        min={0}
                        step={0.5}
                        value={String(row.priorUsed)}
                        data-testid={`leave-prior-${row.leaveTypeCode}`}
                        onChange={(event) => updatePriorDraft(
                          row.leaveTypeCode,
                          'priorUsed',
                          event.target.value,
                        )}
                      />
                    </WorkHQField>
                    {row.entitledEditable && (
                      <WorkHQField label="สิทธิ์ลากรณีฉุกเฉินรอบนี้ (วัน)">
                        <WorkHQInput
                          type="number"
                          min={0}
                          step={0.5}
                          value={String(row.entitled)}
                          data-testid={`leave-entitled-${row.leaveTypeCode}`}
                          onChange={(event) => updatePriorDraft(
                            row.leaveTypeCode,
                            'entitled',
                            event.target.value,
                          )}
                        />
                      </WorkHQField>
                    )}
                  </div>
                ))}
              </div>
              {priorError && <p className="whq-form-error">{priorError}</p>}
              {priorSaved && (
                <p className="whq-form-success" data-testid="leave-prior-saved">บันทึกแล้ว</p>
              )}
              <div className="whq-btn-group">
                <WorkHQButton
                  type="button"
                  data-testid="leave-prior-save"
                  disabled={priorSaving}
                  onClick={() => void handleSavePriorUsage()}
                >
                  {priorSaving ? 'กำลังบันทึก…' : 'บันทึกยอดใช้ก่อนเริ่มระบบ'}
                </WorkHQButton>
              </div>
            </div>
          )}
        </WorkHQCard>
      )}

      <WorkHQCard title="ประวัติการลา / วันหยุด" className="whq-detail-card whq-detail-card--wide">
        <div className="whq-employee-leave-toolbar">
          <WorkHQField label="ปี">
            <WorkHQSelect
              value={year}
              data-testid="leave-filter-year"
              onChange={(event) => setYear(event.target.value)}
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="ประเภทการลา">
            <WorkHQSelect
              value={leaveType}
              data-testid="leave-filter-type"
              onChange={(event) => setLeaveType(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              {typeOptions.map((option) => (
                <option key={option.code} value={option.code}>{option.name}</option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="สถานะ">
            <WorkHQSelect
              value={status}
              data-testid="leave-filter-status"
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="pending">รออนุมัติ</option>
              <option value="approved">อนุมัติแล้ว</option>
              <option value="rejected">ไม่อนุมัติ</option>
              <option value="cancelled">ยกเลิก</option>
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="ค้นหา">
            <WorkHQInput
              type="search"
              value={search}
              placeholder="ค้นหาประเภท สถานะ เหตุผล หรือผู้อนุมัติ"
              data-testid="leave-search"
              onChange={(event) => setSearch(event.target.value)}
            />
          </WorkHQField>
        </div>

        {actionError && <p className="whq-form-error">{actionError}</p>}

        <WorkHQPageState
          state={tableState}
          loading={<LeaveSummarySkeleton />}
          error={(
            <WorkHQErrorState
              referenceCode={error instanceof ApiError ? error.requestId : undefined}
              onRetry={() => void load()}
            />
          )}
          empty={(
            <WorkHQEmptyState
              title="ยังไม่มีรายการลา"
              description="ประวัติการลาของพนักงานจะแสดงที่นี่เมื่อมีคำขอลา"
            />
          )}
        >
          <div className="whq-table-wrap">
            <table className="whq-table whq-employee-leave-table" data-testid="employee-leave-table">
              <thead>
                <tr>
                  <th>ยื่นเมื่อ</th>
                  <th>ประเภท</th>
                  <th>วันที่</th>
                  <th>สถานะ</th>
                  <th>หมายเหตุ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => {
                  const userReason = leaveUserReason(row);
                  const sameDay = row.startDate === row.endDate;
                  return (
                    <tr
                      key={row.id}
                      data-testid={`leave-row-${row.id}`}
                      className="whq-table-row-clickable"
                      onClick={() => setSelected(row)}
                    >
                      <td className="whq-leave-col-date">{formatThaiDate(row.requestDate.slice(0, 10))}</td>
                      <td>
                        <div className="whq-leave-type-cell">
                          <span className="whq-leave-type-name">{leaveTypeDisplayName(row)}</span>
                          <div className="whq-leave-chips">
                            {row.previousDate && (
                              <span className="whq-leave-chip whq-leave-chip--change">เปลี่ยนวัน</span>
                            )}
                            {row.shortNotice && (
                              <span className="whq-leave-chip whq-leave-chip--deduct">หักเงิน</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {row.previousDate ? (
                          <div className="whq-leave-date-change">
                            <strong>{formatThaiDate(row.startDate)}</strong>
                            <span className="whq-muted whq-text-sm">จาก {formatThaiDate(row.previousDate)}</span>
                          </div>
                        ) : sameDay ? (
                          formatThaiDate(row.startDate)
                        ) : (
                          <div className="whq-leave-date-range">
                            {formatThaiDate(row.startDate)}
                            <span className="whq-muted"> – </span>
                            {formatThaiDate(row.endDate)}
                            <span className="whq-muted whq-text-sm"> ({row.days} วัน)</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`whq-badge whq-badge-${leaveStatusVariant(row.status)}`}
                          data-testid={`leave-status-${row.id}`}
                        >
                          {leaveStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="whq-leave-col-note">{userReason ?? '—'}</td>
                      <td>
                        <div className="whq-btn-group">
                          <WorkHQButton
                            type="button"
                            variant="secondary"
                            data-testid={`leave-view-${row.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(row);
                            }}
                          >
                            ดู
                          </WorkHQButton>
                          {canWrite && row.source !== 'off_day_change' && (
                            <>
                              <WorkHQButton
                                type="button"
                                variant="secondary"
                                data-testid={`leave-edit-${row.id}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setEditing(row);
                                }}
                              >
                                แก้
                              </WorkHQButton>
                              <WorkHQButton
                                type="button"
                                variant="danger"
                                data-testid={`leave-delete-${row.id}`}
                                disabled={deletingId === row.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDelete(row);
                                }}
                              >
                                {deletingId === row.id ? '…' : 'ลบ'}
                              </WorkHQButton>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </WorkHQPageState>
      </WorkHQCard>

      {yearUsage.length > 0 && (
        <WorkHQCard
          title={`สรุปวันลาทั้งปี ${currentYear}`}
          className="whq-detail-card whq-detail-card--wide"
        >
          <div className="whq-leave-year-usage" data-testid="leave-year-usage">
            <div className="whq-table-wrap">
              <table className="whq-table whq-leave-year-usage-table">
                <thead>
                  <tr>
                    <th>ประเภท</th>
                    <th>ใช้นอกระบบ</th>
                    <th>ใช้ในระบบ</th>
                    <th>รวมทั้งปี</th>
                    <th>คงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  {yearUsage.map((row) => (
                    <tr key={row.leaveTypeCode} data-testid={`leave-year-usage-${row.leaveTypeCode}`}>
                      <td>{row.leaveTypeName}</td>
                      <td>{row.priorUsed}</td>
                      <td>{row.systemUsed}</td>
                      <td><strong>{row.totalUsed}</strong></td>
                      <td>{row.remaining == null ? '—' : row.remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </WorkHQCard>
      )}

      {selected && (
        <LeaveRequestDetailModal item={selected} onClose={() => setSelected(null)} />
      )}

      {editing && (
        <LeaveRequestEditModal
          item={editing}
          employeeId={employeeId}
          companyId={companyId}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            if (next) setData(next);
            else void load();
          }}
        />
      )}
    </div>
  );
}
