import { apiGet, apiPost } from './client';

export interface EmployeeListItem {
  id: string;
  globalId: string;
  firstName: string;
  lastName: string;
  employmentStatus: string;
  telegramLinked: boolean;
  username: string | null;
  userId?: string | null;
  nickname?: string | null;
  phone?: string | null;
  email?: string | null;
  teamName?: string | null;
  primaryTeamId?: string | null;
  department?: string | null;
  position?: string | null;
  employmentType?: string | null;
  hireDate?: string;
  dateOfBirth?: string | null;
  ageYears?: number | null;
  tenureYears?: number;
  tenureMonths?: number;
  tenureDays?: number;
  tenureDisplay?: string;
  tenureDisplayDetailed?: string;
  tenureText?: string;
  anniversaryYears?: number;
  probationStatus?: string;
  probationStatusCode?: string;
}

export interface EmployeeListResponse {
  items: EmployeeListItem[];
  total: number;
}

export const WORKFORCE_EMPLOYMENT_STATUSES = ['active', 'probation'] as const;

export type WorkforceEmploymentStatus = typeof WORKFORCE_EMPLOYMENT_STATUSES[number];

export interface EmployeeListFilters {
  companyId: string;
  search?: string;
  /** Single status or comma-separated e.g. "active,probation" */
  status?: string;
  /** Shorthand for payroll / workforce lists — maps to status=active,probation */
  workforceOnly?: boolean;
}

export interface OnboardCompanyAssignment {
  companyId: string;
  department?: string;
  teamId?: string;
}

export interface OnboardEmployeeInput {
  firstName: string;
  lastName: string;
  nickname?: string;
  phone?: string;
  email?: string;
  companyId: string;
  department?: string;
  teamId?: string;
  position?: string;
  employmentType?: 'permanent' | 'full_time' | 'part_time' | 'probation' | 'contract';
  startDate: string;
  dateOfBirth?: string;
  createLogin?: boolean;
  username?: string;
  password?: string;
  businessRole?: string;
  companyScopeIds?: string[];
  teamScopeIds?: string[];
  additionalCompanyIds?: string[];
  companyAssignments?: OnboardCompanyAssignment[];
  monthlySalary: number;
  depositCollectionCompanyId?: string;
}

export interface OnboardEmployeeResponse {
  id: string;
  globalId: string;
  userId: string | null;
  username: string | null;
}

export const EMPTY_EMPLOYEE_LIST: EmployeeListResponse = { items: [], total: 0 };

export function normalizeEmployeeList(
  data: EmployeeListResponse | EmployeeListItem[] | null | undefined,
): EmployeeListResponse {
  if (!data) return EMPTY_EMPLOYEE_LIST;
  if (Array.isArray(data)) return { items: data, total: data.length };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: typeof data.total === 'number' ? data.total : (data.items?.length ?? 0),
  };
}

export async function fetchEmployeeList(filters: EmployeeListFilters): Promise<EmployeeListResponse> {
  const status = filters.workforceOnly
    ? WORKFORCE_EMPLOYMENT_STATUSES.join(',')
    : filters.status || undefined;
  const data = await apiGet<EmployeeListResponse | EmployeeListItem[]>('/employees', {
    companyId: filters.companyId,
    search: filters.search?.trim() || undefined,
    status,
  });
  return normalizeEmployeeList(data);
}

/** Employees eligible for payroll (active + probation) — same rule as payroll builder. */
export function fetchPayrollEligibleEmployees(
  companyId: string,
  search?: string,
): Promise<EmployeeListResponse> {
  return fetchEmployeeList({ companyId, search, workforceOnly: true });
}

export async function onboardEmployee(input: OnboardEmployeeInput): Promise<OnboardEmployeeResponse> {
  return apiPost<OnboardEmployeeResponse>('/employees/onboard', input);
}

export interface EmployeeRecognitionDashboard {
  birthdaysThisMonth: Array<{
    employeeId: string;
    employeeName: string;
    department: string | null;
    position: string | null;
    birthday: string;
    birthdayGiftGivenThisYear: boolean;
    birthdayGiftDate: string | null;
  }>;
  anniversariesThisMonth: Array<{
    employeeId: string;
    employeeName: string;
    department: string | null;
    position: string | null;
    hireDate: string;
    anniversaryYears: number;
    milestoneLabel: string;
    anniversaryGiftGivenThisYear: boolean;
    anniversaryGiftDate: string | null;
  }>;
}

export async function fetchRecognitionDashboard(companyId: string): Promise<EmployeeRecognitionDashboard> {
  return apiGet<EmployeeRecognitionDashboard>('/employees/dashboard/recognition-events', { companyId });
}

export interface EmployeeTenureDashboard {
  longestTenure: {
    employeeId: string;
    employeeName: string;
    department: string | null;
    position: string | null;
    tenureDisplay: string;
    tenureYears: number;
    tenureMonths: number;
    tenureDays: number;
  } | null;
  probationEndingSoon: {
    within7Days: Array<{
      employeeId: string;
      employeeName: string;
      department: string | null;
      position: string | null;
      probationEndDate: string;
      daysRemaining: number;
    }>;
    within14Days: Array<{
      employeeId: string;
      employeeName: string;
      department: string | null;
      position: string | null;
      probationEndDate: string;
      daysRemaining: number;
    }>;
    within30Days: Array<{
      employeeId: string;
      employeeName: string;
      department: string | null;
      position: string | null;
      probationEndDate: string;
      daysRemaining: number;
    }>;
  };
}

export async function fetchTenureDashboard(companyId: string): Promise<EmployeeTenureDashboard> {
  return apiGet<EmployeeTenureDashboard>('/employees/dashboard/tenure-insights', { companyId });
}

export type EmployeeRecognitionType =
  | 'BIRTHDAY_GIFT'
  | 'WORK_ANNIVERSARY_GIFT'
  | 'EMPLOYEE_OF_MONTH'
  | 'SPECIAL_REWARD'
  | 'BEST_ATTENDANCE'
  | 'BEST_PERFORMANCE'
  | 'TOP_RECRUITER'
  | 'TOP_MARKETING'
  | 'SERVICE_AWARD_1_YEAR'
  | 'SERVICE_AWARD_3_YEAR'
  | 'SERVICE_AWARD_5_YEAR'
  | 'SERVICE_AWARD_10_YEAR';

export interface EmployeeRecognitionRecord {
  id: string;
  employeeId: string;
  companyId: string;
  recognitionType: EmployeeRecognitionType;
  recognitionDate: string;
  awardMonth: string | null;
  giftOrReward: string | null;
  notes: string | null;
  recordedBy: string;
  recorderName: string | null;
  givenBy: string | null;
  givenByName: string | null;
  createdAt: string;
}

export interface EmployeeRecognitionListResponse {
  employeeId: string;
  items: EmployeeRecognitionRecord[];
}

export interface CreateEmployeeAwardInput {
  companyId: string;
  recognitionType: EmployeeRecognitionType;
  recognitionDate?: string;
  awardMonth?: string;
  giftOrReward?: string;
  givenBy?: string;
  notes?: string;
  announceCompanyWide?: boolean;
}

export interface AwardsDashboard {
  awardsThisMonth: Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    department: string | null;
    position: string | null;
    recognitionType: EmployeeRecognitionType;
    recognitionDate: string;
    awardMonth: string | null;
    giftOrReward: string | null;
    notes: string | null;
  }>;
  serviceAwardsDue: Array<{
    employeeId: string;
    employeeName: string;
    department: string | null;
    position: string | null;
    milestoneYears: number;
    serviceAwardType: EmployeeRecognitionType;
    anniversaryDate: string;
    daysUntil: number;
  }>;
  recentRecognitions: Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    department: string | null;
    position: string | null;
    recognitionType: EmployeeRecognitionType;
    recognitionDate: string;
    awardMonth: string | null;
    giftOrReward: string | null;
    notes: string | null;
  }>;
}

export async function fetchAwardsDashboard(companyId: string): Promise<AwardsDashboard> {
  return apiGet<AwardsDashboard>('/employees/dashboard/awards', { companyId });
}

export async function fetchEmployeeRecognitions(
  employeeId: string,
  companyId: string,
  type?: EmployeeRecognitionType,
): Promise<EmployeeRecognitionListResponse> {
  return apiGet<EmployeeRecognitionListResponse>(`/employees/${employeeId}/recognitions`, {
    companyId,
    type,
  });
}

export async function createEmployeeAward(
  employeeId: string,
  input: CreateEmployeeAwardInput,
): Promise<EmployeeRecognitionRecord> {
  return apiPost<EmployeeRecognitionRecord>(`/employees/${employeeId}/recognitions`, input);
}

export async function markBirthdayGift(
  employeeId: string,
  input: { companyId: string; notes?: string; announceCompanyWide?: boolean },
): Promise<EmployeeRecognitionRecord> {
  return apiPost<EmployeeRecognitionRecord>(`/employees/${employeeId}/recognitions/birthday-gift`, input);
}

export async function markAnniversaryGift(
  employeeId: string,
  input: { companyId: string; notes?: string },
): Promise<EmployeeRecognitionRecord> {
  return apiPost<EmployeeRecognitionRecord>(`/employees/${employeeId}/recognitions/anniversary-gift`, input);
}
