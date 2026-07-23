import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { fetchCalendarToday } from '../api/calendar';
import { fetchEmployeeList } from '../api/employees';
import { fetchAttendanceCommandCenter } from '../api/workday';
import { getOnboardingDashboardStats, type OnboardingDashboardStats } from '../api/employee-onboarding';
import { getRequestDashboard } from '../api/request-platform';
import { useAuth } from '../context/AuthContext';
import { useCompanyScope } from '../hooks/useCompanyScope';
import { sumOnboardingStats } from '../utils/multi-company';
import {
  WorkHQAlert,
  WorkHQButton,
  WorkHQCard,
  WorkHQStatCard,
} from '../components/ui';
import { greetingForHour, th } from '../i18n/th-labels';
import {
  AppPageLayout,
  WorkHQPageState,
  WorkHQEmptyState,
} from '../components/workhq';

interface AttendanceAlertsToday {
  missingCheckIns: number;
  missingBreakReturns: number;
  missingCheckOuts: number;
}

interface MissingCheckInPerson {
  id: string;
  name: string;
  globalId: string;
  teamName: string | null;
  companyName?: string;
}

interface WorkforceSnapshot {
  workforce: number;
  onLeaveToday: number;
  missingCheckIns: number;
  missingCheckInPeople: MissingCheckInPerson[];
  pendingApprovals: number;
  notConnectedTelegram: number;
  pendingOnboardingReview: number;
}

interface ActionItem {
  id: string;
  title: string;
  count: number;
  path: string;
  urgent?: boolean;
}

interface QuickLink {
  to: string;
  icon: string;
  label: string;
  hint: string;
}

const ZERO: WorkforceSnapshot = {
  workforce: 0,
  onLeaveToday: 0,
  missingCheckIns: 0,
  missingCheckInPeople: [],
  pendingApprovals: 0,
  notConnectedTelegram: 0,
  pendingOnboardingReview: 0,
};

const EMPTY_ALERTS: AttendanceAlertsToday = {
  missingCheckIns: 0,
  missingBreakReturns: 0,
  missingCheckOuts: 0,
};

const EMPTY_ONBOARDING: OnboardingDashboardStats = {
  notConnected: 0,
  invitePending: 0,
  inviteExpired: 0,
  inProgress: 0,
  pendingReview: 0,
  pendingDocuments: 0,
};

export default function DashboardPage() {
  const { user, canAny } = useAuth();
  const { companyId, scopedCompanyIds, hasCompanyScope, isAllCompanies, companies } = useCompanyScope();
  const displayName = user?.displayName ?? user?.username ?? '';
  const [snapshot, setSnapshot] = useState<WorkforceSnapshot>(ZERO);
  const [loading, setLoading] = useState(false);
  const canWriteEmployee = canAny('employee:write');

  const load = useCallback(async () => {
    if (!hasCompanyScope) {
      setSnapshot(ZERO);
      return;
    }
    setLoading(true);
    try {
      const companyIds = isAllCompanies ? scopedCompanyIds : companyId ? [companyId] : [];
      if (!companyIds.length) {
        setSnapshot(ZERO);
        return;
      }

      const [workforceResults, requestResults, alertsResults, calendarResults, onboardingResults, commandCenterResults] = await Promise.all([
        Promise.all(companyIds.map((id) => fetchEmployeeList({ companyId: id, workforceOnly: true }).catch(() => ({ items: [], total: 0 })))),
        canAny('workflow:read', 'workflow:act')
          ? Promise.all(companyIds.map((id) => getRequestDashboard(id).catch(() => ({ pendingApproval: 0, myPendingApprovals: 0 }))))
          : Promise.resolve([] as Array<{ pendingApproval: number; myPendingApprovals: number }>),
        canAny('attendance:read')
          ? Promise.all(companyIds.map((id) => apiGet<AttendanceAlertsToday>('/attendance/alerts/today', { companyId: id }).catch(() => EMPTY_ALERTS)))
          : Promise.resolve([] as AttendanceAlertsToday[]),
        canAny('leave:read')
          ? Promise.all(companyIds.map((id) => fetchCalendarToday(id).catch(() => ({ events: [], count: 0, date: '' }))))
          : Promise.resolve([] as Array<{ events: unknown[]; count: number; date: string }>),
        canWriteEmployee
          ? Promise.all(companyIds.map((id) => getOnboardingDashboardStats(id).catch(() => EMPTY_ONBOARDING)))
          : Promise.resolve([] as OnboardingDashboardStats[]),
        canAny('attendance:read')
          ? Promise.all(companyIds.map((id) => fetchAttendanceCommandCenter(id).catch(() => null)))
          : Promise.resolve([] as Array<null>),
      ]);

      const alerts = alertsResults.reduce(
        (acc, row) => ({
          missingCheckIns: acc.missingCheckIns + row.missingCheckIns,
          missingBreakReturns: acc.missingBreakReturns + row.missingBreakReturns,
          missingCheckOuts: acc.missingCheckOuts + row.missingCheckOuts,
        }),
        { ...EMPTY_ALERTS },
      );
      const onboarding = sumOnboardingStats(onboardingResults);
      const pendingApprovals = requestResults.reduce(
        (sum, row) => sum + (row.myPendingApprovals || row.pendingApproval || 0),
        0,
      );
      const companyNameOf = (id: string) => companies.find((c) => c.id === id)?.name ?? id.slice(0, 8);
      const missingCheckInPeople: MissingCheckInPerson[] = [];
      const seenMissing = new Set<string>();
      for (let i = 0; i < companyIds.length; i += 1) {
        const center = commandCenterResults[i];
        if (!center) continue;
        const bucket = center.exceptions.find((row) => row.type === 'missing_check_in');
        for (const person of bucket?.items ?? []) {
          if (seenMissing.has(person.id)) continue;
          seenMissing.add(person.id);
          missingCheckInPeople.push({
            id: person.id,
            name: `${person.firstName} ${person.lastName}`.trim(),
            globalId: person.globalId,
            teamName: person.teamName,
            companyName: isAllCompanies ? companyNameOf(companyIds[i]) : undefined,
          });
        }
      }
      missingCheckInPeople.sort((a, b) => a.name.localeCompare(b.name, 'th'));

      setSnapshot({
        workforce: workforceResults.reduce((sum, r) => sum + r.total, 0),
        onLeaveToday: calendarResults.reduce((sum, r) => sum + (r.count ?? r.events?.length ?? 0), 0),
        missingCheckIns: missingCheckInPeople.length || alerts.missingCheckIns,
        missingCheckInPeople,
        pendingApprovals,
        notConnectedTelegram: onboarding.notConnected,
        pendingOnboardingReview: onboarding.pendingReview,
      });
    } finally {
      setLoading(false);
    }
  }, [hasCompanyScope, isAllCompanies, scopedCompanyIds, companyId, companies, canAny, canWriteEmployee]);

  useEffect(() => { void load(); }, [load]);

  const greeting = greetingForHour(displayName || 'ผู้ใช้');

  const workingToday = Math.max(0, snapshot.workforce - snapshot.onLeaveToday - snapshot.missingCheckIns);

  const actions = useMemo((): ActionItem[] => {
    if (!hasCompanyScope) return [];
    const items: ActionItem[] = [];
    if (snapshot.pendingApprovals > 0 && canAny('workflow:act')) {
      items.push({
        id: 'approvals',
        title: 'คำขอรออนุมัติ',
        count: snapshot.pendingApprovals,
        path: '/approvals',
        urgent: true,
      });
    }
    if (snapshot.missingCheckIns > 0 && canAny('attendance:read')) {
      items.push({
        id: 'missing-checkin',
        title: 'ยังไม่เช็กอินวันนี้',
        count: snapshot.missingCheckIns,
        path: '/attendance/command-center',
        urgent: true,
      });
    }
    if (snapshot.pendingOnboardingReview > 0 && canWriteEmployee) {
      items.push({
        id: 'onboarding',
        title: 'พนักงานใหม่รอตรวจสอบ',
        count: snapshot.pendingOnboardingReview,
        path: '/hr/self-onboarding?status=submitted',
        urgent: true,
      });
    }
    if (snapshot.notConnectedTelegram > 0 && canWriteEmployee) {
      items.push({
        id: 'telegram',
        title: 'ยังไม่เชื่อม Telegram',
        count: snapshot.notConnectedTelegram,
        path: '/hr/invitation',
      });
    }
    return items;
  }, [hasCompanyScope, snapshot, canAny, canWriteEmployee]);

  const quickLinks = useMemo((): QuickLink[] => {
    const links: QuickLink[] = [];
    if (canAny('employee:read')) {
      links.push({ to: '/hr/employees', icon: '👥', label: 'พนักงาน', hint: 'รายชื่อทั้งหมด' });
      links.push({ to: '/hr/assets', icon: '💻', label: 'อุปกรณ์ยืม', hint: 'ของอยู่กับใคร' });
    }
    if (canAny('attendance:read')) {
      links.push({ to: '/attendance/daily', icon: '⏰', label: 'เวลาเข้างาน', hint: 'เช็กอินวันนี้' });
    }
    if (canAny('leave:read')) {
      links.push({ to: '/calendar/team', icon: '📅', label: 'ปฏิทินทีม', hint: 'ใครลาวันนี้' });
    }
    if (canAny('workflow:read')) {
      links.push({ to: '/requests', icon: '📋', label: 'คำขอ', hint: 'ติดตามคำร้อง' });
    }
    if (canAny('workflow:act')) {
      links.push({ to: '/approvals', icon: '✅', label: 'อนุมัติ', hint: 'รายการรอตรวจ' });
    }
    if (canAny('payroll:read')) {
      links.push({ to: '/payroll/cycles', icon: '💰', label: 'เงินเดือน', hint: 'รอบจ่าย' });
    }
    if (canAny('workflow:read')) {
      links.push({ to: '/my-work', icon: '📌', label: 'งานของฉัน', hint: 'งานที่ต้องทำ' });
    }
    return links;
  }, [canAny]);

  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม' }]}
      title={greeting}
      description="ภาพรวมคนทำงานวันนี้ — กดการ์ดเพื่อดูรายละเอียด"
      secondaryActions={(
        <WorkHQButton type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
          {th.common.refresh}
        </WorkHQButton>
      )}
    >
      {!hasCompanyScope && (
        <WorkHQAlert message={th.dashboard.selectCompanyWarning} tone="warning" autoDismissMs={0} />
      )}

      <WorkHQPageState
        state={!hasCompanyScope ? 'empty' : loading ? 'loading' : 'success'}
        empty={(
          <WorkHQEmptyState
            icon="🏢"
            title="เลือกบริษัท"
            description={th.dashboard.selectCompanyWarning}
          />
        )}
      >
        {!loading && (
          <>
            <WorkHQCard title="คนในบริษัทวันนี้" className="whq-detail-card">
              <div className="whq-stat-row">
                {canAny('employee:read') ? (
                  <WorkHQStatCard
                    icon="👥"
                    value={snapshot.workforce}
                    label="พนักงานทั้งหมด"
                    hint="กำลังทำงาน + ทดลองงาน"
                    tone="green"
                    to="/hr/employees"
                  />
                ) : (
                  <WorkHQStatCard
                    icon="👥"
                    value={snapshot.workforce}
                    label="พนักงานทั้งหมด"
                    tone="green"
                  />
                )}
                {canAny('attendance:read') ? (
                  <WorkHQStatCard
                    icon="✅"
                    value={workingToday}
                    label="เข้างานแล้ว"
                    hint="ประมาณการจากเช็กอิน"
                    tone="cool"
                    to="/attendance/daily"
                  />
                ) : (
                  <WorkHQStatCard
                    icon="✅"
                    value={workingToday}
                    label="เข้างานแล้ว"
                    tone="cool"
                  />
                )}
                {canAny('attendance:read') ? (
                  <WorkHQStatCard
                    icon="⚠️"
                    value={snapshot.missingCheckIns}
                    label="ยังไม่เช็กอิน"
                    hint={snapshot.missingCheckIns > 0 ? 'ควรติดตาม' : 'ครบแล้ว'}
                    tone="warm"
                    to="/attendance/daily"
                  />
                ) : (
                  <WorkHQStatCard
                    icon="⚠️"
                    value={snapshot.missingCheckIns}
                    label="ยังไม่เช็กอิน"
                    tone="warm"
                  />
                )}
                {canAny('leave:read') ? (
                  <WorkHQStatCard
                    icon="🏖️"
                    value={snapshot.onLeaveToday}
                    label="ลาวันนี้"
                    tone="lavender"
                    to="/calendar/team"
                  />
                ) : (
                  <WorkHQStatCard
                    icon="🏖️"
                    value={snapshot.onLeaveToday}
                    label="ลาวันนี้"
                    tone="lavender"
                  />
                )}
              </div>
            </WorkHQCard>

            {canAny('attendance:read') && snapshot.missingCheckInPeople.length > 0 && (
              <WorkHQCard title={`ยังไม่เข้างานวันนี้ (${snapshot.missingCheckInPeople.length})`} className="whq-detail-card">
                <p className="whq-muted whq-dashboard-followup-hint">
                  รายชื่อที่ควรติดตาม — กดชื่อเพื่อดูข้อมูลพนักงาน
                </p>
                <ul className="whq-dashboard-followup-list">
                  {snapshot.missingCheckInPeople.map((person) => (
                    <li key={person.id}>
                      <Link to={`/hr/employees/${person.id}?tab=attendance`} className="whq-dashboard-followup-item">
                        <span className="whq-dashboard-followup-name">{person.name}</span>
                        <span className="whq-dashboard-followup-meta">
                          {person.globalId}
                          {person.teamName ? ` · ${person.teamName}` : ''}
                          {person.companyName ? ` · ${person.companyName}` : ''}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="whq-dashboard-followup-actions">
                  <WorkHQButton to="/attendance/command-center" variant="secondary">
                    ศูนย์ควบคุมเข้างาน
                  </WorkHQButton>
                </div>
              </WorkHQCard>
            )}

            <WorkHQCard title="ต้องจัดการ" className="whq-detail-card">
              {actions.length === 0 ? (
                <p className="whq-muted">ไม่มีรายการค้าง — วันนี้เรียบร้อย</p>
              ) : (
                <ul className="whq-dashboard-action-list">
                  {actions.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={item.path}
                        className={`whq-dashboard-action-item${item.urgent ? ' whq-dashboard-action-item--urgent' : ''}`}
                      >
                        <span>{item.title}</span>
                        <span className="whq-dashboard-action-count">{item.count}</span>
                        <span className="whq-dashboard-action-arrow" aria-hidden>→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </WorkHQCard>

            {quickLinks.length > 0 && (
              <WorkHQCard title="ไปหน้ารายละเอียด" className="whq-detail-card">
                <div className="whq-dashboard-links">
                  {quickLinks.map((link) => (
                    <Link key={link.to} to={link.to} className="whq-dashboard-link">
                      <span className="whq-dashboard-link-icon" aria-hidden>{link.icon}</span>
                      <span className="whq-dashboard-link-label">{link.label}</span>
                      <span className="whq-dashboard-link-hint">{link.hint}</span>
                    </Link>
                  ))}
                </div>
              </WorkHQCard>
            )}
          </>
        )}
      </WorkHQPageState>
    </AppPageLayout>
  );
}
