// ============================================================================
// modules/asset/infrastructure/persistence/asset.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { AssetCategory, AssetStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { Asset } from '../../domain/entities/asset.entity';
import {
  AssetAssignmentRecord,
  AssetDamageRecord,
  AssetEventRecord,
  AssetRecord,
  AssetRepository,
  ActiveBorrowRow,
  ListAssetsFilter,
} from '../../domain/repositories/asset.repository';

function toAsset(row: {
  id: string;
  companyId: string;
  assetTag: string;
  name: string;
  category: string | null;
  status: AssetStatus;
  purchaseDate: Date | null;
  value: unknown;
  deletedAt: Date | null;
}): Asset {
  return Asset.rehydrate({
    id: row.id,
    companyId: row.companyId,
    assetTag: row.assetTag,
    name: row.name,
    category: row.category,
    status: row.status,
    purchaseDate: row.purchaseDate,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : null,
    deletedAt: row.deletedAt,
  });
}

function toAssetRecord(row: {
  id: string;
  companyId: string;
  assetTag: string;
  name: string;
  category: string | null;
  status: AssetStatus;
  purchaseDate: Date | null;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}): AssetRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    assetTag: row.assetTag,
    name: row.name,
    category: row.category,
    status: row.status,
    purchaseDate: row.purchaseDate,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Asset | null> {
    const row = await this.prisma.asset.findFirst({ where: { id, deletedAt: null } });
    return row ? toAsset(row) : null;
  }

  async findRecordById(id: string): Promise<AssetRecord | null> {
    const row = await this.prisma.asset.findFirst({ where: { id, deletedAt: null } });
    return row ? toAssetRecord(row) : null;
  }

  async existsTag(assetTag: string, excludeId?: string): Promise<boolean> {
    const row = await this.prisma.asset.findFirst({
      where: {
        assetTag,
        deletedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    return !!row;
  }

  async list(filter: ListAssetsFilter): Promise<AssetRecord[]> {
    const where: {
      companyId: string;
      deletedAt: null;
      category?: AssetCategory;
      status?: AssetStatus;
      OR?: Array<Record<string, unknown>>;
    } = {
      companyId: filter.companyId,
      deletedAt: null,
    };

    if (filter.category) where.category = filter.category as AssetCategory;
    if (filter.status) where.status = filter.status;
    if (filter.search) {
      where.OR = [
        { assetTag: { contains: filter.search, mode: 'insensitive' } },
        { name: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.asset.findMany({
      where,
      orderBy: [{ category: 'asc' }, { assetTag: 'asc' }],
    });
    return rows.map(toAssetRecord);
  }

  async save(asset: Asset, actorUserId: string): Promise<void> {
    const p = asset.toPersistence();
    await this.prisma.asset.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        companyId: p.companyId,
        assetTag: p.assetTag,
        name: p.name,
        category: p.category as never,
        status: p.status,
        purchaseDate: p.purchaseDate,
        value: p.value,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        assetTag: p.assetTag,
        name: p.name,
        category: p.category as never,
        status: p.status,
        purchaseDate: p.purchaseDate,
        value: p.value,
        updatedBy: actorUserId,
      },
    });
  }

  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorUserId },
    });
  }

  async findActiveAssignment(assetId: string): Promise<AssetAssignmentRecord | null> {
    const row = await this.prisma.assetAssignment.findFirst({
      where: { assetId, returnedAt: null, deletedAt: null },
      include: {
        employee: { select: { id: true, globalId: true, firstName: true, lastName: true } },
      },
    });
    return row ? this.toAssignment(row) : null;
  }

  async listAssignments(assetId: string): Promise<AssetAssignmentRecord[]> {
    const rows = await this.prisma.assetAssignment.findMany({
      where: { assetId, deletedAt: null },
      include: {
        employee: { select: { id: true, globalId: true, firstName: true, lastName: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
    return rows.map((row) => this.toAssignment(row));
  }

  async listEmployeeAssignments(
    employeeId: string,
    companyId: string,
  ): Promise<AssetAssignmentRecord[]> {
    const rows = await this.prisma.assetAssignment.findMany({
      where: {
        employeeId,
        deletedAt: null,
        asset: { companyId, deletedAt: null },
      },
      include: {
        employee: { select: { id: true, globalId: true, firstName: true, lastName: true } },
        asset: { select: { id: true, assetTag: true, name: true, category: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
    return rows.map((row) => this.toAssignment(row));
  }

  async listActiveBorrows(companyId: string): Promise<ActiveBorrowRow[]> {
    const rows = await this.prisma.assetAssignment.findMany({
      where: {
        returnedAt: null,
        deletedAt: null,
        asset: { companyId, deletedAt: null, status: 'assigned' },
      },
      include: {
        employee: { select: { id: true, globalId: true, firstName: true, lastName: true } },
        asset: { select: { id: true, assetTag: true, name: true, category: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { assignedAt: 'desc' }],
    });
    return rows.map((row) => ({
      assignmentId: row.id,
      assetId: row.asset.id,
      assetTag: row.asset.assetTag,
      name: row.asset.name,
      category: row.asset.category,
      assignedAt: row.assignedAt,
      conditionOut: row.conditionOut,
      employeeId: row.employee.id,
      globalId: row.employee.globalId,
      firstName: row.employee.firstName,
      lastName: row.employee.lastName,
    }));
  }

  async createAssignment(
    input: { id: string; assetId: string; employeeId: string; conditionOut?: string | null },
    actorUserId: string,
  ): Promise<AssetAssignmentRecord> {
    const row = await this.prisma.assetAssignment.create({
      data: {
        id: input.id,
        assetId: input.assetId,
        employeeId: input.employeeId,
        conditionOut: input.conditionOut ?? null,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      include: {
        employee: { select: { id: true, globalId: true, firstName: true, lastName: true } },
      },
    });
    return this.toAssignment(row);
  }

  async closeAssignment(
    assignmentId: string,
    conditionIn: string | null,
    actorUserId: string,
  ): Promise<AssetAssignmentRecord> {
    const row = await this.prisma.assetAssignment.update({
      where: { id: assignmentId },
      data: {
        returnedAt: new Date(),
        conditionIn,
        updatedBy: actorUserId,
      },
      include: {
        employee: { select: { id: true, globalId: true, firstName: true, lastName: true } },
      },
    });
    return this.toAssignment(row);
  }

  async appendEvent(input: {
    assetId: string;
    eventType: AssetEventRecord['eventType'];
    payload?: unknown;
    actorUserId: string;
  }): Promise<AssetEventRecord> {
    const row = await this.prisma.assetEvent.create({
      data: {
        assetId: input.assetId,
        eventType: input.eventType,
        payload: input.payload as object | undefined,
        actorUserId: input.actorUserId,
      },
    });
    return {
      id: row.id,
      assetId: row.assetId,
      eventType: row.eventType,
      payload: row.payload,
      actorUserId: row.actorUserId,
      occurredAt: row.occurredAt,
    };
  }

  async listEvents(assetId: string): Promise<AssetEventRecord[]> {
    const rows = await this.prisma.assetEvent.findMany({
      where: { assetId },
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      assetId: row.assetId,
      eventType: row.eventType,
      payload: row.payload,
      actorUserId: row.actorUserId,
      occurredAt: row.occurredAt,
    }));
  }

  async createDamageReport(
    input: {
      id: string;
      assetId: string;
      assignmentId?: string | null;
      reportedBy: string;
      severity: AssetDamageRecord['severity'];
      description: string;
      estimatedCost?: number | null;
    },
    actorUserId: string,
  ): Promise<AssetDamageRecord> {
    const row = await this.prisma.assetDamageReport.create({
      data: {
        id: input.id,
        assetId: input.assetId,
        assignmentId: input.assignmentId ?? null,
        reportedBy: input.reportedBy,
        severity: input.severity,
        description: input.description.trim(),
        estimatedCost: input.estimatedCost ?? null,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    return this.toDamage(row);
  }

  async listDamageReports(assetId: string): Promise<AssetDamageRecord[]> {
    const rows = await this.prisma.assetDamageReport.findMany({
      where: { assetId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toDamage(row));
  }

  async findDamageReport(id: string): Promise<AssetDamageRecord | null> {
    const row = await this.prisma.assetDamageReport.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.toDamage(row) : null;
  }

  async resolveDamageReport(id: string, actorUserId: string): Promise<AssetDamageRecord> {
    const row = await this.prisma.assetDamageReport.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    return this.toDamage(row);
  }

  async employeeAssignedToCompany(employeeId: string, companyId: string): Promise<boolean> {
    const row = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        companyId,
        effectiveTo: null,
        deletedAt: null,
      },
    });
    return !!row;
  }

  private toAssignment(row: {
    id: string;
    assetId: string;
    employeeId: string;
    assignedAt: Date;
    returnedAt: Date | null;
    conditionOut: string | null;
    conditionIn: string | null;
    employee?: { id: string; globalId: string; firstName: string; lastName: string };
    asset?: { id: string; assetTag: string; name: string; category: string | null };
  }): AssetAssignmentRecord {
    return {
      id: row.id,
      assetId: row.assetId,
      employeeId: row.employeeId,
      assignedAt: row.assignedAt,
      returnedAt: row.returnedAt,
      conditionOut: row.conditionOut,
      conditionIn: row.conditionIn,
      employee: row.employee,
      asset: row.asset,
    };
  }

  private toDamage(row: {
    id: string;
    assetId: string;
    assignmentId: string | null;
    reportedBy: string | null;
    severity: AssetDamageRecord['severity'];
    description: string;
    estimatedCost: unknown;
    resolvedAt: Date | null;
    resolvedBy: string | null;
    createdAt: Date;
  }): AssetDamageRecord {
    return {
      id: row.id,
      assetId: row.assetId,
      assignmentId: row.assignmentId,
      reportedBy: row.reportedBy,
      severity: row.severity,
      description: row.description,
      estimatedCost: row.estimatedCost !== null && row.estimatedCost !== undefined
        ? Number(row.estimatedCost)
        : null,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      createdAt: row.createdAt,
    };
  }
}
