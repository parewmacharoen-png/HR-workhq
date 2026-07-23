import { useState } from 'react';
import { ApiError } from '../../api/client';
import type { EmployeeAttendanceHistoryItem } from '../../api/employee-attendance';
import { deleteEmployeeOvertimeRecord } from '../../api/employee-attendance';
import { formatThaiDate, NO_DATA } from '../../lib/employee-date-utils';
import {
  attendanceStatusLabel,
  breakOverageMinutesOf,
  formatBreakTotalDisplay,
  formatAttendanceTime,
  formatWorkedHours,
  hasBreakOverage,
  isWorkDayStatus,
  leaveTypeFullLabel,
} from '../../lib/employee-attendance-utils';
import { WorkHQButton } from '../ui';

export type AttendanceSummaryKind =
  | 'working-days'
  | 'holiday-days'
  | 'leave-days'
  | 'late-month'
  | 'absent-month'
  | 'ot-month'
  | 'break-over-month'
  | 'office-days'
  | 'wfh-days';

const TITLES: Record<AttendanceSummaryKind, string> = {
  'working-days': 'วันทำงานเดือนนี้',
  'holiday-days': 'วันหยุดเดือนนี้',
  'leave-days': 'วันลาเดือนนี้',
  'late-month': 'มาสายเดือนนี้',
  'absent-month': 'ขาดงานเดือนนี้',
  'ot-month': 'OT เดือนนี้',
  'break-over-month': 'พักเกินเวลาเดือนนี้',
  'office-days': 'วัน Office เดือนนี้',
  'wfh-days': 'วัน WFH เดือนนี้',
};

function currentMonthPrefix(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function filterSummaryHistory(
  history: EmployeeAttendanceHistoryItem[],
  kind: AttendanceSummaryKind,
): EmployeeAttendanceHistoryItem[] {
  const prefix = currentMonthPrefix();
  const monthItems = history.filter((row) => row.date.startsWith(prefix));
  switch (kind) {
    case 'working-days':
      return monthItems.filter((row) => isWorkDayStatus(row.status));
    case 'holiday-days':
      return monthItems.filter((row) => row.status === 'holiday');
    case 'leave-days':
      return monthItems.filter((row) => row.status === 'leave');
    case 'late-month':
      return monthItems.filter((row) => row.status === 'late' || row.lateMinutes > 0);
    case 'absent-month':
      return monthItems.filter((row) => row.status === 'absent');
    case 'ot-month':
      return monthItems.filter((row) => row.otHours > 0);
    case 'break-over-month':
      return monthItems.filter((row) => hasBreakOverage(row));
    case 'office-days':
      return monthItems.filter((row) => isWorkDayStatus(row.status) && row.workCategory === 'office');
    case 'wfh-days':
      return monthItems.filter((row) => isWorkDayStatus(row.status) && row.workCategory === 'wfh');
    default:
      return [];
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="whq-att-summary-card__fact">
      <div className="whq-att-summary-card__fact-label">{label}</div>
      <div className="whq-att-summary-card__fact-value">{value}</div>
    </div>
  );
}

function rowFacts(
  kind: AttendanceSummaryKind,
  row: EmployeeAttendanceHistoryItem,
): Array<{ label: string; value: string }> {
  if (kind === 'ot-month') {
    return [
      {
        label: 'เวลา OT',
        value: row.otStartAt || row.otEndAt
          ? `${formatAttendanceTime(row.otStartAt ?? null)} – ${formatAttendanceTime(row.otEndAt ?? null)}`
          : NO_DATA,
      },
      { label: 'ชั่วโมง', value: `${row.otHours} ชม.` },
      { label: 'เหตุผล', value: row.otReason ?? NO_DATA },
      ...(row.otValid === false
        ? [{ label: 'หมายเหตุ', value: 'OT ไม่ถูกต้อง — ไม่มีเช็กอิน' }]
        : []),
    ];
  }

  if (kind === 'leave-days') {
    return [
      { label: 'ประเภท', value: leaveTypeFullLabel(row.leaveTypeCode, row.leaveTypeName) },
      { label: 'สถานะ', value: attendanceStatusLabel(row.status) },
    ];
  }

  if (kind === 'holiday-days') {
    return [{ label: 'สถานะ', value: 'วันหยุดประจำเดือน' }];
  }

  if (kind === 'absent-month') {
    return [{ label: 'สถานะ', value: 'ขาดงาน' }];
  }

  if (kind === 'break-over-month') {
    const overage = breakOverageMinutesOf(row);
    const facts = [
      { label: 'เข้างาน', value: formatAttendanceTime(row.checkInAt) },
      { label: 'เลิกงาน', value: formatAttendanceTime(row.checkOutAt) },
      { label: 'พักรวม', value: formatBreakTotalDisplay(row) },
      { label: 'พักเกิน', value: `${overage} นาที` },
    ];
    if ((row.breakDeduction ?? 0) > 0) {
      facts.push({
        label: 'หักเงิน (จากพักเกิน)',
        value: `฿${row.breakDeduction!.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`,
      });
    }
    if (row.lateMinutes > 0) {
      facts.push({ label: 'สาย (คนละรายการ)', value: `${row.lateMinutes} นาที` });
    }
    return facts;
  }

  if (kind === 'late-month') {
    const facts = [
      { label: 'เข้างาน', value: formatAttendanceTime(row.checkInAt) },
      { label: 'เลิกงาน', value: formatAttendanceTime(row.checkOutAt) },
      { label: 'สาย', value: row.lateMinutes > 0 ? `${row.lateMinutes} นาที` : '—' },
      { label: 'พักรวม', value: formatBreakTotalDisplay(row) },
    ];
    if (hasBreakOverage(row)) {
      facts.push({ label: 'พักเกิน', value: `${breakOverageMinutesOf(row)} นาที` });
      if ((row.breakDeduction ?? 0) > 0) {
        facts.push({
          label: 'หักเงิน (จากพักเกิน)',
          value: `฿${row.breakDeduction!.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`,
        });
      }
    }
    return facts;
  }

  const facts = [
    { label: 'เข้างาน', value: formatAttendanceTime(row.checkInAt) },
    { label: 'เลิกงาน', value: formatAttendanceTime(row.checkOutAt) },
    { label: 'พักรวม', value: formatBreakTotalDisplay(row) },
  ];

  if (hasBreakOverage(row)) {
    facts.push({ label: 'พักเกิน', value: `${breakOverageMinutesOf(row)} นาที` });
    if ((row.breakDeduction ?? 0) > 0) {
      facts.push({
        label: 'หักเงิน (จากพักเกิน)',
        value: `฿${row.breakDeduction!.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`,
      });
    }
  }

  if (kind === 'working-days' || kind === 'office-days' || kind === 'wfh-days') {
    facts.push({ label: 'ชั่วโมงทำงาน', value: formatWorkedHours(row.workedHours) });
  } else if (row.lateMinutes > 0) {
    facts.push({ label: 'สาย', value: `${row.lateMinutes} นาที` });
  }

  if (row.otHours > 0) {
    facts.push({ label: 'OT', value: `${row.otHours} ชม.` });
  }

  return facts;
}

interface AttendanceSummaryDetailModalProps {
  kind: AttendanceSummaryKind;
  history: EmployeeAttendanceHistoryItem[];
  employeeId: string;
  companyId: string;
  canEdit?: boolean;
  onClose: () => void;
  onOpenDay: (row: EmployeeAttendanceHistoryItem) => void;
  onChanged?: () => void;
}

export function AttendanceSummaryDetailModal({
  kind,
  history,
  employeeId,
  companyId,
  canEdit = false,
  onClose,
  onOpenDay,
  onChanged,
}: AttendanceSummaryDetailModalProps) {
  const rows = filterSummaryHistory(history, kind);
  const title = TITLES[kind];
  const isOt = kind === 'ot-month';
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDeleteOt(row: EmployeeAttendanceHistoryItem) {
    if (!row.overtimeRecordId) return;
    const reason = window.prompt('เหตุผลการลบ OT');
    if (!reason?.trim()) return;
    setBusyId(row.overtimeRecordId);
    setActionError(null);
    try {
      await deleteEmployeeOvertimeRecord(employeeId, row.overtimeRecordId, {
        companyId,
        reason: reason.trim(),
      });
      onChanged?.();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'ลบ OT ไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="whq-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="whq-modal whq-card whq-att-summary-modal"
        onClick={(event) => event.stopPropagation()}
        data-testid="attendance-summary-detail-modal"
      >
        <div className="whq-modal-head">
          <div>
            <h2>{title}</h2>
            <p className="whq-att-summary-modal__meta">
              พบ {rows.length} รายการ · กดการ์ดเพื่อดูรายละเอียดวันนั้น
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="whq-muted">ไม่มีรายการในเดือนนี้</p>
        ) : (
          <div className="whq-att-summary-list" data-testid="attendance-summary-detail-table">
            {rows.map((row) => (
              <article
                key={row.id}
                className="whq-att-summary-card"
                data-testid={`attendance-summary-row-${row.id}`}
              >
                <div className="whq-att-summary-card__head">
                  <div className="whq-att-summary-card__date">{formatThaiDate(row.date)}</div>
                  <div className="whq-att-summary-card__actions">
                    <WorkHQButton
                      type="button"
                      variant="secondary"
                      onClick={() => onOpenDay(row)}
                    >
                      ดูวัน
                    </WorkHQButton>
                    {isOt && canEdit && row.overtimeRecordId && (
                      <WorkHQButton
                        type="button"
                        variant="danger"
                        disabled={busyId === row.overtimeRecordId}
                        onClick={() => void handleDeleteOt(row)}
                      >
                        ลบ OT
                      </WorkHQButton>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="whq-att-summary-card__main"
                  onClick={() => onOpenDay(row)}
                >
                  <div className="whq-att-summary-card__facts">
                    {rowFacts(kind, row).map((fact) => (
                      <Fact key={fact.label} label={fact.label} value={fact.value} />
                    ))}
                  </div>
                </button>
              </article>
            ))}
          </div>
        )}

        {actionError && <p className="whq-form-error">{actionError}</p>}

        <div className="whq-modal-actions">
          <WorkHQButton type="button" variant="secondary" onClick={onClose}>
            ปิด
          </WorkHQButton>
        </div>
      </div>
    </div>
  );
}
