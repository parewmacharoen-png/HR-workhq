// ============================================================================
// modules/employee/application/dto/employee-events.dto.ts
// ============================================================================

export interface BirthdayDashboardItem {
  employeeId: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  birthday: string;
  birthdayDay: number;
  birthdayGiftGivenThisYear: boolean;
  birthdayGiftDate: string | null;
}

export interface AnniversaryDashboardItem {
  employeeId: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  hireDate: string;
  anniversaryYears: number;
  milestoneLabel: string;
  anniversaryDay: number;
  anniversaryGiftGivenThisYear: boolean;
  anniversaryGiftDate: string | null;
}

export interface EmployeeRecognitionDashboardResponse {
  birthdaysThisMonth: BirthdayDashboardItem[];
  anniversariesThisMonth: AnniversaryDashboardItem[];
}

export interface TenureFields {
  hireDate: string;
  tenureYears: number;
  tenureMonths: number;
  tenureDays: number;
  tenureDisplay: string;
  tenureDisplayDetailed: string;
}

export interface EmployeeProfileDatesResponse extends TenureFields {
  dateOfBirth: string | null;
  ageYears: number | null;
  tenureText: string;
  anniversaryYears: number;
  probationStatus: string;
  probationStatusCode: string;
  nextAnniversaryMilestoneYears: number | null;
  nextAnniversaryMilestoneLabel: string | null;
}

export interface LongestTenureDashboardItem {
  employeeId: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  tenureDisplay: string;
  tenureYears: number;
  tenureMonths: number;
  tenureDays: number;
}

export interface ProbationEndingSoonItem {
  employeeId: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  probationEndDate: string;
  daysRemaining: number;
}

/** Reserved for future dashboard widget — buckets by 7 / 14 / 30 days. */
export interface ProbationEndingSoonBuckets {
  within7Days: ProbationEndingSoonItem[];
  within14Days: ProbationEndingSoonItem[];
  within30Days: ProbationEndingSoonItem[];
}

export interface EmployeeTenureDashboardResponse {
  longestTenure: LongestTenureDashboardItem | null;
  probationEndingSoon: ProbationEndingSoonBuckets;
}
