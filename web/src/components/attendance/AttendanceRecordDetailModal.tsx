import { FormEvent, useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import type { EmployeeAttendanceHistoryItem } from '../../api/employee-attendance';
import {
  deleteEmployeeOvertimeRecord,
  updateEmployeeAttendanceRecord,
} from '../../api/employee-attendance';
import { deleteEmployeeLeaveRequest } from '../../api/employee-leave';
import { formatThaiDate, NO_DATA } from '../../lib/employee-date-utils';
import { parseThaiTimeInput, THAI_TIME_INPUT_HINT } from '../../lib/thai-time-input';
import {
  attendanceStatusLabel,
  attendanceStatusVariant,
  breakOverageMinutesOf,
  buildDayEventLines,
  formatAttendanceTime,
  formatBreakTotalDisplay,
  formatWorkedHours,
  hasBreakOverage,
  isOffDayStatus,
  leaveTypeFullLabel,
} from '../../lib/employee-attendance-utils';
import { WorkHQButton, WorkHQField, WorkHQInput, WorkHQSelect } from '../ui';

interface AttendanceRecordDetailModalProps {
  item: EmployeeAttendanceHistoryItem;
  employeeId: string;
  companyId: string;
  canEdit?: boolean;
  startInEditMode?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="whq-info-row">
      <span className="whq-info-label">{label}</span>
      <span className="whq-info-value">{value || NO_DATA}</span>
    </div>
  );
}

function shiftLabel(shift: string | null): string {
  if (shift === 'night') return 'กะดึก';
  if (shift === 'day') return 'กะเช้า';
  return shift ?? NO_DATA;
}

function toTimeInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
}

function buildCorrectedAtIso(workDate: string, timeValue: string): string | null {
  const parts = parseThaiTimeInput(timeValue);
  if (!parts) return null;
  const date = new Date(`${workDate}T00:00:00+07:00`);
  date.setHours(parts.hours, parts.minutes, 0, 0);
  return date.toISOString();
}

function normalizeShift(shift: string | null): 'day' | 'night' {
  return shift === 'night' ? 'night' : 'day';
}

export function AttendanceRecordDetailModal({
  item,
  employeeId,
  companyId,
  canEdit = false,
  startInEditMode = false,
  onClose,
  onSaved,
}: AttendanceRecordDetailModalProps) {
  const variant = attendanceStatusVariant(item.status);
  const workDate = item.date.slice(0, 10);
  const isOff = isOffDayStatus(item.status);
  const [editing, setEditing] = useState(false);
  const [checkInTime, setCheckInTime] = useState(() => toTimeInputValue(item.checkInAt));
  const [checkOutTime, setCheckOutTime] = useState(() => toTimeInputValue(item.checkOutAt));
  const [breakMinutes, setBreakMinutes] = useState(String(item.breakMinutes));
  const [workedHours, setWorkedHours] = useState(String(item.workedHours));
  const [otHours, setOtHours] = useState(String(item.otHours));
  const [lateMinutes, setLateMinutes] = useState(String(item.lateMinutes));
  const [shift, setShift] = useState<'day' | 'night'>(normalizeShift(item.shift));
  const [workCategory, setWorkCategory] = useState<'office' | 'wfh'>(
    item.workCategory === 'wfh' ? 'wfh' : 'office',
  );
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  function startEdit() {
    setCheckInTime(toTimeInputValue(item.checkInAt));
    setCheckOutTime(toTimeInputValue(item.checkOutAt));
    setBreakMinutes(String(item.breakMinutes));
    setWorkedHours(String(item.workedHours));
    setOtHours(String(item.otHours));
    setLateMinutes(String(item.lateMinutes));
    setShift(normalizeShift(item.shift));
    setWorkCategory(item.workCategory === 'wfh' ? 'wfh' : 'office');
    setReason('');
    setSubmitError(null);
    setSubmitSuccess(null);
    setEditing(true);
  }

  useEffect(() => {
    if (startInEditMode && canEdit) {
      startEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open edit form once per modal open
  }, [startInEditMode, canEdit, item.id]);

  async function onSubmitEdit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setSubmitError('กรุณาระบุเหตุผล');
      return;
    }

    const checkInAt = checkInTime.trim() ? buildCorrectedAtIso(workDate, checkInTime) : null;
    const checkOutAt = checkOutTime.trim() ? buildCorrectedAtIso(workDate, checkOutTime) : null;
    if (checkInTime.trim() && !checkInAt) {
      setSubmitError(`รูปแบบเวลาเช็กอินไม่ถูกต้อง (${THAI_TIME_INPUT_HINT})`);
      return;
    }
    if (checkOutTime.trim() && !checkOutAt) {
      setSubmitError(`รูปแบบเวลาเช็กเอาต์ไม่ถูกต้อง (${THAI_TIME_INPUT_HINT})`);
      return;
    }

    const parsedBreak = Number(breakMinutes);
    const parsedWorked = Number(workedHours);
    const parsedOt = Number(otHours);
    const parsedLate = Number(lateMinutes);
    if ([parsedBreak, parsedWorked, parsedOt, parsedLate].some((n) => Number.isNaN(n) || n < 0)) {
      setSubmitError('กรุณากรอกตัวเลขให้ถูกต้อง');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      await updateEmployeeAttendanceRecord(employeeId, item.id, {
        companyId,
        reason: reason.trim(),
        checkInAt,
        checkOutAt,
        breakMinutes: parsedBreak,
        workedHours: parsedWorked,
        lateMinutes: parsedLate,
        otHours: parsedOt,
        shift,
        workCategory,
      });
      setSubmitSuccess('บันทึกการแก้ไขเวลาทำงานแล้ว');
      setEditing(false);
      onSaved?.();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteOt() {
    if (!item.overtimeRecordId || !canEdit) return;
    const reason = window.prompt('เหตุผลการลบ OT');
    if (!reason?.trim()) return;
    setActionBusy(true);
    setSubmitError(null);
    try {
      await deleteEmployeeOvertimeRecord(employeeId, item.overtimeRecordId, {
        companyId,
        reason: reason.trim(),
      });
      setSubmitSuccess('ลบ OT แล้ว');
      onSaved?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'ลบ OT ไม่สำเร็จ');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDeleteLeave() {
    if (!item.leaveRequestId || !canEdit) return;
    const reason = window.prompt('เหตุผลการลบวันลา');
    if (!reason?.trim()) return;
    setActionBusy(true);
    setSubmitError(null);
    try {
      await deleteEmployeeLeaveRequest(employeeId, companyId, {
        id: item.leaveRequestId,
        requestDate: `${item.date}T00:00:00.000Z`,
        leaveTypeCode: item.leaveTypeCode ?? 'sick',
        leaveTypeName: leaveTypeFullLabel(item.leaveTypeCode, item.leaveTypeName),
        startDate: item.date,
        endDate: item.date,
        days: 1,
        status: 'approved',
        approverName: null,
        reason: reason.trim(),
        workflowInstanceId: null,
        source: 'leave_request',
      });
      setSubmitSuccess('ลบวันลาแล้ว');
      onSaved?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'ลบวันลาไม่สำเร็จ');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="whq-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="whq-modal whq-card whq-attendance-detail-modal"
        onClick={(event) => event.stopPropagation()}
        data-testid="attendance-record-detail-modal"
      >
        <div className="whq-modal-head">
          <div>
            <h2>รายละเอียดวันทำงาน</h2>
            <p className="whq-attendance-detail-modal__date">{formatThaiDate(item.date)}</p>
          </div>
          <span className={`whq-badge whq-badge-${variant}`}>{attendanceStatusLabel(item.status)}</span>
        </div>

        {!editing ? (
          <>
            {isOff ? (
              <div className="whq-att-day-detail" data-testid="attendance-day-detail">
                {item.status === 'holiday' ? (
                  <p className="whq-muted">วันนี้เป็นวันหยุดประจำเดือน — ไม่มีการเข้างาน</p>
                ) : (
                  <>
                    <div className="whq-att-day-detail__section">
                      <div className="whq-att-day-detail__title">ประเภทการลา</div>
                      <div className="whq-att-day-detail__item">
                        <strong data-testid="attendance-detail-leave-type">
                          {leaveTypeFullLabel(item.leaveTypeCode, item.leaveTypeName)}
                        </strong>
                      </div>
                    </div>
                    <p className="whq-muted">วันนี้ลางาน — ไม่มีการเข้างาน</p>
                  </>
                )}
              </div>
            ) : (
              <div className="whq-att-day-detail" data-testid="attendance-day-detail">
                {(() => {
                  const eventLines = buildDayEventLines(item, formatAttendanceTime);
                  if (eventLines.length === 0) return null;
                  return (
                    <div
                      className="whq-att-day-detail__section whq-att-day-detail__section--events"
                      data-testid="attendance-detail-events"
                    >
                      <div className="whq-att-day-detail__title">สรุปเหตุการณ์วันนี้</div>
                      <ul className="whq-att-day-events">
                        {eventLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      {(item.lateMinutes > 0 && hasBreakOverage(item)) && (
                        <p className="whq-muted whq-text-sm whq-att-day-events__hint">
                          เข้างานสาย กับ พักเกินเวลา เป็นคนละรายการ — หักแยกกัน
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div className="whq-att-day-detail__section">
                  <div className="whq-att-day-detail__title">เวลาเข้า–ออก</div>
                  <div className="whq-att-day-detail__grid">
                    <div className="whq-att-day-detail__item">
                      <span>เข้างาน</span>
                      <strong data-testid="attendance-detail-check-in">
                        {formatAttendanceTime(item.checkInAt)}
                      </strong>
                    </div>
                    <div className="whq-att-day-detail__item">
                      <span>พักรวม</span>
                      <strong data-testid="attendance-detail-break">
                        {formatBreakTotalDisplay(item)}
                      </strong>
                    </div>
                    <div className="whq-att-day-detail__item">
                      <span>เลิกงาน</span>
                      <strong data-testid="attendance-detail-check-out">
                        {formatAttendanceTime(item.checkOutAt)}
                      </strong>
                    </div>
                  </div>
                  {hasBreakOverage(item) && (
                    <div className="whq-att-day-detail__ot-block" data-testid="attendance-detail-break-over">
                      <p className="whq-text-sm">
                        <strong>พักเกิน {breakOverageMinutesOf(item)} นาที</strong>
                        {' '}(จากพักรวม {item.breakMinutes} นาที − สิทธิ์ {item.breakAllowedMinutes ?? 0} นาที)
                        {(item.breakDeduction ?? 0) > 0
                          ? ` → หัก ฿${item.breakDeduction!.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`
                          : ''}
                      </p>
                    </div>
                  )}
                </div>

                <div className="whq-att-day-detail__section">
                  <div className="whq-att-day-detail__title">สรุปชั่วโมง</div>
                  <div className="whq-att-day-detail__grid">
                    <div className="whq-att-day-detail__item">
                      <span>ชั่วโมงทำงาน</span>
                      <strong>{formatWorkedHours(item.workedHours)}</strong>
                    </div>
                    <div className="whq-att-day-detail__item">
                      <span>OT</span>
                      <strong>{item.otHours > 0 ? `${item.otHours} ชม.` : '—'}</strong>
                    </div>
                    <div className="whq-att-day-detail__item">
                      <span>เข้างานสาย</span>
                      <strong>
                        {item.lateMinutes > 0 ? `${item.lateMinutes} นาที` : '—'}
                      </strong>
                    </div>
                  </div>
                  {item.otHours > 0 && (
                    <div className="whq-att-day-detail__ot-block" data-testid="attendance-detail-ot-block">
                      {item.otValid === false && (
                        <p className="whq-form-error" data-testid="attendance-ot-invalid">
                          OT ไม่ถูกต้อง — ไม่มีเช็กอินเข้างานวันนั้น (ควรลบรายการนี้)
                        </p>
                      )}
                      <InfoRow
                        label="เวลา OT"
                        value={
                          item.otStartAt || item.otEndAt
                            ? `${formatAttendanceTime(item.otStartAt ?? null)} – ${formatAttendanceTime(item.otEndAt ?? null)}`
                            : NO_DATA
                        }
                      />
                      {item.otReason && <InfoRow label="เหตุผล OT" value={item.otReason} />}
                    </div>
                  )}
                </div>

                <div className="whq-att-day-detail__section">
                  <div className="whq-att-day-detail__title">อื่นๆ</div>
                  <InfoRow label="กะ" value={shiftLabel(item.shift)} />
                  <InfoRow
                    label="สถานที่ทำงาน"
                    value={item.workCategory === 'wfh' ? 'WFH' : 'Office'}
                  />
                </div>
              </div>
            )}

            {submitError && <p className="whq-form-error">{submitError}</p>}
            {submitSuccess && <p className="whq-form-success">{submitSuccess}</p>}

            <div className="whq-modal-actions">
              {canEdit && item.status === 'leave' && item.leaveRequestId && (
                <WorkHQButton
                  type="button"
                  variant="danger"
                  disabled={actionBusy}
                  onClick={() => void handleDeleteLeave()}
                >
                  ลบวันลา
                </WorkHQButton>
              )}
              {canEdit && item.overtimeRecordId && item.otHours > 0 && (
                <WorkHQButton
                  type="button"
                  variant="danger"
                  disabled={actionBusy}
                  data-testid="attendance-delete-ot"
                  onClick={() => void handleDeleteOt()}
                >
                  ลบ OT
                </WorkHQButton>
              )}
              {canEdit && !isOff && !item.id.startsWith('ot-only:') && (
                <WorkHQButton type="button" variant="primary" onClick={startEdit}>
                  แก้ไขเวลาเข้างาน
                </WorkHQButton>
              )}
              <WorkHQButton type="button" variant="secondary" onClick={onClose}>
                ปิด
              </WorkHQButton>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmitEdit} className="whq-form-grid" style={{ marginTop: '0.5rem' }}>
            <InfoRow label="วันที่" value={formatThaiDate(item.date)} />
            <WorkHQField label="กะ">
              <WorkHQSelect value={shift} onChange={(event) => setShift(event.target.value as 'day' | 'night')}>
                <option value="day">กะเช้า</option>
                <option value="night">กะดึก</option>
              </WorkHQSelect>
            </WorkHQField>
            <WorkHQField label={`เข้างาน (${THAI_TIME_INPUT_HINT})`}>
              <WorkHQInput
                type="time"
                value={checkInTime}
                onChange={(event) => setCheckInTime(event.target.value)}
              />
            </WorkHQField>
            <WorkHQField label={`เลิกงาน (${THAI_TIME_INPUT_HINT})`}>
              <WorkHQInput
                type="time"
                value={checkOutTime}
                onChange={(event) => setCheckOutTime(event.target.value)}
              />
            </WorkHQField>
            <WorkHQField label="พัก (นาที)">
              <WorkHQInput
                type="number"
                min={0}
                value={breakMinutes}
                onChange={(event) => setBreakMinutes(event.target.value)}
                required
              />
            </WorkHQField>
            <WorkHQField label="ชั่วโมงทำงาน">
              <WorkHQInput
                type="number"
                min={0}
                step={0.01}
                value={workedHours}
                onChange={(event) => setWorkedHours(event.target.value)}
                required
              />
            </WorkHQField>
            <WorkHQField label="OT (ชม.)">
              <WorkHQInput
                type="number"
                min={0}
                step={0.01}
                value={otHours}
                onChange={(event) => setOtHours(event.target.value)}
                required
              />
            </WorkHQField>
            <WorkHQField label="สาย (นาที)">
              <WorkHQInput
                type="number"
                min={0}
                value={lateMinutes}
                onChange={(event) => setLateMinutes(event.target.value)}
                required
              />
            </WorkHQField>
            <WorkHQField label="สถานที่ทำงาน (วันนี้)">
              <WorkHQSelect
                value={workCategory}
                onChange={(event) => setWorkCategory(event.target.value as 'office' | 'wfh')}
              >
                <option value="office">Office — ได้ค่าอาหาร</option>
                <option value="wfh">WFH — ไม่ได้ค่าอาหาร</option>
              </WorkHQSelect>
            </WorkHQField>
            <WorkHQField label="เหตุผล">
              <WorkHQInput
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="เช่น แก้ไขตามที่พนักงานแจ้ง / ข้อมูลจากกล้อง"
                required
              />
            </WorkHQField>
            {submitError && <p className="whq-error-text">{submitError}</p>}
            {submitSuccess && <p className="whq-success-text">{submitSuccess}</p>}
            <div className="whq-action-row">
              <WorkHQButton type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
              </WorkHQButton>
              <WorkHQButton type="button" variant="ghost" onClick={() => setEditing(false)}>
                ยกเลิก
              </WorkHQButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
