// ============================================================================
// modules/kpi/application/kpi-template.mapper.ts
// KPI-002 — shared template response mapping
// ============================================================================

import { Prisma } from '@prisma/client';
import { KpiMetricResponse, KpiTemplateResponse } from './dto/kpi.dto';

type TemplateRow = Prisma.KpiTemplateGetPayload<{ include: { metrics: true } }>;

export function toKpiTemplateResponse(template: TemplateRow): KpiTemplateResponse {
  return {
    id: template.id,
    companyId: template.companyId,
    positionDefinitionId: template.positionDefinitionId,
    name: template.name,
    description: template.description,
    applicableRole: template.applicableRole,
    applicableDepartment: template.applicableDepartment,
    applicableTeamId: template.applicableTeamId,
    status: template.status,
    version: template.version,
    rootId: template.rootId,
    sourceId: template.sourceId,
    metrics: template.metrics.map(toKpiMetricResponse),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

export function toKpiMetricResponse(metric: TemplateRow['metrics'][number]): KpiMetricResponse {
  return {
    id: metric.id,
    name: metric.name,
    description: metric.description,
    weight: Number(metric.weight),
    targetType: metric.targetType,
    targetValue: metric.targetValue,
    scoringMethod: metric.scoringMethod as KpiMetricResponse['scoringMethod'],
    formulaExpression: metric.formulaExpression,
    systemSourceKey: metric.systemSourceKey,
    apiEndpoint: metric.apiEndpoint,
    apiFieldPath: metric.apiFieldPath,
    sortOrder: metric.sortOrder,
  };
}
