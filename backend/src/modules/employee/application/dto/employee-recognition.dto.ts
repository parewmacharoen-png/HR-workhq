// ============================================================================
// modules/employee/application/dto/employee-recognition.dto.ts
// HR-013c / EMP-011 — Employee recognition, awards & service milestones
// ============================================================================

import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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

export class CreateEmployeeRecognitionDto {
  @IsUUID() companyId!: string;

  @IsEnum([
    'BIRTHDAY_GIFT',
    'WORK_ANNIVERSARY_GIFT',
    'EMPLOYEE_OF_MONTH',
    'SPECIAL_REWARD',
    'BEST_ATTENDANCE',
    'BEST_PERFORMANCE',
    'TOP_RECRUITER',
    'TOP_MARKETING',
    'SERVICE_AWARD_1_YEAR',
    'SERVICE_AWARD_3_YEAR',
    'SERVICE_AWARD_5_YEAR',
    'SERVICE_AWARD_10_YEAR',
  ] as const)
  recognitionType!: EmployeeRecognitionType;

  @IsOptional() @IsDateString() recognitionDate?: string;
  @IsOptional() @IsDateString() awardMonth?: string;
  @IsOptional() @IsString() @MaxLength(500) giftOrReward?: string;
  @IsOptional() @IsUUID() givenBy?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() announceCompanyWide?: boolean;
}

export interface MarkBirthdayGiftDto {
  companyId: string;
  recognitionDate?: string;
  notes?: string;
  announceCompanyWide?: boolean;
}

export interface MarkAnniversaryGiftDto {
  companyId: string;
  recognitionDate?: string;
  notes?: string;
}

export interface EmployeeRecognitionResponse {
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
  items: EmployeeRecognitionResponse[];
}

export interface AwardDashboardItem {
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
}

export interface ServiceAwardDueItem {
  employeeId: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  milestoneYears: number;
  serviceAwardType: EmployeeRecognitionType;
  anniversaryDate: string;
  daysUntil: number;
}

export interface EmployeeAwardsDashboardResponse {
  awardsThisMonth: AwardDashboardItem[];
  serviceAwardsDue: ServiceAwardDueItem[];
  recentRecognitions: AwardDashboardItem[];
}
