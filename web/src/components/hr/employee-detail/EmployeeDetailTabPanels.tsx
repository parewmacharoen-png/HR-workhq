import { apiGet } from '../../../api/client';
import { fetchReportingPath } from '../../../api/hierarchy';
import { useAuth } from '../../../context/AuthContext';
import { canViewEmployeeSalary } from '../../../lib/employee-salary-visibility';
import { NO_DATA } from '../../../lib/employee-date-utils';
import {
  WorkHQEmptyState,
  WorkHQPermissionDenied,
} from '../../workhq';
import { EmployeeAccessControlSection } from '../EmployeeAccessControlSection';
import { EmployeeDocumentsSection } from '../EmployeeDocumentsSection';
import { EmployeeLeaveTab } from '../employee/EmployeeLeaveTab';
import { EmployeeAssetsTab } from '../employee/EmployeeAssetsTab';
import type { EmployeeFullProfile } from '../EmployeeProfileSections';
import { EmployeeOverviewTab } from '../employee/EmployeeOverviewTab';
import { EmployeePersonalTab } from '../employee/EmployeePersonalTab';
import { EmployeeEmploymentTab } from '../employee/EmployeeEmploymentTab';
import { EmployeeTimelineTab } from '../employee/EmployeeTimelineTab';
import { EmployeeAttendanceTab } from '../employee/EmployeeAttendanceTab';
import { EmployeePayrollTab } from '../employee/EmployeePayrollTab';
import { EmployeePerformanceTab } from '../employee/EmployeePerformanceTab';
import { EmployeeCommissionTab } from '../employee/EmployeeCommissionTab';
import type { EmployeeOverviewResponse } from '../../../api/employee-overview';
import type { EmployeeDetailTabId } from './employee-detail-tabs';

interface EmployeeSummary {
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

interface HomeSummary {
  pendingRequests: number;
  documentsNeedingAction: number;
}

interface DocSummary {
  requiredMissing: string[];
}

interface TelegramIdentity {
  telegramUsername: string | null;
  status: string;
}

export interface EmployeeDetailTabPanelsProps {
  tab: EmployeeDetailTabId;
  employee: EmployeeSummary;
  fullProfile: EmployeeFullProfile | null;
  companyId: string;
  telegramStatus: string;
  identity: TelegramIdentity | null;
  homeSummary: HomeSummary | null;
  docSummary: DocSummary | null;
  managerName: string | null;
  companyName: string | null;
  teamName: string | null;
  canViewSalary: boolean;
  overview: EmployeeOverviewResponse | null;
  overviewLoading: boolean;
  overviewError: unknown;
  onReload: () => void;
  onReloadOverview: () => void;
  onEditPersonal: () => void;
  onAdjustSalary: () => void;
  onTabChange: (tab: EmployeeDetailTabId) => void;
  onOpenTelegram?: () => void;
  onTransferTeam: () => void;
  onArchive: () => void;
  canWrite: boolean;
  canCreateRequest: boolean;
  canInviteTelegram: boolean;
  canTransferTeam: boolean;
  canAdjustSalary: boolean;
  canArchive: boolean;
}

export function EmployeeDetailTabPanels(props: EmployeeDetailTabPanelsProps) {
  const { tab, employee, companyId, canViewSalary } = props;
  const { can, canAny, user } = useAuth();
  const canEdit = can('employee:write');
  const canReadDocs = can('document:read');
  const canReadLeave = can('leave:read');
  const canReadAssets = canAny('asset:read', 'employee:read');
  const canReadAttendance = can('attendance:read');
  const canReadPerformance = can('performance:read');
  const canReadCommission = can('commission:read');

  switch (tab) {
    case 'overview':
      return companyId ? (
        <EmployeeOverviewTab
          employeeId={employee.id}
          overview={props.overview}
          loading={props.overviewLoading}
          error={props.overviewError}
          onRetry={props.onReloadOverview}
          onTabChange={props.onTabChange}
          onOpenTelegram={props.onOpenTelegram}
          onEditPersonal={props.onEditPersonal}
          onAdjustSalary={props.onAdjustSalary}
          onTransferTeam={props.onTransferTeam}
          onArchive={props.onArchive}
          canEdit={props.canWrite}
          canCreateRequest={props.canCreateRequest}
          canInviteTelegram={props.canInviteTelegram}
          canTransferTeam={props.canTransferTeam}
          canAdjustSalary={props.canAdjustSalary}
          canArchive={props.canArchive}
        />
      ) : (
        <WorkHQEmptyState title={NO_DATA} description="เลือกบริษัทเพื่อดูภาพรวม" />
      );
    case 'personal':
      return (
        <EmployeePersonalTab
          employeeId={employee.id}
          canEdit={canEdit}
          onReload={props.onReload}
        />
      );
    case 'employment':
      return companyId ? (
        <EmployeeEmploymentTab
          employeeId={employee.id}
          companyId={companyId}
          canEdit={canEdit}
          viewerBusinessRole={user?.businessRole}
          onReload={props.onReload}
        />
      ) : (
        <WorkHQEmptyState title={NO_DATA} description="เลือกบริษัทเพื่อดูข้อมูลการทำงาน" />
      );
    case 'payroll':
      return canViewSalary && companyId ? (
        <EmployeePayrollTab employeeId={employee.id} companyId={companyId} />
      ) : (
        <WorkHQPermissionDenied
          title="ไม่มีสิทธิ์ดูเงินเดือน"
          description="คุณสามารถดูได้เฉพาะเงินเดือนของตนเอง หรือตามบทบาท Owner / HR / Big Leader"
        />
      );
    case 'attendance':
      return canReadAttendance && companyId ? (
        <EmployeeAttendanceTab employeeId={employee.id} companyId={companyId} />
      ) : (
        <WorkHQPermissionDenied title="ไม่มีสิทธิ์ดูเวลาทำงาน" />
      );
    case 'leave':
      return canReadLeave && companyId ? (
        <EmployeeLeaveTab employeeId={employee.id} companyId={companyId} />
      ) : (
        <WorkHQPermissionDenied title="ไม่มีสิทธิ์ดูการลา" />
      );
    case 'assets':
      return canReadAssets && companyId ? (
        <EmployeeAssetsTab employeeId={employee.id} companyId={companyId} />
      ) : (
        <WorkHQPermissionDenied title="ไม่มีสิทธิ์ดูอุปกรณ์ยืม" />
      );
    case 'performance':
      return canReadPerformance && companyId ? (
        <EmployeePerformanceTab employeeId={employee.id} companyId={companyId} />
      ) : (
        <WorkHQPermissionDenied
          title="ไม่มีสิทธิ์ดูผลการทำงาน"
          description="ต้องมีสิทธิ์ performance:read"
        />
      );
    case 'commission':
      return canReadCommission && companyId ? (
        <EmployeeCommissionTab employeeId={employee.id} companyId={companyId} />
      ) : (
        <WorkHQPermissionDenied title="ไม่มีสิทธิ์ดูคอมมิชชั่น" />
      );
    case 'documents':
      return canReadDocs ? (
        <EmployeeDocumentsSection
          employeeId={employee.id}
          canEdit={canEdit}
          onTabChange={props.onTabChange}
          onOpenTelegram={props.onOpenTelegram}
        />
      ) : (
        <WorkHQPermissionDenied title="ไม่มีสิทธิ์ดูเอกสาร" />
      );
    case 'timeline':
      return <EmployeeTimelineTab employeeId={employee.id} />;
    case 'permission':
      return (
        <EmployeeAccessControlSection
          employeeId={employee.id}
          onSaved={() => {
            props.onReload();
            props.onReloadOverview();
          }}
        />
      );
    default:
      return null;
  }
}

export function useEmployeeSalaryAccess(employeeId: string): boolean {
  const { user } = useAuth();
  return canViewEmployeeSalary(
    {
      userId: user?.id,
      employeeId: user?.employeeId,
      businessRole: user?.businessRole,
      permissions: user?.permissions,
    },
    employeeId,
  );
}

export async function loadEmployeeOverviewExtras(
  employeeId: string,
  companyId: string,
): Promise<{
  homeSummary: HomeSummary | null;
  docSummary: DocSummary | null;
  managerName: string | null;
}> {
  const [home, docs, path] = await Promise.all([
    apiGet<HomeSummary>(`/employees/${employeeId}/home-summary`, { companyId }).catch(() => null),
    apiGet<DocSummary>(`/documents/employees/${employeeId}/summary`).catch(() => null),
    fetchReportingPath(employeeId).catch(() => ({ path: [] })),
  ]);
  const managerNode = path.path.length >= 2 ? path.path[path.path.length - 2] : null;
  const manager = managerNode
    ? `${managerNode.firstName} ${managerNode.lastName}`.trim()
    : null;
  return {
    homeSummary: home,
    docSummary: docs,
    managerName: manager,
  };
}
