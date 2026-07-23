import { apiGet, apiPost } from './client';

export type TelegramLinkStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

export interface EmployeeTelegramLink {
  id: string;
  employeeId: string;
  token: string;
  deepLink: string;
  status: TelegramLinkStatus;
  expiresAt: string;
  usedAt: string | null;
}

export type EmployeeTelegramUiStatus = 'NOT_LINKED' | 'LINK_SENT' | 'PENDING_REVIEW' | 'LINKED';

export function mapTelegramUiStatus(
  backendStatus: string,
  linked?: boolean,
): EmployeeTelegramUiStatus {
  if (backendStatus === 'linked' || backendStatus === 'connected') return 'LINKED';
  if (backendStatus === 'pending_review' || backendStatus === 'onboarding_submitted' || backendStatus === 'started') {
    return 'PENDING_REVIEW';
  }
  if (backendStatus === 'invite_sent' || backendStatus === 'invite_pending') return 'LINK_SENT';
  if (backendStatus === 'rejected') return 'NOT_LINKED';
  if (linked) return 'LINKED';
  return 'NOT_LINKED';
}

export function telegramLinkStatusLabel(status: TelegramLinkStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'พร้อมใช้งาน';
    case 'USED':
      return 'ใช้แล้ว';
    case 'EXPIRED':
      return 'หมดอายุ';
    case 'REVOKED':
      return 'ถูกยกเลิก';
    default:
      return status;
  }
}

export function telegramHeaderActionLabel(uiStatus: EmployeeTelegramUiStatus): string {
  switch (uiStatus) {
    case 'LINKED':
      return 'เชื่อมแล้ว';
    case 'LINK_SENT':
      return 'ส่งลิงก์แล้ว';
    case 'PENDING_REVIEW':
      return 'รอ HR ตรวจสอบ';
    default:
      return 'เชื่อม Telegram';
  }
}

export const TELEGRAM_LINK_MESSAGE_TEMPLATE =
  'สวัสดีค่ะ กรุณากดลิงก์นี้เพื่อเชื่อมบัญชี Telegram กับระบบ WorkHQ ของบริษัท: {{link}}';

export function buildTelegramLinkMessage(deepLink: string): string {
  return TELEGRAM_LINK_MESSAGE_TEMPLATE.replace('{{link}}', deepLink);
}

export function getEmployeeTelegramLink(employeeId: string) {
  return apiGet<EmployeeTelegramLink>(`/employees/${employeeId}/telegram-link`);
}

export function createEmployeeTelegramLink(employeeId: string, companyId: string) {
  return apiPost<EmployeeTelegramLink>(`/employees/${employeeId}/telegram-link`, { companyId });
}

export function regenerateEmployeeTelegramLink(employeeId: string, companyId: string) {
  return apiPost<EmployeeTelegramLink>(
    `/employees/${employeeId}/telegram-link/regenerate`,
    { companyId },
  );
}
