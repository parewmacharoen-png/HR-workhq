// ============================================================================
// Marketing feature flag helpers — shared by AI tools, Telegram, and tests.
// ============================================================================

import { AiToolName } from '../modules/ai/domain/tool.types';

/** AI tools hidden when MARKETING_ENABLED=false (HR-only mode). */
export const MARKETING_DISABLED_AI_TOOLS: ReadonlySet<AiToolName> = new Set([
  'get_my_marketing_kpi',
  'get_my_latest_marketing_report',
  'get_team_marketing_kpi',
  'get_company_marketing_kpi',
  'get_marketing_report_audit',
  'get_my_marketing_expenses',
  'get_team_marketing_expenses',
  'get_company_marketing_expenses',
  'get_marketing_roi',
  'get_marketing_performance_insights',
  'get_marketing_risk_alerts',
  'get_marketing_forecast',
  'get_marketing_team_comparison',
  'get_commission_dashboard',
  'get_commission_cycle_status',
  'get_commission_preview',
  'get_commission_adjustments',
  'get_commission_adjustment_history',
  'get_executive_forecast',
  'get_executive_recommendations',
]);

/** Web nav group ids hidden in HR-only mode. */
export const HR_HIDDEN_NAV_GROUP_IDS = new Set(['marketing', 'commission', 'executive']);

/** Web settings paths hidden in HR-only mode (marketing commission rules). */
export const HR_HIDDEN_SETTINGS_PATHS = new Set(['/settings/commission/marketing']);

export function isMarketingMenuState(state: string): boolean {
  return state.startsWith('marketing:');
}

export function isMarketingOwnerCallback(data: string): boolean {
  return data.startsWith('owner:commission')
    || data.startsWith('owner:executive_brief');
}
