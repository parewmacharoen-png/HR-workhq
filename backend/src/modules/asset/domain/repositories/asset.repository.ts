// ============================================================================
// modules/asset/domain/repositories/asset.repository.ts
// ============================================================================

import { AssetDamageSeverity, AssetEventType, AssetStatus } from '@prisma/client';
import { Asset } from '../entities/asset.entity';

export const ASSET_REPOSITORY = Symbol('ASSET_REPOSITORY');

export interface AssetRecord {
  id: string;
  companyId: string;
  assetTag: string;
  name: string;
  category: string | null;
  status: AssetStatus;
  purchaseDate: Date | null;
  value: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssetAssignmentRecord {
  id: string;
  assetId: string;
  employeeId: string;
  assignedAt: Date;
  returnedAt: Date | null;
  conditionOut: string | null;
  conditionIn: string | null;
  employee?: {
    id: string;
    globalId: string;
    firstName: string;
    lastName: string;
  };
  asset?: {
    id: string;
    assetTag: string;
    name: string;
    category: string | null;
  };
}

export interface ActiveBorrowRow {
  assignmentId: string;
  assetId: string;
  assetTag: string;
  name: string;
  category: string | null;
  assignedAt: Date;
  conditionOut: string | null;
  employeeId: string;
  globalId: string;
  firstName: string;
  lastName: string;
}

export interface AssetEventRecord {
  id: string;
  assetId: string;
  eventType: AssetEventType;
  payload: unknown;
  actorUserId: string | null;
  occurredAt: Date;
}

export interface AssetDamageRecord {
  id: string;
  assetId: string;
  assignmentId: string | null;
  reportedBy: string | null;
  severity: AssetDamageSeverity;
  description: string;
  estimatedCost: number | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
}

export interface ListAssetsFilter {
  companyId: string;
  category?: string;
  status?: AssetStatus;
  search?: string;
}

export interface AssetRepository {
  findById(id: string): Promise<Asset | null>;
  findRecordById(id: string): Promise<AssetRecord | null>;
  existsTag(assetTag: string, excludeId?: string): Promise<boolean>;
  list(filter: ListAssetsFilter): Promise<AssetRecord[]>;
  save(asset: Asset, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;

  findActiveAssignment(assetId: string): Promise<AssetAssignmentRecord | null>;
  listAssignments(assetId: string): Promise<AssetAssignmentRecord[]>;
  listEmployeeAssignments(employeeId: string, companyId: string): Promise<AssetAssignmentRecord[]>;
  listActiveBorrows(companyId: string): Promise<ActiveBorrowRow[]>;
  createAssignment(input: {
    id: string;
    assetId: string;
    employeeId: string;
    conditionOut?: string | null;
  }, actorUserId: string): Promise<AssetAssignmentRecord>;
  closeAssignment(
    assignmentId: string,
    conditionIn: string | null,
    actorUserId: string,
  ): Promise<AssetAssignmentRecord>;

  appendEvent(input: {
    assetId: string;
    eventType: AssetEventType;
    payload?: unknown;
    actorUserId: string;
  }): Promise<AssetEventRecord>;
  listEvents(assetId: string): Promise<AssetEventRecord[]>;

  createDamageReport(input: {
    id: string;
    assetId: string;
    assignmentId?: string | null;
    reportedBy: string;
    severity: AssetDamageSeverity;
    description: string;
    estimatedCost?: number | null;
  }, actorUserId: string): Promise<AssetDamageRecord>;
  listDamageReports(assetId: string): Promise<AssetDamageRecord[]>;
  findDamageReport(id: string): Promise<AssetDamageRecord | null>;
  resolveDamageReport(id: string, actorUserId: string): Promise<AssetDamageRecord>;

  employeeAssignedToCompany(employeeId: string, companyId: string): Promise<boolean>;
}
