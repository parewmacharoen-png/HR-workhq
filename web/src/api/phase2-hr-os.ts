import { apiGet, apiPost } from './client';

export function listWorkflows(companyId?: string, status?: string, category?: string) {
  const params = new URLSearchParams();
  if (companyId) params.set('companyId', companyId);
  if (status) params.set('status', status);
  if (category) params.set('category', category);
  return apiGet<Array<Record<string, unknown>>>(`/workflows?${params}`);
}

export function publishWorkflow(id: string) {
  return apiPost(`/workflows/${id}/publish`, {});
}

export function listFormulas(companyId?: string) {
  const params = companyId ? `?companyId=${companyId}` : '';
  return apiGet<Array<Record<string, unknown>>>(`/formulas${params}`);
}

export function testFormula(id: string, inputs: Record<string, number>) {
  return apiPost<{ result: number | null; error: string | null }>(`/formulas/${id}/test`, { inputs });
}

export function aiManagerDashboard(companyId: string) {
  return apiGet<Record<string, unknown>>(`/ai/manager/dashboard?companyId=${companyId}`);
}

export function aiManagerBriefHistory(companyId: string) {
  return apiGet<Array<Record<string, unknown>>>(`/ai/manager/brief/history?companyId=${companyId}`);
}

export function aiManagerRegenerateBrief(companyId: string, employeeId: string) {
  return apiPost<Record<string, unknown>>(
    `/ai/manager/brief/regenerate?companyId=${companyId}&employeeId=${employeeId}`,
    {},
  );
}

export function graphQuery(companyId: string, query: string) {
  return apiPost<{ rows: Array<Record<string, unknown>>; intent: string }>('/ai/graph/query', { companyId, query });
}

export function listCompetencies(companyId?: string) {
  const params = companyId ? `?companyId=${companyId}` : '';
  return apiGet<Array<Record<string, unknown>>>(`/hr/competencies${params}`);
}

export function listCriticalRoles(companyId: string) {
  return apiGet<Array<Record<string, unknown>>>(`/hr/succession/critical-roles?companyId=${companyId}`);
}
