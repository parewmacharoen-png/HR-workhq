import { ALL_COMPANIES_ID } from '../constants/company';
import { sanitizeApiErrorMessage } from '../lib/sanitize-api-error';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const TOKEN_KEY = 'workhq_token';
const COMPANY_KEY = 'workhq_company_id';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: string;
  mustChangePassword: boolean;
}

export interface MeResponse {
  id: string;
  username: string;
  userType: string;
  mustChangePassword: boolean;
  companyId: string | null;
  employeeId: string | null;
  displayName: string | null;
  roles: string[];
  businessRole: string | null;
  permissions: string[];
  scopes: Array<{ scopeType: string; companyId: string | null; teamId: string | null }>;
}

export interface CompanyOption {
  id: string;
  code: string;
  name: string;
}

export function getAuthToken(): string | null {
  return getToken();
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getCompanyId(): string {
  return localStorage.getItem(COMPANY_KEY) ?? '';
}

export function setCompanyId(id: string): void {
  localStorage.setItem(COMPANY_KEY, id);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function parseError(res: Response): Promise<ApiError> {
  const text = await res.text();
  let message = text || res.statusText;
  let requestId: string | undefined;
  let body: unknown;
  try {
    body = JSON.parse(text);
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      if (typeof obj.message === 'string') message = obj.message;
      else if (Array.isArray(obj.message)) message = obj.message.join(', ');
      if (typeof obj.requestId === 'string') requestId = obj.requestId;
    }
  } catch {
    // keep raw text
  }
  const safeMessage = sanitizeApiErrorMessage(message, res.status);
  return new ApiError(safeMessage, res.status, requestId, body);
}

function handleUnauthorized(): void {
  clearToken();
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  if (!text.trim()) {
    return undefined as T;
  }

  if (!contentType.includes('json') && text.trim().startsWith('<')) {
    throw new ApiError('Server returned HTML instead of JSON. Check API proxy configuration.', res.status);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      contentType.includes('json') ? 'Invalid JSON response from server' : `Unexpected response format (${contentType || 'unknown'})`,
      res.status,
    );
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError('Unauthorized', 401);
  }
  if (!res.ok) throw await parseError(res);
  return parseJsonResponse<T>(res);
}

function assertValidCompanyParam(params?: Record<string, string | undefined>) {
  if (params?.companyId === ALL_COMPANIES_ID) {
    throw new ApiError('กรุณาเลือกบริษัทจากแถบด้านบน (ไม่ใช่โหมดทุกบริษัท)', 400);
  }
}

export async function apiGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  assertValidCompanyParam(params);
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
  }
  const res = await fetch(url.toString(), { headers: authHeaders() });
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError('Unauthorized', 401);
  }
  if (!res.ok) throw await parseError(res);
  return parseJsonResponse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  params?: Record<string, string | undefined>,
): Promise<T> {
  assertValidCompanyParam(params);
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
  }
  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError('Unauthorized', 401);
  }
  if (!res.ok) throw await parseError(res);
  return parseJsonResponse<T>(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

export async function apiDeleteWithBody<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'DELETE',
    body: JSON.stringify(body),
  });
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw await parseError(res);
  return parseJsonResponse<LoginResponse>(res);
}

export async function fetchMe(): Promise<MeResponse> {
  return apiGet<MeResponse>('/auth/me');
}

export async function fetchCompanies(): Promise<CompanyOption[]> {
  return apiGet<CompanyOption[]>('/organization/companies');
}

export function hasPermission(permissions: string[], key: string): boolean {
  return permissions.includes(key);
}

export function hasAnyPermission(permissions: string[], keys: string[]): boolean {
  return keys.some((k) => permissions.includes(k));
}
