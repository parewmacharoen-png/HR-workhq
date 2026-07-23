// ============================================================================
// modules/security/domain/telegram-identity.types.ts
// ============================================================================

export type TelegramAccessState = 'unverified' | 'pending' | 'active' | 'revoked';

export interface TelegramProfile {
  telegramUserId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface TelegramIdentityView {
  id: string;
  employeeId: string;
  telegramUserId: string;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  linkedAt: string;
  lastSeenAt: string | null;
  status: 'ACTIVE' | 'PENDING' | 'REVOKED';
}

export interface RegistrationRequestView {
  id: string;
  employeeId: string | null;
  employeeGlobalId: string | null;
  employeeName: string | null;
  telegramUserId: string;
  telegramUsername: string | null;
  requestStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  verificationMethod: 'employee_code_phone' | 'invite_code_phone' | 'invite_link' | 'manual';
  rejectionReason: string | null;
  submittedEmployeeCode: string | null;
  submittedPhone: string | null;
  submittedInviteCode: string | null;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10 && digits.startsWith('66')) {
    return digits.slice(-9);
  }
  if (digits.length >= 10 && digits.startsWith('0')) {
    return digits.slice(-9);
  }
  return digits.slice(-9);
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizePhone(a) === normalizePhone(b);
}
