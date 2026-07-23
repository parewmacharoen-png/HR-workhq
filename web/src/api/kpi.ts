import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type KpiTemplateStatus = 'draft' | 'active' | 'archived';
export type KpiCycleStatus = 'draft' | 'active' | 'scoring' | 'finalized' | 'cancelled';
export type KpiAssignmentStatus = 'pending' | 'in_progress' | 'submitted' | 'reviewed' | 'finalized';
export type KpiTargetType = 'number' | 'percent' | 'boolean' | 'rating' | 'text';
export type KpiScoringMethod = 'manual' | 'formula' | 'imported' | 'system' | 'api';

export interface KpiMetricInput {
  name: string;
  description?: string;
  weight: number;
  targetType: KpiTargetType;
  targetValue?: string;
  scoringMethod?: KpiScoringMethod;
  formulaExpression?: string;
  systemSourceKey?: string;
  apiEndpoint?: string;
  apiFieldPath?: string;
  sortOrder?: number;
}

export interface KpiMetric {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  targetType: KpiTargetType;
  targetValue: string | null;
  scoringMethod: KpiScoringMethod;
  formulaExpression: string | null;
  systemSourceKey: string | null;
  apiEndpoint: string | null;
  apiFieldPath: string | null;
  sortOrder: number;
}

export interface KpiTemplate {
  id: string;
  companyId: string | null;
  positionDefinitionId: string | null;
  name: string;
  description: string | null;
  applicableRole: string | null;
  applicableDepartment: string | null;
  applicableTeamId: string | null;
  status: KpiTemplateStatus;
  version: number;
  rootId: string | null;
  sourceId: string | null;
  metrics: KpiMetric[];
  createdAt: string;
  updatedAt: string;
}

export interface KpiCycle {
  id: string;
  companyId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: KpiCycleStatus;
  assignmentCount: number;
  createdAt: string;
}

export interface KpiScoreItem {
  id: string;
  metricId: string;
  metricName: string;
  rawValue: string | null;
  score: number | null;
  weight: number;
}

export interface KpiScore {
  id: string;
  totalScore: number | null;
  grade: string | null;
  employeeComment: string | null;
  reviewerComment: string | null;
  finalizedAt: string | null;
  items: KpiScoreItem[];
}

export interface KpiAssignment {
  id: string;
  cycleId: string;
  cycleName: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  templateId: string;
  templateName: string;
  reviewerId: string | null;
  status: KpiAssignmentStatus;
  score: KpiScore | null;
  createdAt: string;
}

export interface KpiDashboard {
  companyId: string;
  activeCycles: KpiCycle[];
  pendingAssignments: KpiAssignment[];
  submittedAssignments: KpiAssignment[];
  recentlyFinalized: KpiAssignment[];
}

export interface EmployeeKpi {
  employeeId: string;
  companyId: string;
  assignments: KpiAssignment[];
}

export function fetchKpiTemplates(companyId: string): Promise<KpiTemplate[]> {
  return apiGet<KpiTemplate[]>('/kpi/templates', { companyId });
}

export function createKpiTemplate(body: {
  companyId: string;
  name: string;
  description?: string;
  positionDefinitionId?: string;
  applicableRole?: string;
  applicableDepartment?: string;
  applicableTeamId?: string;
  metrics: KpiMetricInput[];
}): Promise<KpiTemplate> {
  return apiPost<KpiTemplate>('/kpi/templates', body);
}

export function updateKpiTemplate(
  id: string,
  body: {
    name?: string;
    description?: string;
    positionDefinitionId?: string;
    applicableRole?: string;
    applicableDepartment?: string;
    applicableTeamId?: string;
    status?: KpiTemplateStatus;
    metrics?: KpiMetricInput[];
  },
): Promise<KpiTemplate> {
  return apiPatch<KpiTemplate>(`/kpi/templates/${id}`, body);
}

export function fetchKpiTemplatesByPosition(
  companyId: string,
  positionDefinitionId: string,
): Promise<KpiTemplate[]> {
  return apiGet<KpiTemplate[]>('/kpi/templates/by-position', { companyId, positionDefinitionId });
}

export function cloneKpiTemplate(id: string): Promise<KpiTemplate> {
  return apiPost<KpiTemplate>(`/kpi/templates/${id}/clone`, {});
}

export function archiveKpiTemplate(id: string): Promise<KpiTemplate> {
  return apiPost<KpiTemplate>(`/kpi/templates/${id}/archive`, {});
}

export function deleteKpiTemplate(id: string): Promise<void> {
  return apiDelete<void>(`/kpi/templates/${id}`);
}

export function versionKpiTemplate(id: string): Promise<KpiTemplate> {
  return apiPost<KpiTemplate>(`/kpi/templates/${id}/version`, {});
}

export function fetchKpiCycles(companyId: string): Promise<KpiCycle[]> {
  return apiGet<KpiCycle[]>('/kpi/cycles', { companyId });
}

export function createKpiCycle(body: {
  companyId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
}): Promise<KpiCycle> {
  return apiPost<KpiCycle>('/kpi/cycles', body);
}

export function assignKpiCycle(
  cycleId: string,
  body: { templateId: string; employeeIds: string[]; reviewerId?: string },
): Promise<KpiAssignment[]> {
  return apiPost<KpiAssignment[]>(`/kpi/cycles/${cycleId}/assign`, body);
}

export function fetchKpiCycleAssignments(cycleId: string): Promise<KpiAssignment[]> {
  return apiGet<KpiAssignment[]>(`/kpi/cycles/${cycleId}/assignments`);
}

export function fetchKpiDashboard(companyId: string): Promise<KpiDashboard> {
  return apiGet<KpiDashboard>('/kpi/dashboard', { companyId });
}

export function fetchEmployeeKpi(employeeId: string, companyId: string): Promise<EmployeeKpi> {
  return apiGet<EmployeeKpi>(`/employees/${employeeId}/kpi`, { companyId });
}

export function updateKpiScores(
  assignmentId: string,
  body: {
    items: Array<{ metricId: string; rawValue?: string; score?: number }>;
    employeeComment?: string;
    reviewerComment?: string;
  },
): Promise<KpiAssignment> {
  return apiPatch<KpiAssignment>(`/kpi/assignments/${assignmentId}/scores`, body);
}

export function submitKpiAssignment(assignmentId: string): Promise<KpiAssignment> {
  return apiPost<KpiAssignment>(`/kpi/assignments/${assignmentId}/submit`, {});
}

export function finalizeKpiAssignment(assignmentId: string): Promise<KpiAssignment> {
  return apiPost<KpiAssignment>(`/kpi/assignments/${assignmentId}/finalize`, {});
}
