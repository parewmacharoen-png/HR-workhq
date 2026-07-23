import { apiGet, apiPatch, apiPost, apiPut } from './client';

export interface BackofficeUserRow {
  id: string;
  username: string;
  displayName: string;
  employeeId: string | null;
  employeeCode: string | null;
  isStandalone: boolean;
  businessRole: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  updatedAt: string;
  telegramStatus?: 'NONE' | 'PENDING' | 'LINKED' | 'EXPIRED';
  telegramUsername?: string | null;
}

export interface OperatorTelegramLinkInfo {
  status: 'NONE' | 'PENDING' | 'LINKED' | 'EXPIRED';
  deepLink: string | null;
  expiresAt: string | null;
  linkedAt: string | null;
  telegramUsername: string | null;
}

export interface OperatorTelegramLinkCreateResult {
  inviteId: string;
  deepLink: string;
  expiresAt: string;
  status: string;
}

export interface BackofficeModuleItem {
  id: string;
  label: string;
  permission: string;
  description?: string;
  menuHint?: string;
  granted: boolean;
  inRoleBundle: boolean;
}

export interface BackofficeModuleGroup {
  id: string;
  label: string;
  icon: string;
  items: BackofficeModuleItem[];
}

export interface BackofficeUserDetail extends BackofficeUserRow {
  modules: BackofficeModuleGroup[];
  grantedPermissions: string[];
  overrides: Array<{ id: string; permission: string; effect: string }>;
}

export interface CreateBackofficeUserInput {
  username: string;
  password: string;
  displayName?: string;
  businessRole: string;
}

export interface BackofficeAccessMatrix {
  modules: BackofficeModuleGroup[];
  rolePresets: Record<string, string[]>;
}

export function getBackofficeAccessMatrix() {
  return apiGet<BackofficeAccessMatrix>('/backoffice-users/access-matrix');
}

export function listBackofficeUsers() {
  return apiGet<BackofficeUserRow[]>('/backoffice-users');
}

export function getBackofficeUser(userId: string) {
  return apiGet<BackofficeUserDetail>(`/backoffice-users/${userId}`);
}

export function createBackofficeUser(input: CreateBackofficeUserInput) {
  return apiPost<BackofficeUserDetail>('/backoffice-users', input);
}

export function updateBackofficeUser(
  userId: string,
  input: { password?: string; isActive?: boolean; displayName?: string; businessRole?: string },
) {
  return apiPatch<BackofficeUserDetail>(`/backoffice-users/${userId}`, input);
}

export function saveBackofficePermissions(
  userId: string,
  input: { businessRole?: string; permissions: string[] },
) {
  return apiPut<BackofficeUserDetail>(`/backoffice-users/${userId}/permissions`, input);
}

export function getOperatorTelegramLink(userId: string) {
  return apiGet<OperatorTelegramLinkInfo>(`/backoffice-users/${userId}/telegram-link`);
}

export function createOperatorTelegramLink(userId: string) {
  return apiPost<OperatorTelegramLinkCreateResult>(`/backoffice-users/${userId}/telegram-link`, {});
}

export function revokeOperatorTelegramLink(userId: string) {
  return apiPost<{ ok: true }>(`/backoffice-users/${userId}/telegram-link/revoke`, {});
}

export const BACKOFFICE_ROLE_LABELS: Record<string, string> = {
  owner: 'เจ้าของ',
  secretary: 'เลขา / HR',
  big_leader: 'หัวหน้าทีมใหญ่',
  sub_leader: 'หัวหน้าทีมย่อย',
  admin_manager: 'หัวหน้าแอดมิน',
  admin: 'แอดมิน',
};
