// ============================================================================
// modules/workforce-risk/domain/workforce-risk.types.ts
// Pilot Release — Workforce Risk Engine
// ============================================================================

export type WorkforceRiskLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';

export type WorkforceRiskRecommendation =
  | 'approve_ot'
  | 'call_standby_employee'
  | 'move_employee_from_team'
  | 'reschedule_monthly_off'
  | 'alert_owner';

export interface WorkforceRiskResult {
  date: string;
  companyId: string;
  teamId: string | null;
  teamName: string | null;
  requiredMinimum: number;
  targetStaffing: number;
  availableCount: number;
  unavailableCount: number;
  shortage: number;
  level: WorkforceRiskLevel;
  reasons: string[];
  recommendations: WorkforceRiskRecommendation[];
}

export interface CompanyWorkforceRiskDto {
  date: string;
  companyId: string;
  overallLevel: WorkforceRiskLevel;
  teams: WorkforceRiskResult[];
  atRiskCount: number;
}

export interface WorkforceRiskForecastDto {
  companyId: string;
  startDate: string;
  days: number;
  items: Array<{
    date: string;
    overallLevel: WorkforceRiskLevel;
    atRiskCount: number;
    teams: WorkforceRiskResult[];
  }>;
}

export interface StaffingRuleDto {
  id: string;
  companyId: string;
  teamId: string | null;
  roleKey: string | null;
  minimumRequired: number;
  targetRequired: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
}

export const RISK_RECOMMENDATION_LABELS: Record<WorkforceRiskRecommendation, string> = {
  approve_ot: 'อนุมัติ OT เพื่อเพิ่มกำลังคน',
  call_standby_employee: 'เรียกพนักงานสำรอง',
  move_employee_from_team: 'ย้ายพนักงานจากทีมอื่นชั่วคราว',
  reschedule_monthly_off: 'เลื่อนวันหยุดประจำเดือน',
  alert_owner: 'แจ้งเตือน Owner',
};

export const UNAVAILABLE_WORKDAY_STATES = new Set([
  'LEAVE',
  'MONTHLY_OFF',
  'HOLIDAY',
  'ABSENT',
]);
