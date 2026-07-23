import { apiGet, apiPost, apiDelete } from './client';

export type ExportFormat = 'google_sheets' | 'pdf' | 'csv' | 'xlsx';
export type ExportJobStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ImportJobStatus =
  | 'uploaded' | 'parsing' | 'mapping' | 'validating' | 'preview_ready' | 'failed_validation'
  | 'ready_to_apply' | 'applying' | 'completed' | 'failed' | 'cancelled' | 'rolled_back';

export interface ExportJob {
  id: string;
  module: string;
  companyId: string;
  requestedBy: string;
  format: ExportFormat;
  progressPercent: number;
  rowCount: number;
  mode?: string;
  reportTemplateId?: string | null;
  savedReportId?: string | null;
  status: ExportJobStatus;
  googleSheetUrl: string | null;
  fileName: string | null;
  storageKey: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedReason: string | null;
  createdAt: string;
}

export interface ImportJob {
  id: string;
  module: string;
  companyId: string;
  status: ImportJobStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  appliedRows: number;
  failedRows: number;
  fileName: string | null;
  createdAt: string;
}

export interface ImportPreview {
  job: ImportJob;
  rows: Array<{
    id: string;
    rowNumber: number;
    status: string;
    rawJson: Record<string, string>;
    errorsJson?: string[];
  }>;
}

export interface ScheduledExport {
  id: string;
  companyId: string;
  module: string;
  format: ExportFormat;
  scheduleCron: string;
  timezone: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export function createExport(companyId: string, module: string, format: ExportFormat, filters?: Record<string, unknown>) {
  return apiPost<ExportJob>('/exports', { companyId, module, format, filters });
}

export function listExports(companyId: string) {
  return apiGet<ExportJob[]>('/exports', { companyId });
}

export function retryExport(id: string) {
  return apiPost<ExportJob>(`/exports/${id}/retry`, {});
}

export function deleteExport(id: string) {
  return apiDelete(`/exports/${id}`);
}

export function createImport(companyId: string, module: string, sourceType: 'csv' | 'xlsx' | 'google_sheets', sourceUrl?: string) {
  return apiPost<ImportJob>('/imports', { companyId, module, sourceType, sourceUrl });
}

export async function uploadImportFile(jobId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const token = localStorage.getItem('workhq_token');
  const companyId = localStorage.getItem('workhq_company_id');
  const res = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}/imports/${jobId}/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(companyId ? { 'X-Company-Id': companyId } : {}),
    },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<ImportJob>;
}

export function previewImport(id: string) {
  return apiGet<ImportPreview>(`/imports/${id}/preview`);
}

export function applyImport(id: string) {
  return apiPost<ImportJob>(`/imports/${id}/apply`, {});
}

export function listImports(companyId: string) {
  return apiGet<ImportJob[]>('/imports', { companyId });
}

export function listScheduledExports(companyId: string) {
  return apiGet<ScheduledExport[]>('/scheduled-exports', { companyId });
}

export function createScheduledExport(body: {
  companyId: string;
  module: string;
  scheduleCron: string;
  format?: ExportFormat;
}) {
  return apiPost<ScheduledExport>('/scheduled-exports', body);
}

export function runScheduledExportNow(id: string) {
  return apiPost(`/scheduled-exports/${id}/run-now`, {});
}

export function toggleScheduledExport(id: string, enable: boolean) {
  return apiPost(`/scheduled-exports/${id}/${enable ? 'enable' : 'disable'}`, {});
}
