import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { ProtectedRoute, PublicRoute } from './routes/ProtectedRoute';
import { isMarketingEnabled } from './config/product';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ReportsPage from './pages/ReportsPage';
import ReportDetailPage from './pages/ReportDetailPage';
import KpiReviewPage from './pages/KpiReviewPage';
import AuditPage from './pages/AuditPage';
import ExpensesPage from './pages/ExpensesPage';
import ExpenseDetailPage from './pages/ExpenseDetailPage';
import ExpensesDashboardPage from './pages/ExpensesDashboardPage';
import TeamsPage from './pages/TeamsPage';
import TeamDetailPage from './pages/TeamDetailPage';
import CommissionCyclesPage from './pages/CommissionCyclesPage';
import CommissionCycleDetailPage from './pages/CommissionCycleDetailPage';
import CommissionAdjustmentsPage from './pages/CommissionAdjustmentsPage';
import CommissionAdjustmentDetailPage from './pages/CommissionAdjustmentDetailPage';
import CommissionDeclarationsPage from './pages/commission/CommissionDeclarationsPage';
import MarketingInsightsPage from './pages/MarketingInsightsPage';
import ExecutivePage from './pages/ExecutivePage';
import SelfOnboardingPage from './pages/hr/SelfOnboardingPage';
import InvitationCodePage from './pages/hr/InvitationCodePage';
import MyWorkPage from './pages/my-work/MyWorkPage';
import RequestsHubPage from './pages/requests/RequestsHubPage';
import CreateRequestPage from './pages/requests/CreateRequestPage';
import AttendanceHubPage from './pages/attendance/AttendanceHubPage';
import LeaveHubPage from './pages/leave/LeaveHubPage';
import ReportsHubPage from './pages/reports/ReportsHubPage';
import PerformanceHubPage from './pages/performance/PerformanceHubPage';
import CommissionHubPage from './pages/commission/CommissionHubPage';
import AdminCommissionCalculatePage from './pages/commission/AdminCommissionCalculatePage';
import EmployeesPage from './pages/hr/EmployeesPage';
import AddEmployeePage from './pages/hr/AddEmployeePage';
import LeaveRequestsPage from './pages/leave/LeaveRequestsPage';
import LeaveReschedulePage from './pages/leave/LeaveReschedulePage';
import LeaveShiftSwapsPage from './pages/leave/LeaveShiftSwapsPage';
import AttendanceDailyPage from './pages/attendance/AttendanceDailyPage';
import AttendanceCommandCenterPage from './pages/attendance/AttendanceCommandCenterPage';
import AbsenceReviewPage from './pages/attendance/AbsenceReviewPage';
import AttendanceOvertimePage from './pages/attendance/AttendanceOvertimePage';
import PayrollCyclesPage from './pages/payroll/PayrollCyclesPage';
import PayrollCycleDetailPage from './pages/payroll/PayrollCycleDetailPage';
import PayrollCycleOverviewPage from './pages/payroll/PayrollCycleOverviewPage';
import KnowledgeArticlesPage from './pages/knowledge/KnowledgeArticlesPage';
import KnowledgeArticleEditPage from './pages/knowledge/KnowledgeArticleEditPage';
import MarketingCommissionSettingsPage from './pages/settings/MarketingCommissionSettingsPage';
import AdminCommissionSettingsPage from './pages/settings/AdminCommissionSettingsPage';
import SettingsHubPage from './pages/settings/SettingsHubPage';
import SettingsCategoryPage from './pages/settings/SettingsCategoryPage';
import AttendanceSettingsPage from './pages/settings/AttendanceSettingsPage';
import LeaveSettingsPage from './pages/settings/LeaveSettingsPage';
import PayrollSettingsPage from './pages/settings/PayrollSettingsPage';
import ReferralSettingsPage from './pages/settings/ReferralSettingsPage';
import DepositSettingsPage from './pages/settings/DepositSettingsPage';
import PermissionsSettingsPage from './pages/settings/PermissionsSettingsPage';
import BackOfficeUsersPage from './pages/settings/BackOfficeUsersPage';
import ApprovalMatrixSettingsPage from './pages/settings/ApprovalMatrixSettingsPage';
import ApprovalsPage from './pages/approvals/ApprovalsPage';
import PendingRegistrationsPage from './pages/security/PendingRegistrationsPage';
import TelegramIdentitiesPage from './pages/security/TelegramIdentitiesPage';
import EmployeeDetailPage from './pages/hr/EmployeeDetailPage';
import EmployeeDepositPage from './pages/hr/EmployeeDepositPage';
import EmployeeDisciplinaryPage from './pages/hr/EmployeeDisciplinaryPage';
import EmployeeFinalSettlementPage from './pages/me/EmployeeFinalSettlementPage';
import ExitCasePage from './pages/hr/ExitCasePage';
import OrganizationPage from './pages/hr/OrganizationPage';
import CompensationReviewDashboardPage from './pages/hr/CompensationReviewDashboardPage';
import CompensationReviewListPage from './pages/hr/CompensationReviewListPage';
import KpiTemplatesPage from './pages/hr/kpi/KpiTemplatesPage';
import KpiCyclesPage from './pages/hr/kpi/KpiCyclesPage';
import PositionFrameworkPage from './pages/hr/position/PositionFrameworkPage';
import PerformanceReviewCyclesPage from './pages/hr/performance/PerformanceReviewCyclesPage';
import PerformanceReviewCycleDetailPage from './pages/hr/performance/PerformanceReviewCycleDetailPage';
import KpiCycleDetailPage from './pages/hr/kpi/KpiCycleDetailPage';
import FinancePage from './pages/finance/FinancePage';
import RequestDetailPage from './pages/requests/RequestDetailPage';
import RequestsPendingPage from './pages/requests/RequestsPendingPage';
import RequestTypesPage from './pages/admin/RequestTypesPage';
import WorkflowsPage from './pages/admin/WorkflowsPage';
import FormulasPage from './pages/admin/FormulasPage';
import AiManagerPage from './pages/ai/AiManagerPage';
import KnowledgeGraphPage from './pages/ai/KnowledgeGraphPage';
import CompetenciesPage from './pages/hr/CompetenciesPage';
import SuccessionPage from './pages/hr/SuccessionPage';
import EmployeeReferralsPage from './pages/hr/referrals/EmployeeReferralsPage';
import EmployeeReferralDetailPage from './pages/hr/referrals/EmployeeReferralDetailPage';
import CompanyAssetsPage from './pages/hr/assets/CompanyAssetsPage';
import ReferralProgramsPage from './pages/admin/ReferralProgramsPage';
import MyDocumentsPage from './pages/documents/MyDocumentsPage';
import AnnouncementsPage from './pages/announcements/AnnouncementsPage';
import TeamCalendarPage from './pages/calendar/TeamCalendarPage';
import KnowledgeAssistantPage from './pages/ai/KnowledgeAssistantPage';
import TrainingPage from './pages/training/TrainingPage';
import HrAnalyticsPage from './pages/analytics/HrAnalyticsPage';
import HrAuditExplorerPage from './pages/audit/HrAuditExplorerPage';
import ExportHistoryPage from './pages/ops/ExportHistoryPage';
import ImportHistoryPage from './pages/ops/ImportHistoryPage';
import ScheduledExportsPage from './pages/ops/ScheduledExportsPage';
import SavedReportsPage from './pages/ops/SavedReportsPage';
import OpsConsolePage from './pages/ops/OpsConsolePage';
import OpsHealthPage from './pages/ops/OpsHealthPage';
import QaReadinessPage from './pages/qa/QaReadinessPage';
import QaTraceabilityPage from './pages/qa/QaTraceabilityPage';

const marketingEnabled = isMarketingEnabled();

export default function App() {
  return (
    <Routes>
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/my-work" element={<MyWorkPage />} />
          <Route path="/me/final-settlement" element={<EmployeeFinalSettlementPage />} />
          <Route path="/hr/employees" element={<EmployeesPage />} />
          <Route path="/hr/employees/new" element={<AddEmployeePage />} />
          <Route path="/hr/employees/:id" element={<EmployeeDetailPage />} />
          <Route path="/hr/assets" element={<CompanyAssetsPage />} />
          <Route path="/hr/employees/:id/deposit" element={<EmployeeDepositPage />} />
          <Route path="/hr/employees/:id/disciplinary" element={<EmployeeDisciplinaryPage />} />
          <Route path="/hr/self-onboarding" element={<SelfOnboardingPage />} />
          <Route path="/hr/invitation" element={<InvitationCodePage />} />
          <Route path="/hr/exit/:id" element={<ExitCasePage />} />
          <Route path="/hr/organization" element={<OrganizationPage />} />
          <Route path="/hr/compensation-reviews" element={<CompensationReviewDashboardPage />} />
          <Route path="/hr/compensation-reviews/list" element={<CompensationReviewListPage />} />
          <Route path="/hr/position-framework" element={<PositionFrameworkPage />} />
          <Route path="/hr/kpi/templates" element={<KpiTemplatesPage />} />
          <Route path="/hr/kpi/cycles" element={<KpiCyclesPage />} />
          <Route path="/hr/kpi/cycles/:id" element={<KpiCycleDetailPage />} />
          <Route path="/hr/performance/reviews" element={<PerformanceReviewCyclesPage />} />
          <Route path="/hr/performance/reviews/:id" element={<PerformanceReviewCycleDetailPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/requests" element={<RequestsHubPage />} />
          <Route path="/requests/mine" element={<RequestsHubPage />} />
          <Route path="/requests/templates" element={<RequestsHubPage />} />
          <Route path="/requests/create" element={<CreateRequestPage />} />
          <Route path="/requests/pending" element={<RequestsPendingPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route path="/attendance" element={<AttendanceHubPage />} />
          <Route path="/leave" element={<LeaveHubPage />} />
          <Route path="/performance" element={<PerformanceHubPage />} />
          <Route path="/reports" element={<ReportsHubPage />} />
          <Route path="/commission" element={<CommissionHubPage />} />
          <Route path="/admin/request-types" element={<RequestTypesPage />} />
          <Route path="/admin/workflows" element={<WorkflowsPage />} />
          <Route path="/admin/formulas" element={<FormulasPage />} />
          <Route path="/ai/manager" element={<AiManagerPage />} />
          <Route path="/ai/knowledge-graph" element={<KnowledgeGraphPage />} />
          <Route path="/hr/competencies" element={<CompetenciesPage />} />
          <Route path="/hr/succession" element={<SuccessionPage />} />
          <Route path="/hr/referrals" element={<EmployeeReferralsPage />} />
          <Route path="/hr/referrals/:id" element={<EmployeeReferralDetailPage />} />
          <Route path="/admin/referral-programs" element={<ReferralProgramsPage />} />
          <Route path="/security/registrations" element={<PendingRegistrationsPage />} />
          <Route path="/security/telegram-identities" element={<TelegramIdentitiesPage />} />
          <Route path="/leave/requests" element={<LeaveRequestsPage />} />
          <Route path="/calendar/team" element={<TeamCalendarPage />} />
          <Route path="/leave/reschedule" element={<LeaveReschedulePage />} />
          <Route path="/leave/shift-swaps" element={<LeaveShiftSwapsPage />} />
          <Route path="/attendance/daily" element={<AttendanceDailyPage />} />
          <Route path="/attendance/command-center" element={<AttendanceCommandCenterPage />} />
          <Route path="/attendance/absences" element={<AbsenceReviewPage />} />
          <Route path="/attendance/overtime" element={<AttendanceOvertimePage />} />
          <Route path="/payroll/cycles" element={<PayrollCyclesPage />} />
          <Route path="/payroll/cycles/:id/overview" element={<PayrollCycleOverviewPage />} />
          <Route path="/payroll/cycles/:id" element={<PayrollCycleDetailPage />} />
          <Route path="/commission/admin" element={<AdminCommissionCalculatePage />} />
          {marketingEnabled && (
            <>
              <Route path="/marketing/reports" element={<ReportsPage />} />
              <Route path="/marketing/reports/:id" element={<ReportDetailPage />} />
              <Route path="/marketing/expenses" element={<ExpensesPage />} />
              <Route path="/marketing/expenses/dashboard" element={<ExpensesDashboardPage />} />
              <Route path="/marketing/expenses/:id" element={<ExpenseDetailPage />} />
              <Route path="/marketing/teams" element={<TeamsPage />} />
              <Route path="/marketing/teams/:id" element={<TeamDetailPage />} />
              <Route path="/marketing/kpi" element={<KpiReviewPage />} />
              <Route path="/marketing/audit" element={<AuditPage />} />
              <Route path="/marketing/insights" element={<MarketingInsightsPage />} />
              <Route path="/commission/cycles" element={<CommissionCyclesPage />} />
              <Route path="/commission/cycles/:id" element={<CommissionCycleDetailPage />} />
              <Route path="/commission/adjustments" element={<CommissionAdjustmentsPage />} />
              <Route path="/commission/adjustments/:id" element={<CommissionAdjustmentDetailPage />} />
              <Route path="/commission/declarations" element={<CommissionDeclarationsPage />} />
              <Route path="/settings/commission/marketing" element={<MarketingCommissionSettingsPage />} />
              <Route path="/executive" element={<ExecutivePage />} />
            </>
          )}
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/knowledge/articles" element={<KnowledgeArticlesPage />} />
          <Route path="/knowledge/articles/:id" element={<KnowledgeArticleEditPage />} />
          <Route path="/documents/my" element={<MyDocumentsPage />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/ai/knowledge-assistant" element={<KnowledgeAssistantPage />} />
          <Route path="/training" element={<TrainingPage />} />
          <Route path="/analytics/hr" element={<HrAnalyticsPage />} />
          <Route path="/audit" element={<HrAuditExplorerPage />} />
          <Route path="/ops" element={<OpsConsolePage />} />
          <Route path="/ops/exports" element={<ExportHistoryPage />} />
          <Route path="/ops/imports" element={<ImportHistoryPage />} />
          <Route path="/ops/reports" element={<SavedReportsPage />} />
          <Route path="/ops/scheduled-exports" element={<ScheduledExportsPage />} />
          <Route path="/ops/health" element={<OpsHealthPage />} />
          <Route path="/qa/readiness" element={<QaReadinessPage />} />
          <Route path="/qa/traceability" element={<QaTraceabilityPage />} />
          <Route path="/settings" element={<SettingsHubPage />} />
          <Route path="/settings/workflows" element={<Navigate to="/admin/workflows" replace />} />
          <Route path="/settings/attendance" element={<AttendanceSettingsPage />} />
          <Route path="/settings/leave" element={<LeaveSettingsPage />} />
          <Route path="/settings/payroll" element={<PayrollSettingsPage />} />
          <Route path="/settings/referral" element={<ReferralSettingsPage />} />
          <Route path="/settings/deposit" element={<DepositSettingsPage />} />
          <Route path="/settings/backoffice-users" element={<BackOfficeUsersPage />} />
          <Route path="/settings/permissions" element={<PermissionsSettingsPage />} />
          <Route path="/settings/approval-matrix" element={<ApprovalMatrixSettingsPage />} />
          <Route path="/settings/:category" element={<SettingsCategoryPage />} />
          <Route path="/settings/commission/admin" element={<AdminCommissionSettingsPage />} />
        </Route>
      </Route>
      <Route path="/logout" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export function ReportLink({ id, label }: { id: string; label: string }) {
  return <a href={`/marketing/reports/${id}`}>{label}</a>;
}
