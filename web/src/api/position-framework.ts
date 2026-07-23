import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type FrameworkEntityStatus = 'draft' | 'active' | 'archived';

export type FrameworkEntityType = 'families' | 'levels' | 'positions' | 'career-paths' | 'promotion-paths';

export interface FrameworkEntityBase {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description: string | null;
  status: FrameworkEntityStatus;
  version: number;
  rootId: string | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PositionFamily extends FrameworkEntityBase {}

export interface PositionLevel extends FrameworkEntityBase {
  familyId: string | null;
  rankOrder: number;
}

export interface PositionDefinition extends FrameworkEntityBase {
  familyId: string | null;
  levelId: string | null;
}

export interface CareerPathStep {
  id: string;
  positionDefinitionId: string;
  stepOrder: number;
  notes: string | null;
}

export interface CareerPath extends FrameworkEntityBase {
  steps: CareerPathStep[];
}

export interface PromotionPath extends FrameworkEntityBase {
  fromPositionId: string;
  toPositionId: string;
  requirements: string | null;
}

function entityPath(type: FrameworkEntityType): string {
  return `/position-framework/${type}`;
}

export function fetchPositionFamilies(companyId: string): Promise<PositionFamily[]> {
  return apiGet<PositionFamily[]>(entityPath('families'), { companyId });
}

export function createPositionFamily(body: {
  companyId: string;
  code: string;
  name: string;
  description?: string;
}): Promise<PositionFamily> {
  return apiPost<PositionFamily>(entityPath('families'), body);
}

export function updatePositionFamily(
  id: string,
  body: Partial<{ code: string; name: string; description: string; status: FrameworkEntityStatus }>,
): Promise<PositionFamily> {
  return apiPatch<PositionFamily>(`${entityPath('families')}/${id}`, body);
}

export function deletePositionFamily(id: string): Promise<void> {
  return apiDelete<void>(`${entityPath('families')}/${id}`);
}

export function archivePositionFamily(id: string): Promise<PositionFamily> {
  return apiPost<PositionFamily>(`${entityPath('families')}/${id}/archive`, {});
}

export function clonePositionFamily(id: string): Promise<PositionFamily> {
  return apiPost<PositionFamily>(`${entityPath('families')}/${id}/clone`, {});
}

export function versionPositionFamily(id: string): Promise<PositionFamily> {
  return apiPost<PositionFamily>(`${entityPath('families')}/${id}/version`, {});
}

export function fetchPositionLevels(companyId: string): Promise<PositionLevel[]> {
  return apiGet<PositionLevel[]>(entityPath('levels'), { companyId });
}

export function createPositionLevel(body: {
  companyId: string;
  familyId?: string;
  code: string;
  name: string;
  rankOrder?: number;
  description?: string;
}): Promise<PositionLevel> {
  return apiPost<PositionLevel>(entityPath('levels'), body);
}

export function updatePositionLevel(
  id: string,
  body: Partial<{
    familyId: string | null;
    code: string;
    name: string;
    rankOrder: number;
    description: string;
    status: FrameworkEntityStatus;
  }>,
): Promise<PositionLevel> {
  return apiPatch<PositionLevel>(`${entityPath('levels')}/${id}`, body);
}

export function deletePositionLevel(id: string): Promise<void> {
  return apiDelete<void>(`${entityPath('levels')}/${id}`);
}

export function archivePositionLevel(id: string): Promise<PositionLevel> {
  return apiPost<PositionLevel>(`${entityPath('levels')}/${id}/archive`, {});
}

export function clonePositionLevel(id: string): Promise<PositionLevel> {
  return apiPost<PositionLevel>(`${entityPath('levels')}/${id}/clone`, {});
}

export function versionPositionLevel(id: string): Promise<PositionLevel> {
  return apiPost<PositionLevel>(`${entityPath('levels')}/${id}/version`, {});
}

export function fetchPositionDefinitions(companyId: string): Promise<PositionDefinition[]> {
  return apiGet<PositionDefinition[]>(entityPath('positions'), { companyId });
}

export function createPositionDefinition(body: {
  companyId: string;
  familyId?: string;
  levelId?: string;
  code: string;
  name: string;
  description?: string;
}): Promise<PositionDefinition> {
  return apiPost<PositionDefinition>(entityPath('positions'), body);
}

export function updatePositionDefinition(
  id: string,
  body: Partial<{
    familyId: string | null;
    levelId: string | null;
    code: string;
    name: string;
    description: string;
    status: FrameworkEntityStatus;
  }>,
): Promise<PositionDefinition> {
  return apiPatch<PositionDefinition>(`${entityPath('positions')}/${id}`, body);
}

export function deletePositionDefinition(id: string): Promise<void> {
  return apiDelete<void>(`${entityPath('positions')}/${id}`);
}

export function archivePositionDefinition(id: string): Promise<PositionDefinition> {
  return apiPost<PositionDefinition>(`${entityPath('positions')}/${id}/archive`, {});
}

export function clonePositionDefinition(id: string): Promise<PositionDefinition> {
  return apiPost<PositionDefinition>(`${entityPath('positions')}/${id}/clone`, {});
}

export function versionPositionDefinition(id: string): Promise<PositionDefinition> {
  return apiPost<PositionDefinition>(`${entityPath('positions')}/${id}/version`, {});
}

export function fetchCareerPaths(companyId: string): Promise<CareerPath[]> {
  return apiGet<CareerPath[]>(entityPath('career-paths'), { companyId });
}

export function createCareerPath(body: {
  companyId: string;
  code: string;
  name: string;
  description?: string;
  steps?: Array<{ positionDefinitionId: string; stepOrder?: number; notes?: string }>;
}): Promise<CareerPath> {
  return apiPost<CareerPath>(entityPath('career-paths'), body);
}

export function updateCareerPath(
  id: string,
  body: Partial<{
    code: string;
    name: string;
    description: string;
    status: FrameworkEntityStatus;
    steps: Array<{ positionDefinitionId: string; stepOrder?: number; notes?: string }>;
  }>,
): Promise<CareerPath> {
  return apiPatch<CareerPath>(`${entityPath('career-paths')}/${id}`, body);
}

export function deleteCareerPath(id: string): Promise<void> {
  return apiDelete<void>(`${entityPath('career-paths')}/${id}`);
}

export function archiveCareerPath(id: string): Promise<CareerPath> {
  return apiPost<CareerPath>(`${entityPath('career-paths')}/${id}/archive`, {});
}

export function cloneCareerPath(id: string): Promise<CareerPath> {
  return apiPost<CareerPath>(`${entityPath('career-paths')}/${id}/clone`, {});
}

export function versionCareerPath(id: string): Promise<CareerPath> {
  return apiPost<CareerPath>(`${entityPath('career-paths')}/${id}/version`, {});
}

export function fetchPromotionPaths(companyId: string): Promise<PromotionPath[]> {
  return apiGet<PromotionPath[]>(entityPath('promotion-paths'), { companyId });
}

export function createPromotionPath(body: {
  companyId: string;
  code: string;
  name: string;
  description?: string;
  fromPositionId: string;
  toPositionId: string;
  requirements?: string;
}): Promise<PromotionPath> {
  return apiPost<PromotionPath>(entityPath('promotion-paths'), body);
}

export function updatePromotionPath(
  id: string,
  body: Partial<{
    code: string;
    name: string;
    description: string;
    fromPositionId: string;
    toPositionId: string;
    requirements: string;
    status: FrameworkEntityStatus;
  }>,
): Promise<PromotionPath> {
  return apiPatch<PromotionPath>(`${entityPath('promotion-paths')}/${id}`, body);
}

export function deletePromotionPath(id: string): Promise<void> {
  return apiDelete<void>(`${entityPath('promotion-paths')}/${id}`);
}

export function archivePromotionPath(id: string): Promise<PromotionPath> {
  return apiPost<PromotionPath>(`${entityPath('promotion-paths')}/${id}/archive`, {});
}

export function clonePromotionPath(id: string): Promise<PromotionPath> {
  return apiPost<PromotionPath>(`${entityPath('promotion-paths')}/${id}/clone`, {});
}

export function versionPromotionPath(id: string): Promise<PromotionPath> {
  return apiPost<PromotionPath>(`${entityPath('promotion-paths')}/${id}/version`, {});
}
