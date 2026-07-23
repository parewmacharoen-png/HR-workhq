import type { EmployeeOverviewResponse } from '../../../api/employee-overview';
import { ApiError } from '../../../api/client';
import { formatThaiDate, NO_DATA } from '../../../lib/employee-date-utils';
import {
  attendanceTodayLabel,
  telegramStatusLabel,
} from '../../../lib/employee-overview-display';
import {
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQLoadingState,
  WorkHQPageState,
} from '../../workhq';
import { WorkHQButton, WorkHQCard } from '../../ui';
import { employmentStatusLabel, roleLabel } from '../../../i18n/th-labels';
import type { EmployeeDetailTabId } from '../employee-detail/employee-detail-tabs';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="whq-info-row">
      <span className="whq-info-label">{label}</span>
      <span className="whq-info-value">{value || NO_DATA}</span>
    </div>
  );
}

export interface EmployeeOverviewTabProps {
  employeeId: string;
  overview: EmployeeOverviewResponse | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onTabChange: (tab: EmployeeDetailTabId) => void;
  onOpenTelegram?: () => void;
  onEditPersonal: () => void;
  onAdjustSalary: () => void;
  onTransferTeam: () => void;
  onArchive: () => void;
  canEdit: boolean;
  canCreateRequest: boolean;
  canInviteTelegram: boolean;
  canTransferTeam: boolean;
  canAdjustSalary: boolean;
  canArchive: boolean;
}

export function EmployeeOverviewTab({
  employeeId,
  overview,
  loading,
  error,
  onRetry,
  onTabChange,
  onOpenTelegram,
  onEditPersonal,
  onAdjustSalary,
  onTransferTeam,
  onArchive,
  canEdit,
  canCreateRequest,
  canInviteTelegram,
  canTransferTeam,
  canAdjustSalary,
  canArchive,
}: EmployeeOverviewTabProps) {
  const pageState = loading
    ? 'loading' as const
    : error
      ? 'error' as const
      : !overview
        ? 'empty' as const
        : 'success' as const;

  function handleAlertAction(tab?: string, alertId?: string) {
    if (alertId === 'telegram-missing') {
      onOpenTelegram?.();
      return;
    }
    if (tab) onTabChange(tab as EmployeeDetailTabId);
  }

  const data = overview;

  return (
    <WorkHQPageState
      state={pageState}
      loading={<WorkHQLoadingState label="กำลังโหลดภาพรวม…" />}
      error={(
        <WorkHQErrorState
          referenceCode={error instanceof ApiError ? error.requestId : undefined}
          onRetry={onRetry}
        />
      )}
      empty={<WorkHQEmptyState title={NO_DATA} description="ไม่พบข้อมูลภาพรวมพนักงาน" />}
    >
      {data && (
        <div className="whq-employee-overview">
          <div className="whq-employee-overview-priority">
            <WorkHQCard title="แจ้งเตือน" className="whq-detail-card whq-detail-card--wide">
              {(data.alerts?.length ?? 0) > 0 ? (
                <ul className="whq-alert-list" data-testid="overview-alerts">
                  {data.alerts!.map((alert) => (
                    <li key={alert.id} className="whq-alert-item" data-testid={`alert-${alert.id}`}>
                      <span aria-hidden>{alert.icon}</span>
                      <div>
                        <strong>{alert.title}</strong>
                        <p className="whq-muted">{alert.description}</p>
                      </div>
                      <WorkHQButton
                        type="button"
                        variant="secondary"
                        onClick={() => handleAlertAction(alert.actionTab, alert.id)}
                      >
                        {alert.actionLabel}
                      </WorkHQButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="whq-muted">ไม่มีแจ้งเตือนในขณะนี้</p>
              )}
            </WorkHQCard>

            <WorkHQCard title="สถานะวันนี้" className="whq-detail-card whq-detail-card--wide">
              <div className="whq-detail-grid whq-detail-grid--compact">
                {data.leave?.onLeaveToday ? (
                  <>
                    <InfoRow label="สถานะ" value={`ลา${data.leave.onLeaveToday.leaveTypeName}`} />
                    <InfoRow
                      label="ช่วงลา"
                      value={`${formatThaiDate(data.leave.onLeaveToday.startDate)} – ${formatThaiDate(data.leave.onLeaveToday.endDate)}`}
                    />
                  </>
                ) : (
                  <>
                    <InfoRow
                      label="เวลาเข้างาน"
                      value={attendanceTodayLabel(data.attendance?.todayStatus)}
                    />
                    <InfoRow
                      label="Check-in"
                      value={data.attendance?.lastCheckInAt
                        ? new Date(data.attendance.lastCheckInAt).toLocaleString('th-TH')
                        : NO_DATA}
                    />
                    <InfoRow
                      label="Check-out"
                      value={data.attendance?.lastCheckOutAt
                        ? new Date(data.attendance.lastCheckOutAt).toLocaleString('th-TH')
                        : NO_DATA}
                    />
                    <InfoRow
                      label="ทำงานวันนี้"
                      value={data.attendance
                        ? `${Math.floor(data.attendance.workedMinutesToday / 60)} ชม. ${data.attendance.workedMinutesToday % 60} น.`
                        : NO_DATA}
                    />
                  </>
                )}
              </div>
            </WorkHQCard>
          </div>

          <WorkHQCard title="สรุปด่วน" className="whq-detail-card whq-detail-card--wide">
            <div className="whq-detail-grid whq-detail-grid--compact">
              <InfoRow label="รหัสพนักงาน" value={data.summary.globalId} />
              <InfoRow
                label="ชื่อ-นามสกุล"
                value={`${data.summary.firstName} ${data.summary.lastName}`}
              />
              <InfoRow label="สถานะการจ้าง" value={employmentStatusLabel(data.summary.employmentStatus)} />
              <InfoRow label="Telegram" value={telegramStatusLabel(data.summary.telegramStatus)} />
              <InfoRow label="อายุงาน" value={data.summary.tenureDisplay} />
              <InfoRow
                label="KPI ล่าสุด"
                value={data.kpi?.latestScore != null ? String(data.kpi.latestScore) : NO_DATA}
              />
            </div>
          </WorkHQCard>

          <WorkHQCard title="การดำเนินการด่วน" className="whq-detail-card whq-detail-card--wide whq-employee-overview-actions">
            <div className="whq-action-row" data-testid="overview-quick-actions">
              {canEdit && (
                <WorkHQButton type="button" variant="secondary" onClick={onEditPersonal}>
                  แก้ไขข้อมูล
                </WorkHQButton>
              )}
              {canCreateRequest && (
                <WorkHQButton
                  variant="secondary"
                  to={`/requests/create?employeeId=${employeeId}`}
                >
                  สร้างคำขอ
                </WorkHQButton>
              )}
              {canInviteTelegram && onOpenTelegram && (
                <WorkHQButton type="button" variant="secondary" onClick={onOpenTelegram}>
                  เชื่อม Telegram
                </WorkHQButton>
              )}
              {canTransferTeam && (
                <WorkHQButton type="button" variant="secondary" onClick={onTransferTeam}>
                  ย้ายทีม
                </WorkHQButton>
              )}
              {canAdjustSalary && (
                <WorkHQButton type="button" variant="secondary" onClick={onAdjustSalary}>
                  ปรับเงินเดือน
                </WorkHQButton>
              )}
              {canArchive && (
                <WorkHQButton type="button" variant="secondary" onClick={onArchive}>
                  Archive
                </WorkHQButton>
              )}
            </div>
          </WorkHQCard>

          <WorkHQCard title="องค์กร" className="whq-detail-card">
            <div className="whq-detail-card-body">
              <InfoRow label="บริษัท" value={data.summary.companyName ?? NO_DATA} />
              <InfoRow label="ทีม" value={data.summary.teamName ?? NO_DATA} />
              <InfoRow label="แผนก" value={data.summary.department ?? NO_DATA} />
              <InfoRow label="ตำแหน่ง" value={data.summary.position ?? NO_DATA} />
              <InfoRow label="หัวหน้า" value={data.summary.managerName ?? NO_DATA} />
              <InfoRow label="บทบาท" value={data.summary.businessRole ? roleLabel(data.summary.businessRole) : NO_DATA} />
            </div>
          </WorkHQCard>

          <WorkHQCard title="การจ้างงาน" className="whq-detail-card">
            <div className="whq-detail-card-body">
              <InfoRow label="วันที่เริ่มงาน" value={formatThaiDate(data.summary.hireDate)} />
              <InfoRow label="อายุงาน" value={data.summary.tenureDisplay} />
              <InfoRow label="วันเกิด" value={formatThaiDate(data.summary.dateOfBirth)} />
              <InfoRow
                label="อายุ"
                value={data.summary.ageYears != null ? `${data.summary.ageYears} ปี` : NO_DATA}
              />
              <InfoRow
                label="เลขบัตรประชาชน"
                value={data.summary.hasNationalId ? 'มีข้อมูลแล้ว' : NO_DATA}
              />
            </div>
          </WorkHQCard>

          <WorkHQCard title="กิจกรรมล่าสุด" className="whq-detail-card whq-detail-card--wide">
            {(data.recentActivities?.length ?? 0) > 0 ? (
              <>
                <ul className="whq-timeline-list">
                  {data.recentActivities!.slice(0, 8).map((activity) => (
                    <li key={activity.id} className="whq-timeline-item">
                      <strong>{activity.title}</strong>
                      <span className="whq-muted">
                        {new Date(activity.occurredAt).toLocaleString('th-TH')} · {activity.source}
                      </span>
                    </li>
                  ))}
                </ul>
                <WorkHQButton type="button" variant="ghost" onClick={() => onTabChange('timeline')}>
                  ดู Timeline ทั้งหมด
                </WorkHQButton>
              </>
            ) : (
              <p className="whq-muted">{NO_DATA}</p>
            )}
          </WorkHQCard>

          <WorkHQCard title="เหตุการณ์ที่จะมาถึง" className="whq-detail-card whq-detail-card--wide">
            {(data.upcomingEvents?.length ?? 0) > 0 ? (
              <ul className="whq-timeline-list">
                {data.upcomingEvents!.map((event) => (
                  <li key={event.id} className="whq-timeline-item">
                    <span aria-hidden>{event.icon}</span>
                    <strong>{event.title}</strong>
                    <span className="whq-muted">
                      อีก {event.daysUntil} วัน — {event.description}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="whq-muted">{NO_DATA}</p>
            )}
          </WorkHQCard>
        </div>
      )}
    </WorkHQPageState>
  );
}
