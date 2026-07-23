import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './layout/AppShell';
import { ProtectedRoute, PublicRoute } from './routes/ProtectedRoute';
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
import EmployeesPage from './pages/hr/EmployeesPage';
import LeaveRequestsPage from './pages/leave/LeaveRequestsPage';
import LeaveReschedulePage from './pages/leave/LeaveReschedulePage';
import LeaveShiftSwapsPage from './pages/leave/LeaveShiftSwapsPage';
import AttendanceDailyPage from './pages/attendance/AttendanceDailyPage';
import AttendanceOvertimePage from './pages/attendance/AttendanceOvertimePage';
import PayrollCyclesPage from './pages/payroll/PayrollCyclesPage';
import PayrollCycleDetailPage from './pages/payroll/PayrollCycleDetailPage';
import KnowledgeArticlesPage from './pages/knowledge/KnowledgeArticlesPage';
import KnowledgeArticleEditPage from './pages/knowledge/KnowledgeArticleEditPage';
import MarketingCommissionSettingsPage from './pages/settings/MarketingCommissionSettingsPage';
import AdminCommissionSettingsPage from './pages/settings/AdminCommissionSettingsPage';
import FinancePage from './pages/finance/FinancePage';

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
          <Route path="/hr/employees" element={<EmployeesPage />} />
          <Route path="/leave/requests" element={<LeaveRequestsPage />} />
          <Route path="/leave/reschedule" element={<LeaveReschedulePage />} />
          <Route path="/leave/shift-swaps" element={<LeaveShiftSwapsPage />} />
          <Route path="/attendance/daily" element={<AttendanceDailyPage />} />
          <Route path="/attendance/overtime" element={<AttendanceOvertimePage />} />
          <Route path="/payroll/cycles" element={<PayrollCyclesPage />} />
          <Route path="/payroll/cycles/:id" element={<PayrollCycleDetailPage />} />
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
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/knowledge/articles" element={<KnowledgeArticlesPage />} />
          <Route path="/knowledge/articles/:id" element={<KnowledgeArticleEditPage />} />
          <Route path="/settings/commission/marketing" element={<MarketingCommissionSettingsPage />} />
          <Route path="/settings/commission/admin" element={<AdminCommissionSettingsPage />} />
          <Route path="/executive" element={<ExecutivePage />} />
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
