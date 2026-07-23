import { apiDelete, apiGet, apiPost, getAuthToken } from './client';

export interface EmployeeDocumentRow {
  id: string;
  docType: string;
  fileName: string;
  fileKey: string;
  mimeType?: string;
  expiresAt?: string;
  uploadedAt: string;
  acknowledgedAt?: string;
}

export interface DocumentDashboard {
  missingRequired: number;
  expiringSoon: number;
  failedDocumentJobs: number;
  recentlyUploaded: Array<{ fileName: string; docType: string; uploadedAt: string }>;
  uploadStatus: {
    total: number;
    acknowledged: number;
    pendingAcknowledgement: number;
  };
}

export interface KnowledgeArticleSummary {
  id: string;
  title: string;
  category?: string;
  tags: string[];
  updatedAt: string;
}

export interface TrainingCourseSummary {
  id: string;
  code: string;
  title: string;
  description?: string;
  isMandatory: boolean;
}

export type IdentityDocumentType = 'national_id' | 'passport';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export function listMyDocuments() {
  return apiGet<EmployeeDocumentRow[]>('/documents/my');
}

export function listEmployeeDocuments(employeeId: string) {
  return apiGet<EmployeeDocumentRow[]>(`/documents/employees/${employeeId}`);
}

export function uploadDocument(body: {
  employeeId: string;
  docType: string;
  fileKey: string;
  fileName: string;
  mimeType?: string;
  expiresAt?: string;
}) {
  return apiPost<EmployeeDocumentRow>('/documents', body);
}

export async function uploadEmployeeDocumentMultipart(
  employeeId: string,
  docType: IdentityDocumentType,
  file: File,
) {
  const form = new FormData();
  form.append('file', file);
  form.append('employeeId', employeeId);
  form.append('docType', docType);
  const token = getAuthToken();
  const companyId = localStorage.getItem('workhq_company_id');
  const res = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(companyId ? { 'X-Company-Id': companyId } : {}),
    },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<EmployeeDocumentRow>;
}

export function deleteEmployeeDocument(documentId: string) {
  return apiDelete<{ ok: boolean; id: string }>(`/documents/${documentId}`);
}

export async function downloadEmployeeDocument(documentId: string, fileName: string) {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/documents/${documentId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function previewEmployeeDocument(documentId: string) {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/documents/${documentId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function getDocumentDashboard(companyId: string) {
  return apiGet<DocumentDashboard>('/documents/dashboard', { companyId });
}

export function listDocumentCenterKnowledge(companyId?: string) {
  return apiGet<KnowledgeArticleSummary[]>('/knowledge', companyId ? { companyId } : undefined);
}

export function listTrainingCourses() {
  return apiGet<TrainingCourseSummary[]>('/training');
}
