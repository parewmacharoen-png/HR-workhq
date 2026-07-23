import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { fetchForEachCompany, sumOnboardingStats } from '../../utils/multi-company';
import { getRequestDashboard } from '../../api/request-platform';
import { getDocumentDashboard } from '../../api/document-center';
import { getOnboardingDashboardStats } from '../../api/employee-onboarding';
import { apiGet, ApiError } from '../../api/client';
import {
  AppPageLayout,
  WorkHQPageState,
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPermissionDenied,
  WorkHQSelectCompanyState,
} from '../../components/workhq';
import { WorkHQBadge, WorkHQButton } from '../../components/ui';

interface TaskItem {
  id: string;
  title: string;
  subtitle: string;
  path: string;
  priority: 'urgent' | 'normal' | 'low';
  kind: string;
}

export default function MyWorkPage() {
  const { can, user } = useAuth();
  const { companyId, isAllCompanies: allCompanies, scopedCompanyIds, hasCompanyScope } = useCompanyScope();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<'today' | 'waiting' | 'overdue' | 'drafts'>('today');

  const canRead = can('workflow:read');

  const load = useCallback(async () => {
    if (!hasCompanyScope || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items: TaskItem[] = [];
      const companyIds = allCompanies ? scopedCompanyIds : companyId ? [companyId] : [];
      const dashResults = await fetchForEachCompany(companyIds, (cid) => getRequestDashboard(cid).catch(() => null));
      const reqDash = dashResults.reduce(
        (acc, row) => {
          if (!row.result) return acc;
          if (!acc) return row.result;
          return {
            submittedToday: acc.submittedToday + row.result.submittedToday,
            pendingApproval: acc.pendingApproval + row.result.pendingApproval,
            overdue: acc.overdue + row.result.overdue,
            myPendingApprovals: acc.myPendingApprovals + row.result.myPendingApprovals,
            byType: acc.byType,
          };
        },
        null as Awaited<ReturnType<typeof getRequestDashboard>> | null,
      );
      const docResults = can('document:read')
        ? await fetchForEachCompany(companyIds, (cid) => getDocumentDashboard(cid).catch(() => null))
        : [];
      const docDash = docResults.reduce(
        (acc, row) => {
          if (!row.result) return acc;
          if (!acc) return row.result;
          return {
            missingRequired: acc.missingRequired + row.result.missingRequired,
            expiringSoon: acc.expiringSoon + row.result.expiringSoon,
            failedDocumentJobs: acc.failedDocumentJobs + row.result.failedDocumentJobs,
            recentlyUploaded: [...acc.recentlyUploaded, ...row.result.recentlyUploaded],
            uploadStatus: {
              total: acc.uploadStatus.total + row.result.uploadStatus.total,
              acknowledged: acc.uploadStatus.acknowledged + row.result.uploadStatus.acknowledged,
              pendingAcknowledgement: acc.uploadStatus.pendingAcknowledgement + row.result.uploadStatus.pendingAcknowledgement,
            },
          };
        },
        null as Awaited<ReturnType<typeof getDocumentDashboard>> | null,
      );
      const onboardingResults = can('employee:write')
        ? await fetchForEachCompany(companyIds, (cid) => getOnboardingDashboardStats(cid).catch(() => null))
        : [];
      const onboarding = onboardingResults.length
        ? sumOnboardingStats(onboardingResults.map((r) => r.result).filter(Boolean) as Awaited<ReturnType<typeof getOnboardingDashboardStats>>[])
        : null;

      if (reqDash?.myPendingApprovals) {
        items.push({
          id: 'approve-requests',
          title: `อนุมัติคำขอ ${reqDash.myPendingApprovals} รายการ`,
          subtitle: 'รอการตัดสินใจจากคุณ',
          path: '/approvals',
          priority: 'urgent',
          kind: 'waiting',
        });
      }
      if (reqDash?.overdue) {
        items.push({
          id: 'overdue-requests',
          title: `คำขอเกินกำหนด ${reqDash.overdue} รายการ`,
          subtitle: 'ควรตรวจสอบโดยเร็ว',
          path: '/requests',
          priority: 'urgent',
          kind: 'overdue',
        });
      }
      if (docDash?.missingRequired) {
        items.push({
          id: 'missing-docs',
          title: `เอกสารขาด ${docDash.missingRequired} รายการ`,
          subtitle: 'พนักงานยังไม่ส่งเอกสารที่จำเป็น',
          path: '/documents/my',
          priority: 'normal',
          kind: 'today',
        });
      }
      if (onboarding?.pendingReview) {
        items.push({
          id: 'onboarding-review',
          title: `ข้อมูลพนักงานรอตรวจสอบ ${onboarding.pendingReview} รายการ`,
          subtitle: 'Self-onboarding จาก Telegram',
          path: '/hr/self-onboarding',
          priority: 'normal',
          kind: 'waiting',
        });
      }
      if (onboarding?.notConnected) {
        items.push({
          id: 'telegram-invite',
          title: `พนักงานยังไม่เชื่อม Telegram ${onboarding.notConnected} คน`,
          subtitle: 'ส่งลิงก์เชิญหรือรหัส Invitation',
          path: '/hr/invitation',
          priority: 'low',
          kind: 'today',
        });
      }

      if (user?.employeeId && companyId && !allCompanies) {
        const home = await apiGet<{ pendingRequests?: number }>(
          `/employees/${user.employeeId}/home-summary`,
          { companyId },
        ).catch(() => null);
        if (home?.pendingRequests) {
          items.push({
            id: 'my-pending',
            title: `คำขอของฉันรอดำเนินการ ${home.pendingRequests} รายการ`,
            subtitle: 'ติดตามสถานะคำขอ',
            path: '/requests/mine',
            priority: 'normal',
            kind: 'waiting',
          });
        }
      }

      setTasks(items);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [hasCompanyScope, allCompanies, scopedCompanyIds, companyId, can, user?.employeeId, canRead]);

  useEffect(() => { void load(); }, [load]);

  const filtered = tasks.filter((t) => {
    if (filter === 'today') return t.kind === 'today' || t.priority === 'urgent';
    if (filter === 'waiting') return t.kind === 'waiting';
    if (filter === 'overdue') return t.kind === 'overdue';
    return t.kind === 'drafts';
  });

  const pageState = !canRead
    ? 'permissionDenied' as const
    : !hasCompanyScope
      ? 'empty' as const
      : loading
        ? 'loading' as const
        : error
          ? 'error' as const
          : filtered.length === 0
            ? 'empty' as const
            : 'success' as const;

  const referenceCode = error instanceof ApiError ? error.requestId : undefined;

  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'งานของฉัน' }]}
      title="📌 งานของฉัน"
      description="งานที่รอคุณวันนี้ — เรียงตามความสำคัญ"
      secondaryActions={<WorkHQButton type="button" variant="secondary" onClick={() => void load()}>รีเฟรช</WorkHQButton>}
      quickActions={(
        <>
          <WorkHQButton to="/requests/create" variant="primary">+ สร้างคำขอ</WorkHQButton>
          <WorkHQButton to="/approvals" variant="secondary">อนุมัติ</WorkHQButton>
          <WorkHQButton to="/hr/invitation" variant="secondary">เชิญพนักงาน</WorkHQButton>
        </>
      )}
    >
      <div className="whq-tab-nav" style={{ marginBottom: '1rem' }}>
        {([
          ['today', 'งานวันนี้'],
          ['waiting', 'รอฉัน'],
          ['overdue', 'เกินกำหนด'],
          ['drafts', 'แบบร่าง'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`whq-tab-nav-item${filter === id ? ' active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <WorkHQPageState
        state={pageState}
        permissionDenied={<WorkHQPermissionDenied />}
        error={<WorkHQErrorState referenceCode={referenceCode} onRetry={() => void load()} />}
        empty={!hasCompanyScope ? <WorkHQSelectCompanyState /> : (
          <WorkHQEmptyState
            icon="✨"
            title={filter === 'overdue' ? 'ไม่มีงานเกินกำหนด' : 'ไม่มีงานในหมวดนี้'}
            description="ลองดูแท็บอื่นหรือกลับไปที่ภาพรวม"
            action={<WorkHQButton to="/dashboard" variant="primary">ไปภาพรวม</WorkHQButton>}
          />
        )}
      >
        <ul className="whq-task-list">
          {filtered.map((task) => (
            <li key={task.id} className="whq-task-item">
              <span className={`whq-task-priority ${task.priority}`} aria-hidden />
              <div style={{ flex: 1 }}>
                <Link to={task.path} style={{ fontWeight: 600 }}>{task.title}</Link>
                <div className="whq-muted" style={{ fontSize: '0.88rem' }}>{task.subtitle}</div>
              </div>
              <WorkHQBadge status={task.priority === 'urgent' ? 'pending' : 'approved'} label={task.priority === 'urgent' ? 'ด่วน' : 'ปกติ'} />
            </li>
          ))}
        </ul>
      </WorkHQPageState>
    </AppPageLayout>
  );
}
