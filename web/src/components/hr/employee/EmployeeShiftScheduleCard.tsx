import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  fetchCompanyShifts,
  fetchEmployeeShiftProfile,
  formatShiftMinutes,
  scheduleShiftAssignment,
  type EmployeeShiftProfile,
  type ShiftOption,
  type ShiftAssignmentView,
} from '../../../api/shift-assignments';
import { formatThaiDate, NO_DATA } from '../../../lib/employee-date-utils';
import {
  WorkHQButton,
  WorkHQCard,
  WorkHQField,
  WorkHQInput,
  WorkHQDateInput,
  WorkHQSelect,
} from '../../ui';

interface EmployeeShiftScheduleCardProps {
  employeeId: string;
  companyId: string;
  canEdit: boolean;
}

function shiftTimeLabel(startMinutes: number, endMinutes: number): string {
  return `${formatShiftMinutes(startMinutes)} – ${formatShiftMinutes(endMinutes)}`;
}

function AssignmentBlock({
  title,
  assignment,
}: {
  title: string;
  assignment: ShiftAssignmentView | null;
}) {
  if (!assignment) {
    return (
      <div className="whq-info-row">
        <span className="whq-info-label">{title}</span>
        <span className="whq-info-value">{NO_DATA}</span>
      </div>
    );
  }
  return (
    <div className="whq-shift-block">
      <div className="whq-info-row">
        <span className="whq-info-label">{title}</span>
        <span className="whq-info-value">
          {assignment.shiftName} ({shiftTimeLabel(assignment.startMinutes, assignment.endMinutes)})
        </span>
      </div>
      <div className="whq-info-row">
        <span className="whq-info-label">มีผลตั้งแต่</span>
        <span className="whq-info-value">{formatThaiDate(assignment.effectiveFrom)}</span>
      </div>
      {assignment.effectiveTo && (
        <div className="whq-info-row">
          <span className="whq-info-label">ถึง</span>
          <span className="whq-info-value">{formatThaiDate(assignment.effectiveTo)}</span>
        </div>
      )}
    </div>
  );
}

export function EmployeeShiftScheduleCard({
  employeeId,
  companyId,
  canEdit,
}: EmployeeShiftScheduleCardProps) {
  const [profile, setProfile] = useState<EmployeeShiftProfile | null>(null);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [shiftId, setShiftId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [reason, setReason] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([
        fetchEmployeeShiftProfile(employeeId, companyId),
        fetchCompanyShifts(companyId),
      ]);
      setProfile(p);
      setShifts(s.filter((row) => row.isActive !== false));
      if (s.length > 0) setShiftId((prev) => prev || s[0].id);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลกะไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [employeeId, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitSchedule() {
    if (!shiftId || !effectiveFrom) {
      setSaveError('กรุณาเลือกกะและวันที่เริ่มมีผล');
      return;
    }
    setScheduling(true);
    setSaveError(null);
    try {
      await scheduleShiftAssignment(employeeId, {
        companyId,
        shiftId,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
        reason: reason || undefined,
      });
      setShowForm(false);
      setEffectiveFrom('');
      setEffectiveTo('');
      setReason('');
      await load();
    } catch (err: unknown) {
      setSaveError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setScheduling(false);
    }
  }

  if (loading) return <p className="whq-muted">กำลังโหลดกะงาน…</p>;
  if (error) return <p className="whq-error">{error}</p>;

  return (
    <WorkHQCard title="กะงานและตารางกะ" className="whq-detail-card" data-testid="shift-schedule-card">
      <div className="whq-detail-card-body">
        <AssignmentBlock title="กะปัจจุบัน (วันนี้)" assignment={profile?.current ?? null} />
        <AssignmentBlock title="กะที่กำหนดล่วงหน้า" assignment={profile?.nextScheduled ?? null} />

        {canEdit && (
          <div className="whq-action-row" style={{ marginTop: '1rem' }}>
            {!showForm && (
              <WorkHQButton type="button" variant="secondary" onClick={() => setShowForm(true)}>
                กำหนดกะล่วงหน้า
              </WorkHQButton>
            )}
          </div>
        )}

        {showForm && (
          <div className="whq-form-stack" style={{ marginTop: '1rem' }}>
            <WorkHQField label="กะ">
              <WorkHQSelect value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({shiftTimeLabel(s.startMinutes, s.endMinutes)})
                  </option>
                ))}
              </WorkHQSelect>
            </WorkHQField>
            <WorkHQField label="เริ่มมีผล (วันที่)">
              <WorkHQDateInput value={effectiveFrom} onChange={setEffectiveFrom} />
            </WorkHQField>
            <WorkHQField label="สิ้นสุด (ไม่บังคับ)">
              <WorkHQDateInput value={effectiveTo} onChange={setEffectiveTo} />
            </WorkHQField>
            <WorkHQField label="เหตุผล">
              <WorkHQInput value={reason} onChange={(e) => setReason(e.target.value)} />
            </WorkHQField>
            {saveError && <p className="whq-error">{saveError}</p>}
            <div className="whq-action-row">
              <WorkHQButton type="button" variant="primary" disabled={scheduling} onClick={() => void submitSchedule()}>
                บันทึกกำหนดการ
              </WorkHQButton>
              <WorkHQButton type="button" variant="secondary" disabled={scheduling} onClick={() => setShowForm(false)}>
                ยกเลิก
              </WorkHQButton>
            </div>
          </div>
        )}

        {profile && profile.history.length > 0 && (
          <div style={{ marginTop: '1.25rem' }}>
            <h4 className="whq-subheading">ประวัติการกำหนดกะ</h4>
            <table className="whq-table whq-table-compact">
              <thead>
                <tr>
                  <th>กะ</th>
                  <th>เริ่ม</th>
                  <th>สิ้นสุด</th>
                  <th>เหตุผล</th>
                </tr>
              </thead>
              <tbody>
                {profile.history.map((h: ShiftAssignmentView) => (
                  <tr key={h.id}>
                    <td>{h.shiftName}</td>
                    <td>{formatThaiDate(h.effectiveFrom)}</td>
                    <td>{h.effectiveTo ? formatThaiDate(h.effectiveTo) : '—'}</td>
                    <td>{h.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </WorkHQCard>
  );
}
