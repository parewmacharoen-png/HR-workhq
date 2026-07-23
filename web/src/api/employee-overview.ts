import { apiGet } from './client';

export interface EmployeeOverviewResponse {
  summary: {
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
  };
  attendance: {
    todayStatus: string;
    lastCheckInAt: string | null;
    lastCheckOutAt: string | null;
    workedMinutesToday: number;
    lateMinutesMonth: number;
    presentDaysMonth: number;
    lateCountMonth: number;
    missingCheckInMonth: number;
    attendancePercentMonth: number;
  } | null;
  leave: {
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
  } | null;
  payroll: {
    canViewSalary: boolean;
    currentSalary: number | null;
    salaryEffectiveFrom: string | null;
    bankCode: string | null;
    bankAccountMasked: string | null;
    lastAdjustmentAt: string | null;
    salaryReviewDue: boolean;
  } | null;
  kpi: {
    latestScore: number | null;
    latestPeriod: string | null;
    status: string | null;
  } | null;
  alerts: Array<{
    id: string;
    icon: string;
    title: string;
    description: string;
    actionLabel: string;
    actionTab?: string;
  }>;
  recentActivities: Array<{
    id: string;
    title: string;
    description: string;
    occurredAt: string;
    actorName: string | null;
    source: string;
  }>;
  upcomingEvents: Array<{
    id: string;
    icon: string;
    title: string;
    description: string;
    eventDate: string;
    daysUntil: number;
  }>;
}

export interface EmployeeEmploymentResponse {
  summary: {
    employmentStatus: string;
    employmentType: string | null;
    hireDate: string;
    terminationDate: string | null;
    tenureDisplay: string;
    position: string | null;
    department: string | null;
    workCategory: string;
    companyName: string | null;
    teamName: string | null;
    businessRole: string | null;
  };
  organization: Record<string, string | null>;
  reporting: Array<{
    relationshipType: string;
    manager: { id: string; globalId: string; name: string };
  }>;
  probation: {
    status: string;
    statusLabel: string;
    endDate: string | null;
    daysRemaining: number | null;
  };
  history: Array<Record<string, unknown>>;
}

export interface SalaryHistoryResponse {
  employeeId: string;
  bands: Array<{
    id: string;
    companyId: string;
    monthlySalary: number;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;
}

export function fetchEmployeeOverview(employeeId: string, companyId: string) {
  return apiGet<EmployeeOverviewResponse>(
    `/employees/${employeeId}/overview?companyId=${encodeURIComponent(companyId)}`,
  );
}

export function fetchEmployeeEmployment(employeeId: string, companyId: string) {
  return apiGet<EmployeeEmploymentResponse>(
    `/employees/${employeeId}/employment?companyId=${encodeURIComponent(companyId)}`,
  );
}

export function fetchEmployeeSalaryHistory(employeeId: string, companyId: string) {
  return apiGet<SalaryHistoryResponse>(
    `/employees/${employeeId}/salary-history?companyId=${encodeURIComponent(companyId)}`,
  );
}
