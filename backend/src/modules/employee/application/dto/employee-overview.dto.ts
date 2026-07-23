// ============================================================================
// Employee Operating Center — Overview aggregate DTOs
// ============================================================================

export type EmployeeOverviewAlertSeverity = 'info' | 'warning' | 'critical';

export interface EmployeeOverviewAlert {
  id: string;
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  actionTab?: string;
}

export interface EmployeeOverviewActivity {
  id: string;
  title: string;
  description: string;
  occurredAt: string;
  actorName: string | null;
  source: string;
}

export interface EmployeeOverviewUpcomingEvent {
  id: string;
  icon: string;
  title: string;
  description: string;
  eventDate: string;
  daysUntil: number;
}

export interface EmployeeOverviewSummary {
  id: string;
  globalId: string;
  firstName: string;
  lastName: string;
  nickname: string | null;
  companyName: string | null;
  department: string | null;
  teamName: string | null;
  position: string | null;
  businessRole: string | null;
  employmentStatus: string;
  telegramStatus: 'linked' | 'invitation_sent' | 'pending_review' | 'not_linked' | 'expired' | 'rejected';
  telegramUsername: string | null;
  managerName: string | null;
  hireDate: string;
  tenureDisplay: string;
  dateOfBirth: string | null;
  ageYears: number | null;
  birthdayInDays: number | null;
  isBirthdayToday: boolean;
  isAnniversaryToday: boolean;
  workAnniversaryInDays: number | null;
  hasNationalId: boolean;
}

export interface EmployeeOverviewAttendanceSummary {
  todayStatus: string;
  lastCheckInAt: string | null;
  lastCheckOutAt: string | null;
  workedMinutesToday: number;
  lateMinutesMonth: number;
  presentDaysMonth: number;
  lateCountMonth: number;
  missingCheckInMonth: number;
  attendancePercentMonth: number;
}

export interface EmployeeOverviewLeaveSummary {
  balances: Array<{
    leaveTypeName: string;
    entitled: number;
    used: number;
    remaining: number;
  }>;
  upcomingLeave: Array<{
    id: string;
    leaveTypeName: string;
    startDate: string;
    endDate: string;
    days: number;
  }>;
  onLeaveToday: {
    leaveTypeName: string;
    startDate: string;
    endDate: string;
  } | null;
}

export interface EmployeeOverviewPayrollSummary {
  canViewSalary: boolean;
  currentSalary: number | null;
  salaryEffectiveFrom: string | null;
  bankCode: string | null;
  bankAccountMasked: string | null;
  lastAdjustmentAt: string | null;
  salaryReviewDue: boolean;
}

export interface EmployeeOverviewKpiSummary {
  latestScore: number | null;
  latestPeriod: string | null;
  status: string | null;
}

export interface EmployeeOverviewResponse {
  summary: EmployeeOverviewSummary;
  attendance: EmployeeOverviewAttendanceSummary | null;
  leave: EmployeeOverviewLeaveSummary | null;
  payroll: EmployeeOverviewPayrollSummary | null;
  kpi: EmployeeOverviewKpiSummary | null;
  alerts: EmployeeOverviewAlert[];
  recentActivities: EmployeeOverviewActivity[];
  upcomingEvents: EmployeeOverviewUpcomingEvent[];
}
