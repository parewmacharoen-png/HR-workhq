import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { apiGet, ApiError, fetchCompanies } from '../../api/client';
import { fetchEmployeeFullProfile } from '../../api/employee-profile';
import { fetchEmployeeOverview, type EmployeeOverviewResponse } from '../../api/employee-overview';
import { getEmployeeOnboardingStatus } from '../../api/employee-onboarding';
import { useAuth } from '../../context/AuthContext';
import { canViewEmployeeSalary } from '../../lib/employee-salary-visibility';
import {
  AppPageLayout,
  WorkHQPageState,
  WorkHQErrorState,
  WorkHQPermissionDenied,
} from '../../components/workhq';
import { FlashMessage } from '../../components/FlashMessage';
import { WorkHQButton } from '../../components/ui';
import type { EmployeeFullProfile } from '../../components/hr/EmployeeProfileSections';
import { EmployeeDetailHeader } from '../../components/hr/employee/EmployeeDetailHeader';
import { EmployeeSummaryCards } from '../../components/hr/employee/EmployeeSummaryCards';
import { EmployeeWorkDayCommandCard } from '../../components/hr/employee/EmployeeWorkDayCommandCard';
import { EmployeeDetailTabNav } from '../../components/hr/employee-detail/EmployeeDetailTabNav';
import {
  EmployeeDetailTabPanels,
  loadEmployeeOverviewExtras,
} from '../../components/hr/employee-detail/EmployeeDetailTabPanels';
import {
  ArchiveEmployeeModal,
  DeleteEmployeeModal,
  TransferTeamModal,
  type EmployeeDetailModal,
} from '../../components/hr/employee-detail/EmployeeDetailModals';
import { EmployeeTelegramLinkModal } from '../../components/hr/employee/EmployeeTelegramLinkModal';
import {
  mapTelegramUiStatus,
  telegramHeaderActionLabel,
} from '../../api/employee-telegram-link';
import { useOnboardingInvitePermissions } from '../../hooks/useOnboardingInvitePermissions';
import { DEFAULT_EMPLOYEE_TAB, parseEmployeeTab, type EmployeeDetailTabId } from '../../components/hr/employee-detail/employee-detail-tabs';
import { th } from '../../i18n/th-labels';

interface EmployeeDetail {
  id: string;
  globalId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  employmentStatus: string;
  position?: string | null;
  department?: string | null;
  dateOfBirth?: string | null;
  hireDate?: string;
  tenureDisplay?: string;
  tenureDisplayDetailed?: string;
  probationStatus?: string;
  probationStatusCode?: string;
  probationEndDate?: string | null;
}

interface TelegramIdentity {
  id: string;
  telegramUserId: string;
  telegramUsername: string | null;
  status: string;
  linkedAt: string;
  lastSeenAt: string | null;
}

interface EffectiveAccessSummary {
  businessRole: string | null;
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can, companyId, user, companies } = useAuth();

  const activeTab = parseEmployeeTab(searchParams.get('tab'));

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [fullProfile, setFullProfile] = useState<EmployeeFullProfile | null>(null);
  const [identity, setIdentity] = useState<TelegramIdentity | null>(null);
  const [telegramStatus, setTelegramStatus] = useState('not_connected');
  const [homeSummary, setHomeSummary] = useState<{ pendingRequests: number; documentsNeedingAction: number } | null>(null);
  const [docSummary, setDocSummary] = useState<{ requiredMissing: string[] } | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [targetAccess, setTargetAccess] = useState<EffectiveAccessSummary | null>(null);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [employeeCompanyId, setEmployeeCompanyId] = useState('');
  const [overview, setOverview] = useState<EmployeeOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [modal, setModal] = useState<EmployeeDetailModal | null>(null);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(
    (location.state as { flash?: string } | null)?.flash ?? null,
  );

  const canRead = can('employee:read');
  const canWrite = can('employee:write');
  const invitePerms = useOnboardingInvitePermissions();
  const canInvite = invitePerms.canLinkOnEmployeeDetail;
  const canCreateRequest = can('workflow:read');
  const canAdjustSalary = can('payroll:read')
    && (user?.businessRole === 'owner'
      || user?.businessRole === 'secretary'
      || user?.businessRole === 'big_leader');
  const isOwnerViewer = user?.businessRole === 'owner'
    || (user?.roles ?? []).some((r) => ['owner', 'super_admin'].includes(r));
  const isTargetOwner = targetAccess?.businessRole === 'owner';

  const canViewSalary = useMemo(() => canViewEmployeeSalary(
    {
      userId: user?.id,
      employeeId: user?.employeeId,
      businessRole: user?.businessRole,
      permissions: user?.permissions,
    },
    id ?? '',
  ), [user, id]);
  const canViewPerformance = can('performance:read');
  const canViewCommission = can('commission:read');

  /** Use employee's primary company — avoids 404 when header company differs. */
  const effectiveCompanyId = employeeCompanyId || companyId;

  const companyName = useMemo(() => {
    const fromProfile = fullProfile?.companyName;
    if (fromProfile) return fromProfile;
    const c = companies.find((x) => x.id === companyId);
    return c?.name ?? null;
  }, [fullProfile, companies, companyId]);

  const teamName = fullProfile?.teamName ?? null;

  const telegramUiStatus = mapTelegramUiStatus(telegramStatus);
  const telegramActionLabel = telegramHeaderActionLabel(telegramUiStatus);

  const loadOverview = useCallback(async (employeeId: string, cid: string) => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      setOverview(await fetchEmployeeOverview(employeeId, cid));
    } catch (err) {
      setOverview(null);
      setOverviewError(err);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (!id || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const emp = await apiGet<EmployeeDetail>(`/employees/${id}`);
      let ident: TelegramIdentity | null = null;
      try {
        ident = await apiGet<TelegramIdentity | null>(`/employees/${id}/telegram-identity`);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }

      let profile: EmployeeFullProfile | null = null;
      try {
        profile = await fetchEmployeeFullProfile(id);
      } catch {
        profile = null;
      }

      let tgStatus = 'not_connected';
      try {
        const onboarding = await getEmployeeOnboardingStatus(id);
        tgStatus = String(onboarding.telegramStatus ?? tgStatus);
      } catch {
        // fall through to identity-based status
      }
      if (ident?.status === 'ACTIVE') {
        tgStatus = 'linked';
      } else if (ident?.status === 'PENDING' && tgStatus === 'not_connected') {
        tgStatus = 'pending_review';
      }

      let resolvedEmployeeCompanyId = companyId;
      try {
        const assignments = await apiGet<Array<{ companyId: string; isPrimaryCompany: boolean }>>(
          `/employees/${id}/assignments`,
        );
        const primary = assignments.find((a) => a.isPrimaryCompany) ?? assignments[0];
        if (primary?.companyId) resolvedEmployeeCompanyId = primary.companyId;
      } catch {
        // keep header company fallback
      }

      let extras = { homeSummary: null as typeof homeSummary, docSummary: null as typeof docSummary, managerName: null as string | null };
      if (resolvedEmployeeCompanyId) {
        extras = await loadEmployeeOverviewExtras(id, resolvedEmployeeCompanyId);
      }

      let access: EffectiveAccessSummary | null = null;
      try {
        access = await apiGet<EffectiveAccessSummary>(`/access-control/employees/${id}/effective-access`);
      } catch {
        access = null;
      }

      setEmployeeCompanyId(resolvedEmployeeCompanyId);

      setEmployee(emp);
      setIdentity(ident);
      setFullProfile(profile);
      setTelegramStatus(tgStatus);
      setHomeSummary(extras.homeSummary);
      setDocSummary(extras.docSummary);
      setManagerName(extras.managerName);
      setTargetAccess(access);

      if (resolvedEmployeeCompanyId) {
        void loadOverview(id, resolvedEmployeeCompanyId);
      } else {
        setOverview(null);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id, canRead, companyId, loadOverview]);

  const reloadAll = useCallback(() => {
    void load();
    if (id && effectiveCompanyId) void loadOverview(id, effectiveCompanyId);
  }, [load, id, effectiveCompanyId, loadOverview]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const cid = employeeCompanyId || companyId;
    if (!cid) return;
    void (async () => {
      const teamRows = await apiGet<Array<{ id: string; name: string }>>(
        `/organization/companies/${cid}/teams`,
      ).catch(() => []);
      setTeams(teamRows);
    })();
  }, [companyId, employeeCompanyId]);

  useEffect(() => {
    if (flash) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [flash]);

  function setTab(tab: EmployeeDetailTabId) {
    const next = new URLSearchParams(searchParams);
    if (tab === DEFAULT_EMPLOYEE_TAB) next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next);
  }

  const pageState = !canRead
    ? 'permissionDenied' as const
    : loading && !employee
      ? 'loading' as const
      : error && !employee
        ? 'error' as const
        : !employee
          ? 'empty' as const
          : 'success' as const;

  const fullName = employee ? `${employee.firstName} ${employee.lastName}` : '';
  const subtitleParts = [
    employee?.globalId,
    companyName,
    teamName,
    employee?.position,
  ].filter(Boolean);

  const headerStats = employee && (
    <EmployeeDetailHeader
      firstName={employee.firstName}
      lastName={employee.lastName}
      employeeId={employee.id}
      overview={overview}
      forceLinked={telegramUiStatus === 'LINKED' || identity?.status === 'ACTIVE'}
    />
  );

  const primaryAction = canWrite ? (
    <WorkHQButton type="button" variant="primary" onClick={() => setTab('personal')}>
      แก้ไขข้อมูล
    </WorkHQButton>
  ) : undefined;

  const secondaryActions = (
    <>
      {canCreateRequest && (
        <WorkHQButton to={`/requests/create?employeeId=${id ?? ''}`} variant="secondary">
          สร้างคำขอแทนพนักงาน
        </WorkHQButton>
      )}
      {canInvite && effectiveCompanyId && telegramUiStatus !== 'LINKED' && (
        <WorkHQButton
          type="button"
          variant="secondary"
          onClick={() => setTelegramModalOpen(true)}
        >
          {telegramActionLabel}
        </WorkHQButton>
      )}
      {canWrite && teams.length > 0 && (
        <WorkHQButton type="button" variant="secondary" onClick={() => setModal('transfer')}>
          ย้ายทีม
        </WorkHQButton>
      )}
      {canAdjustSalary && (
        <WorkHQButton
          type="button"
          variant="secondary"
          onClick={() => {
            setTab('payroll');
            window.setTimeout(() => {
              document.getElementById('salary-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 150);
          }}
        >
          ปรับเงินเดือน
        </WorkHQButton>
      )}
      {canWrite && !fullProfile?.archivedAt && (
        <WorkHQButton type="button" variant="secondary" onClick={() => setModal('archive')}>
          Archive
        </WorkHQButton>
      )}
      {isOwnerViewer && !isTargetOwner && (
        <WorkHQButton type="button" variant="danger" onClick={() => setModal('delete')}>
          Delete
        </WorkHQButton>
      )}
    </>
  );

  return (
    <>
      {flash && <FlashMessage message={flash} onDismiss={() => setFlash(null)} />}

      <AppPageLayout
        breadcrumb={[
          { label: 'พนักงาน', href: '/hr/employees' },
          { label: fullName || 'รายละเอียด' },
        ]}
        title={fullName || th.employeeDetail.profile}
        description={subtitleParts.join(' · ')}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        stats={headerStats}
      >
        <WorkHQPageState
          state={pageState}
          permissionDenied={<WorkHQPermissionDenied />}
          error={(
            <WorkHQErrorState
              referenceCode={error instanceof ApiError ? error.requestId : undefined}
              onRetry={() => void load()}
            />
          )}
          empty={(
            <WorkHQErrorState onGoHome={() => window.location.assign('/hr/employees')} />
          )}
        >
          {employee ? (
            <div className="whq-employee-detail-page">
              <EmployeeDetailTabNav
                activeTab={activeTab}
                onTabChange={setTab}
                canViewSalary={canViewSalary}
                canViewPerformance={canViewPerformance}
                canViewCommission={canViewCommission}
              />
              {activeTab === 'overview' && (
                <EmployeeSummaryCards
                  overview={overview}
                  loading={overviewLoading}
                  onTabChange={setTab}
                  onOpenTelegram={
                    telegramUiStatus === 'LINKED' ? undefined : () => setTelegramModalOpen(true)
                  }
                />
              )}
              <EmployeeDetailTabPanels
                tab={activeTab}
                employee={employee}
                fullProfile={fullProfile}
                companyId={effectiveCompanyId}
                telegramStatus={telegramStatus}
                identity={identity}
                homeSummary={homeSummary}
                docSummary={docSummary}
                managerName={managerName}
                companyName={companyName}
                teamName={teamName}
                canViewSalary={canViewSalary}
                overview={overview}
                overviewLoading={overviewLoading}
                overviewError={overviewError}
                onReload={reloadAll}
                onReloadOverview={() => id && effectiveCompanyId && void loadOverview(id, effectiveCompanyId)}
                onEditPersonal={() => setTab('personal')}
                onAdjustSalary={() => setTab('payroll')}
                onTabChange={setTab}
                onOpenTelegram={
                  telegramUiStatus === 'LINKED' ? undefined : () => setTelegramModalOpen(true)
                }
                onTransferTeam={() => setModal('transfer')}
                onArchive={() => setModal('archive')}
                canWrite={canWrite}
                canCreateRequest={canCreateRequest}
                canInviteTelegram={canInvite && Boolean(effectiveCompanyId) && telegramUiStatus !== 'LINKED'}
                canTransferTeam={canWrite && teams.length > 0}
                canAdjustSalary={canAdjustSalary}
                canArchive={canWrite && !fullProfile?.archivedAt}
              />
              {activeTab === 'overview' && id && (
                <section className="whq-employee-daily-timeline-section" aria-label="Timeline รายวัน">
                  <EmployeeWorkDayCommandCard employeeId={id} />
                </section>
              )}
            </div>
          ) : null}
        </WorkHQPageState>
      </AppPageLayout>

      {modal === 'archive' && id && (
        <ArchiveEmployeeModal
          employeeId={id}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setFlash('เก็บถาวรพนักงานแล้ว');
            void load();
          }}
        />
      )}
      {modal === 'delete' && id && employee && (
        <DeleteEmployeeModal
          employeeId={id}
          employeeName={fullName}
          isTargetOwner={isTargetOwner}
          suggestArchive={Boolean(homeSummary?.pendingRequests || docSummary?.requiredMissing.length)}
          onClose={() => setModal(null)}
          onArchived={() => {
            setModal(null);
            setFlash('เก็บถาวรพนักงานแล้ว');
            void load();
          }}
        />
      )}
      {modal === 'transfer' && id && (
        <TransferTeamModal
          employeeId={id}
          teams={teams}
          onClose={() => setModal(null)}
          onSuccess={() => {
            setFlash('ย้ายทีมแล้ว');
            void load();
          }}
        />
      )}
      {telegramModalOpen && id && effectiveCompanyId && employee && (
        <EmployeeTelegramLinkModal
          employeeId={id}
          employeeName={fullName}
          companyId={effectiveCompanyId}
          uiStatus={telegramUiStatus}
          onClose={() => setTelegramModalOpen(false)}
          onStatusChange={() => {
            void load();
            if (id && effectiveCompanyId) void loadOverview(id, effectiveCompanyId);
          }}
        />
      )}
    </>
  );
}
