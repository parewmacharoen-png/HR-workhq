// EMP-001b — allowed self-onboarding fields (HR-only fields rejected)

import { hasValidSelfOnboardingBank } from './thai-bank-options';

export const SELF_ONBOARDING_ALLOWED_FIELDS = [
  'fullName', 'firstName', 'lastName', 'nickname', 'phone', 'email', 'lineId',
  'dateOfBirth', 'address',
  'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone',
  'bankName', 'bankCode', 'bankAccountNumber', 'bankAccountHolderName',
] as const;

export const HR_ONLY_FIELDS = [
  'company', 'companyId', 'team', 'teamId', 'position', 'positionDefinitionId',
  'salary', 'payroll', 'role', 'permissions', 'hireDate', 'probationEndDate',
  'employmentStatus', 'commission', 'kpi', 'supervisor', 'leader', 'businessRole',
  'globalId', 'employeeCode',
] as const;

export type SelfOnboardingFieldKey = typeof SELF_ONBOARDING_ALLOWED_FIELDS[number];

export interface SelfOnboardingSubmittedData {
  [key: string]: string | undefined;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  phone?: string;
  email?: string;
  lineId?: string;
  dateOfBirth?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  bankName?: string;
  bankCode?: string;
  bankAccountNumber?: string;
  bankAccountHolderName?: string;
}

export function sanitizeSubmittedData(raw: Record<string, unknown>): SelfOnboardingSubmittedData {
  const out: SelfOnboardingSubmittedData = {};
  for (const key of SELF_ONBOARDING_ALLOWED_FIELDS) {
    const val = raw[key];
    if (val !== undefined && val !== null && val !== '') {
      (out as Record<string, unknown>)[key] = String(val).trim();
    }
  }
  return out;
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export type TelegramConnectionStatus =
  | 'not_connected'
  | 'invite_sent'
  | 'started'
  | 'onboarding_submitted'
  | 'pending_review'
  | 'linked'
  | 'rejected'
  | 'expired';

/** @deprecated Use TelegramConnectionStatus */
export type TelegramStatus = TelegramConnectionStatus;
export type SelfOnboardingStatusLabel =
  | 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected';

export interface InviteCompanyAssignment {
  companyId: string;
  department?: string;
  departmentId?: string;
  teamId?: string;
}

export interface InvitationEmploymentPreset {
  companyId: string;
  /** Extra companies the employee works for (primary is companyId). */
  additionalCompanyIds?: string[];
  /** Per-company department/team when employee works across companies. */
  companyAssignments?: InviteCompanyAssignment[];
  businessRole: string;
  employmentType: string;
  startDate: string;
  /** Organization function id (legacy). Prefer `department` for HR preset. */
  departmentId?: string;
  /** HR department label, e.g. Marketing / Admin / เลขา */
  department?: string;
  teamId?: string;
  position?: string;
  shiftId?: string;
  workLocation?: string;
  note?: string;
  source?: string;
  monthlySalary?: number;
  depositCollectionCompanyId?: string;
}

export const SELF_ONBOARDING_FORM_STEPS = [
  { key: 'fullName', label: 'ชื่อ-นามสกุล', required: true },
  { key: 'nickname', label: 'ชื่อเล่น', required: false, skippable: true },
  { key: 'phone', label: 'เบอร์โทร', required: true },
  { key: 'dateOfBirth', label: 'วันเกิด (วัน/เดือน/ปี เช่น 15/06/2017)', required: true },
  { key: 'emergencyContactPhone', label: 'เบอร์ติดต่อฉุกเฉิน', required: true },
  { key: 'bankCode', label: 'เลือกธนาคาร', required: true, type: 'bank_picker' as const },
  { key: 'bankAccountNumber', label: 'เลขบัญชีธนาคาร', required: true },
  { key: 'id_card', label: 'รูปบัตรประชาชน', required: true, type: 'photo' as const },
  { key: 'id_card_holding', label: 'รูปถือบัตรประชาชน', required: true, type: 'photo' as const },
  { key: 'profile_photo', label: 'รูปโปรไฟล์ (ใบหน้า)', required: false, type: 'photo' as const, skippable: true },
] as const;

function stepIsPhoto(step: (typeof SELF_ONBOARDING_FORM_STEPS)[number]): boolean {
  return 'type' in step && step.type === 'photo';
}

function stepIsBankPicker(step: (typeof SELF_ONBOARDING_FORM_STEPS)[number]): boolean {
  return 'type' in step && step.type === 'bank_picker';
}

/** Reconstruct wizard position from saved draft + uploaded documents (session recovery). */
export function computeSelfOnboardingStepIndex(
  data: SelfOnboardingSubmittedData,
  uploadedDocTypes: Iterable<string>,
): number {
  const uploaded = new Set(uploadedDocTypes);
  for (let i = 0; i < SELF_ONBOARDING_FORM_STEPS.length; i++) {
    const step = SELF_ONBOARDING_FORM_STEPS[i];
    if (stepIsPhoto(step)) {
      if (!uploaded.has(step.key)) return i;
      continue;
    }
    if (stepIsBankPicker(step)) {
      if (!hasValidSelfOnboardingBank(data)) return i;
      continue;
    }
    const key = step.key as keyof SelfOnboardingSubmittedData;
    if (data[key]) continue;
    const skippable = 'skippable' in step && step.skippable;
    if (skippable) {
      const hasLaterProgress = SELF_ONBOARDING_FORM_STEPS.slice(i + 1).some((later) => {
        if (stepIsPhoto(later)) return uploaded.has(later.key);
        if (stepIsBankPicker(later)) return hasValidSelfOnboardingBank(data);
        return !!(data[later.key as keyof SelfOnboardingSubmittedData]);
      });
      if (hasLaterProgress) continue;
    }
    return i;
  }
  return SELF_ONBOARDING_FORM_STEPS.length;
}
