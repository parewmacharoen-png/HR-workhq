import { FormEvent, useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  fetchEmployeeLeaveBalances,
  updateEmployeeLeaveRequest,
  type EmployeeLeaveHistoryItem,
  type EmployeeLeaveResponse,
} from '../../api/employee-leave';
import { WorkHQButton, WorkHQField, WorkHQInput, WorkHQSelect } from '../ui';

interface LeaveRequestEditModalProps {
  item: EmployeeLeaveHistoryItem;
  employeeId: string;
  companyId: string;
  onClose: () => void;
  onSaved: (data?: EmployeeLeaveResponse) => void;
}

export function LeaveRequestEditModal({
  item,
  employeeId,
  companyId,
  onClose,
  onSaved,
}: LeaveRequestEditModalProps) {
  const isMonthlyOff = item.source === 'monthly_off';
  const [leaveTypeCode, setLeaveTypeCode] = useState(item.leaveTypeCode);
  const [startDate, setStartDate] = useState(item.startDate);
  const [endDate, setEndDate] = useState(item.endDate);
  const [days, setDays] = useState(String(item.days));
  const [reason, setReason] = useState(item.reason ?? '');
  const [correctionReason, setCorrectionReason] = useState('');
  const [typeOptions, setTypeOptions] = useState<Array<{ code: string; name: string }>>([
    { code: item.leaveTypeCode, name: item.leaveTypeName },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (isMonthlyOff) return;
    void fetchEmployeeLeaveBalances(employeeId, companyId)
      .then((rows) => {
        const options = rows.map((row) => ({
          code: row.leaveTypeCode,
          name: row.leaveTypeName,
        }));
        if (!options.some((row) => row.code === item.leaveTypeCode)) {
          options.unshift({ code: item.leaveTypeCode, name: item.leaveTypeName });
        }
        setTypeOptions(options);
      })
      .catch(() => undefined);
  }, [companyId, employeeId, isMonthlyOff, item.leaveTypeCode, item.leaveTypeName]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!correctionReason.trim()) {
      setSubmitError('กรุณาระบุเหตุผลในการแก้ไข');
      return;
    }

    if (isMonthlyOff) {
      if (!startDate) {
        setSubmitError('กรุณาระบุวันที่');
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        const data = await updateEmployeeLeaveRequest(employeeId, companyId, item, {
          startDate,
          endDate: startDate,
          days: 1,
          offDate: item.startDate,
          correctionReason: correctionReason.trim(),
        });
        onSaved(data);
        onClose();
      } catch (err) {
        setSubmitError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const parsedDays = Number(days);
    if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
      setSubmitError('จำนวนวันไม่ถูกต้อง');
      return;
    }
    if (endDate < startDate) {
      setSubmitError('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const data = await updateEmployeeLeaveRequest(employeeId, companyId, item, {
        leaveTypeCode,
        startDate,
        endDate,
        days: parsedDays,
        reason: reason.trim() || undefined,
        correctionReason: correctionReason.trim(),
      });
      onSaved(data);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="whq-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="whq-modal whq-card whq-leave-edit-modal"
        onClick={(event) => event.stopPropagation()}
        data-testid="leave-request-edit-modal"
      >
        <div className="whq-modal-head">
          <h2>{isMonthlyOff ? 'แก้ไขวันหยุดประจำเดือน' : 'แก้ไขคำขอลา'}</h2>
        </div>

        <form onSubmit={(event) => void onSubmit(event)}>
          {!isMonthlyOff && (
            <WorkHQField label="ประเภทการลา">
              <WorkHQSelect
                value={leaveTypeCode}
                data-testid="leave-edit-type"
                onChange={(event) => setLeaveTypeCode(event.target.value)}
              >
                {typeOptions.map((option) => (
                  <option key={option.code} value={option.code}>{option.name}</option>
                ))}
              </WorkHQSelect>
            </WorkHQField>
          )}

          <WorkHQField label={isMonthlyOff ? 'วันที่หยุด' : 'วันที่เริ่ม'}>
            <WorkHQInput
              type="date"
              value={startDate}
              data-testid="leave-edit-start"
              onChange={(event) => {
                setStartDate(event.target.value);
                if (isMonthlyOff) setEndDate(event.target.value);
              }}
            />
          </WorkHQField>

          {!isMonthlyOff && (
            <>
              <WorkHQField label="วันที่สิ้นสุด">
                <WorkHQInput
                  type="date"
                  value={endDate}
                  data-testid="leave-edit-end"
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </WorkHQField>

              <WorkHQField label="จำนวนวัน">
                <WorkHQInput
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={days}
                  data-testid="leave-edit-days"
                  onChange={(event) => setDays(event.target.value)}
                />
              </WorkHQField>

              <WorkHQField label="เหตุผลการลา">
                <WorkHQInput
                  value={reason}
                  data-testid="leave-edit-reason"
                  onChange={(event) => setReason(event.target.value)}
                />
              </WorkHQField>
            </>
          )}

          <WorkHQField label="เหตุผลในการแก้ไข *">
            <WorkHQInput
              value={correctionReason}
              placeholder="เช่น แก้ไขข้อมูลตามที่พนักงานแจ้ง"
              data-testid="leave-edit-correction-reason"
              onChange={(event) => setCorrectionReason(event.target.value)}
            />
          </WorkHQField>

          <p className="whq-muted whq-text-sm">
            การบันทึกจะอัปเดตวันลา/วันหยุด การเข้างาน และเงินเดือนรอบที่ยังเปิดอยู่ให้สอดคล้องกันทั้งระบบ
          </p>

          {submitError && <p className="whq-form-error">{submitError}</p>}

          <div className="whq-modal-actions">
            <WorkHQButton type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              ยกเลิก
            </WorkHQButton>
            <WorkHQButton type="submit" disabled={submitting}>
              {submitting ? 'กำลังบันทึก…' : 'บันทึก'}
            </WorkHQButton>
          </div>
        </form>
      </div>
    </div>
  );
}
