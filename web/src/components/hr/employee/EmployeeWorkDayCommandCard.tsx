import { useEffect, useState } from 'react';
import {
  fetchEmployeeMonthWorkDays,
  fetchEmployeePayrollPreview,
  fetchEmployeeWorkDayToday,
  type PayrollPreviewDto,
  type WorkDayDto,
} from '../../../api/workday';
import { WorkHQCard } from '../../ui';

interface EmployeeWorkDayCommandCardProps {
  employeeId: string;
}

export function EmployeeWorkDayCommandCard({ employeeId }: EmployeeWorkDayCommandCardProps) {
  const month = new Date().toISOString().slice(0, 7);
  const [today, setToday] = useState<WorkDayDto | null>(null);
  const [preview, setPreview] = useState<PayrollPreviewDto | null>(null);
  const [timeline, setTimeline] = useState<WorkDayDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [todayRes, previewRes, monthRes] = await Promise.all([
          fetchEmployeeWorkDayToday(employeeId),
          fetchEmployeePayrollPreview(employeeId, month),
          fetchEmployeeMonthWorkDays(employeeId, month),
        ]);
        if (!cancelled) {
          setToday(todayRes);
          setPreview(previewRes);
          setTimeline(monthRes.slice(-14));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId, month]);

  if (loading) {
    return <WorkHQCard title="สถานะวันนี้">กำลังโหลด...</WorkHQCard>;
  }
  if (!today) return null;

  return (
    <div className="whq-stack" data-testid="employee-workday-command">
      <WorkHQCard title="สถานะวันนี้">
        <div className="whq-detail-grid">
          <div><strong>สถานะ</strong><div>{today.state}</div></div>
          <div><strong>กะวันนี้</strong><div>{today.shift?.shiftName ?? '—'}</div></div>
          <div><strong>เข้างาน</strong><div>{formatTime(today.attendance?.checkInAt)}</div></div>
          <div><strong>เลิกงาน</strong><div>{formatTime(today.attendance?.checkOutAt)}</div></div>
          <div><strong>สาย</strong><div>{today.attendance?.lateMinutes ? `${today.attendance.lateMinutes} นาที` : '—'}</div></div>
          <div><strong>OT</strong><div>{today.overtime.otHours > 0 ? `${today.overtime.otHours} ชม.` : '—'}</div></div>
        </div>
        {preview && (
          <div style={{ marginTop: '1rem' }}>
            <strong>Payroll Impact เดือนนี้ (preview)</strong>
            <div>{preview.netPreview.toLocaleString('th-TH')} บาท</div>
            {preview.needsRecalculationWarning && (
              <p className="text-warning">{preview.needsRecalculationWarning}</p>
            )}
          </div>
        )}
      </WorkHQCard>

      <WorkHQCard title="Timeline รายวัน (14 วันล่าสุด)">
        <table className="whq-table whq-table--compact">
          <thead>
            <tr><th>วันที่</th><th>สถานะ</th><th>เข้า</th><th>ออก</th></tr>
          </thead>
          <tbody>
            {timeline.map((day) => (
              <tr key={day.date}>
                <td>{day.date}</td>
                <td>{day.state}</td>
                <td>{formatTime(day.attendance?.checkInAt)}</td>
                <td>{formatTime(day.attendance?.checkOutAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </WorkHQCard>
    </div>
  );
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
