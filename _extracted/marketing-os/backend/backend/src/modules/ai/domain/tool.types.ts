// ============================================================================
// modules/ai/domain/tool.types.ts
// Read-only WorkHQ HR Copilot + Owner Copilot tool definitions.
// ============================================================================

export type AiToolTier = 'employee' | 'leader' | 'owner';

export type AiToolName =
  | 'get_employee_profile'
  | 'get_leave_balance'
  | 'get_attendance_summary'
  | 'get_commission_summary'
  | 'get_referral_summary'
  | 'get_latest_payslip'
  | 'get_my_profile'
  | 'get_my_leave_balance'
  | 'get_my_leave_history'
  | 'get_my_attendance_summary'
  | 'get_my_late_statistics'
  | 'get_my_ot_summary'
  | 'get_my_latest_payslip'
  | 'get_my_payroll_summary'
  | 'get_my_commission'
  | 'get_my_commission_history'
  | 'get_my_referrals'
  | 'get_my_marketing_kpi'
  | 'get_my_latest_marketing_report'
  | 'get_team_marketing_kpi'
  | 'get_company_marketing_kpi'
  | 'get_marketing_report_audit'
  | 'get_my_marketing_expenses'
  | 'get_team_marketing_expenses'
  | 'get_company_marketing_expenses'
  | 'get_marketing_roi'
  | 'get_marketing_performance_insights'
  | 'get_marketing_risk_alerts'
  | 'get_marketing_forecast'
  | 'get_marketing_team_comparison'
  | 'get_team_attendance'
  | 'get_team_leave_requests'
  | 'get_team_ot_requests'
  | 'get_team_performance_summary'
  | 'get_company_dashboard'
  | 'get_payroll_summary'
  | 'get_finance_summary'
  | 'get_recruitment_summary'
  | 'get_risk_summary'
  | 'get_executive_summary'
  | 'get_executive_risks'
  | 'get_executive_forecast'
  | 'get_executive_recommendations'
  | 'get_commission_dashboard'
  | 'get_commission_cycle_status'
  | 'get_commission_preview'
  | 'get_commission_adjustments'
  | 'get_commission_adjustment_history'
  | 'get_company_profit_ranking'
  | 'get_team_performance_rankings'
  | 'search_company_knowledge';

export interface AiToolDefinition {
  name: AiToolName;
  description: string;
  tier: AiToolTier;
  permission: string;
  inputSchema: Record<string, unknown>;
}

export interface AiToolExecutionContext {
  employeeId: string | null;
  companyId: string;
}

export interface AiToolExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}
