// ============================================================================
// modules/asset/application/asset.service.ts
// Company-scoped asset registry with assign/return, damage tracking, and history.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { AssetStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { Asset } from '../domain/entities/asset.entity';
import {
  AssetDamageReportNotFoundError,
  AssetNotAssignedError,
  AssetNotFoundError,
  AssetTagConflictError,
  EmployeeNotInCompanyError,
} from '../domain/errors/asset.errors';
import {
  ASSET_REPOSITORY,
  AssetAssignmentRecord,
  AssetRecord,
  AssetRepository,
} from '../domain/repositories/asset.repository';
import {
  AssignAssetDto,
  BorrowAssetDto,
  CreateAssetDto,
  ListAssetsQuery,
  ReportDamageDto,
  ReturnAssetDto,
  UpdateAssetDto,
} from './dto/asset.dto';

@Injectable()
export class AssetService {
  constructor(
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    private readonly companyAccess: CompanyAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: ActorContext,
    companyId: string,
    dto: CreateAssetDto,
  ): Promise<AssetRecord> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);

    if (await this.assets.existsTag(dto.assetTag.trim())) {
      throw new AssetTagConflictError(dto.assetTag.trim());
    }

    const asset = Asset.create({
      id: randomUUID(),
      companyId,
      assetTag: dto.assetTag,
      name: dto.name,
      category: dto.category,
      purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
      value: dto.value ?? null,
    });

    await this.assets.save(asset, actor.userId);
    await this.assets.appendEvent({
      assetId: asset.id,
      eventType: 'created',
      payload: { assetTag: asset.toPersistence().assetTag, category: dto.category },
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'Asset',
      entityId: asset.id,
      action: 'create',
      after: asset.toPersistence(),
    });

    return (await this.assets.findRecordById(asset.id))!;
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateAssetDto,
  ): Promise<AssetRecord> {
    const asset = await this.requireAsset(actor, id);
    const before = asset.toPersistence();

    if (dto.assetTag && dto.assetTag.trim() !== before.assetTag) {
      if (await this.assets.existsTag(dto.assetTag.trim(), id)) {
        throw new AssetTagConflictError(dto.assetTag.trim());
      }
    }

    asset.update({
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.purchaseDate !== undefined
        ? { purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null }
        : {}),
      ...(dto.value !== undefined ? { value: dto.value } : {}),
    });

    if (dto.status && dto.status !== before.status) {
      if (dto.status === 'retired') asset.retire();
      else asset.setStatus(dto.status);
    }

    await this.assets.save(asset, actor.userId);
    await this.assets.appendEvent({
      assetId: asset.id,
      eventType: dto.status && dto.status !== before.status ? 'status_changed' : 'updated',
      payload: { before, after: asset.toPersistence() },
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'Asset',
      entityId: asset.id,
      action: 'update',
      before,
      after: asset.toPersistence(),
    });

    return (await this.assets.findRecordById(asset.id))!;
  }

  async get(actor: ActorContext, id: string) {
    const record = await this.requireRecord(actor, id);
    const [activeAssignment, damageReports] = await Promise.all([
      this.assets.findActiveAssignment(id),
      this.assets.listDamageReports(id),
    ]);
    return { ...record, activeAssignment, openDamageCount: damageReports.filter((d) => !d.resolvedAt).length };
  }

  async list(actor: ActorContext, companyId: string, query: ListAssetsQuery) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const records = await this.assets.list({
      companyId,
      category: query.category,
      status: query.status,
      search: query.search,
    });
    const withHolders = await Promise.all(records.map(async (record) => {
      const activeAssignment = await this.assets.findActiveAssignment(record.id);
      return { ...record, activeAssignment };
    }));
    return withHolders;
  }

  async borrowSummary(actor: ActorContext, companyId: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.assets.listActiveBorrows(companyId);
    const byEmployeeMap = new Map<string, {
      employeeId: string;
      globalId: string;
      firstName: string;
      lastName: string;
      items: Array<{
        assignmentId: string;
        assetId: string;
        assetTag: string;
        name: string;
        category: string | null;
        assignedAt: Date;
        notes: string | null;
      }>;
    }>();

    for (const row of rows) {
      const existing = byEmployeeMap.get(row.employeeId);
      const item = {
        assignmentId: row.assignmentId,
        assetId: row.assetId,
        assetTag: row.assetTag,
        name: row.name,
        category: row.category,
        assignedAt: row.assignedAt,
        notes: row.conditionOut,
      };
      if (existing) {
        existing.items.push(item);
      } else {
        byEmployeeMap.set(row.employeeId, {
          employeeId: row.employeeId,
          globalId: row.globalId,
          firstName: row.firstName,
          lastName: row.lastName,
          items: [item],
        });
      }
    }

    const byEmployee = [...byEmployeeMap.values()].sort((a, b) =>
      `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`, 'th'),
    );

    return {
      companyId,
      totalActive: rows.length,
      byEmployee,
    };
  }

  async borrowToEmployee(actor: ActorContext, companyId: string, dto: BorrowAssetDto) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);

    if (!(await this.assets.employeeAssignedToCompany(dto.employeeId, companyId))) {
      throw new EmployeeNotInCompanyError(dto.employeeId, companyId);
    }

    let assetTag = dto.assetTag?.trim() || `BR-${Date.now().toString(36).toUpperCase()}`;
    if (await this.assets.existsTag(assetTag)) {
      assetTag = `BR-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    }

    const asset = Asset.create({
      id: randomUUID(),
      companyId,
      assetTag,
      name: dto.name.trim(),
      category: dto.category ?? 'equipment',
      purchaseDate: null,
      value: null,
    });

    await this.assets.save(asset, actor.userId);
    await this.assets.appendEvent({
      assetId: asset.id,
      eventType: 'created',
      payload: { assetTag, category: dto.category ?? 'equipment', borrow: true },
      actorUserId: actor.userId,
    });

    asset.markAssigned();
    const assignment = await this.assets.createAssignment(
      {
        id: randomUUID(),
        assetId: asset.id,
        employeeId: dto.employeeId,
        conditionOut: dto.notes?.trim() || null,
      },
      actor.userId,
    );
    await this.assets.save(asset, actor.userId);
    await this.assets.appendEvent({
      assetId: asset.id,
      eventType: 'assigned',
      payload: { employeeId: dto.employeeId, assignmentId: assignment.id, borrow: true },
      actorUserId: actor.userId,
    });
    await this.audit.record(actor, {
      entityType: 'Asset',
      entityId: asset.id,
      action: 'borrow',
      after: { assignmentId: assignment.id, employeeId: dto.employeeId, name: dto.name.trim() },
    });

    return {
      asset: (await this.assets.findRecordById(asset.id))!,
      assignment,
    };
  }

  async remove(actor: ActorContext, id: string): Promise<void> {
    const asset = await this.requireAsset(actor, id);
    const active = await this.assets.findActiveAssignment(id);
    if (active) {
      asset.markReturned();
      await this.assets.closeAssignment(active.id, null, actor.userId);
    }
    asset.retire();
    await this.assets.save(asset, actor.userId);
    await this.assets.softDelete(id, actor.userId);
    await this.assets.appendEvent({
      assetId: id,
      eventType: 'retired',
      actorUserId: actor.userId,
    });
    await this.audit.record(actor, {
      entityType: 'Asset',
      entityId: id,
      action: 'delete',
      before: asset.toPersistence(),
    });
  }

  async assign(actor: ActorContext, id: string, dto: AssignAssetDto) {
    const asset = await this.requireAsset(actor, id);
    const before = asset.toPersistence();

    if (!(await this.assets.employeeAssignedToCompany(dto.employeeId, asset.companyId))) {
      throw new EmployeeNotInCompanyError(dto.employeeId, asset.companyId);
    }

    asset.markAssigned();
    const assignment = await this.assets.createAssignment(
      {
        id: randomUUID(),
        assetId: id,
        employeeId: dto.employeeId,
        conditionOut: dto.conditionOut ?? null,
      },
      actor.userId,
    );

    await this.assets.save(asset, actor.userId);
    await this.assets.appendEvent({
      assetId: id,
      eventType: 'assigned',
      payload: { employeeId: dto.employeeId, assignmentId: assignment.id },
      actorUserId: actor.userId,
    });
    await this.audit.record(actor, {
      entityType: 'Asset',
      entityId: id,
      action: 'assign',
      before,
      after: { assignmentId: assignment.id, employeeId: dto.employeeId },
    });

    return assignment;
  }

  async returnAsset(actor: ActorContext, id: string, dto: ReturnAssetDto) {
    const asset = await this.requireAsset(actor, id);
    const active = await this.assets.findActiveAssignment(id);
    if (!active) throw new AssetNotAssignedError(id);

    asset.markReturned();
    const assignment = await this.assets.closeAssignment(
      active.id,
      dto.conditionIn ?? null,
      actor.userId,
    );

    await this.assets.save(asset, actor.userId);
    await this.assets.appendEvent({
      assetId: id,
      eventType: 'returned',
      payload: { assignmentId: assignment.id, conditionIn: dto.conditionIn ?? null },
      actorUserId: actor.userId,
    });
    await this.audit.record(actor, {
      entityType: 'Asset',
      entityId: id,
      action: 'return',
      after: assignment,
    });

    return assignment;
  }

  async reportDamage(actor: ActorContext, id: string, dto: ReportDamageDto) {
    const record = await this.requireRecord(actor, id);
    const active = await this.assets.findActiveAssignment(id);

    const report = await this.assets.createDamageReport(
      {
        id: randomUUID(),
        assetId: id,
        assignmentId: dto.assignmentId ?? active?.id ?? null,
        reportedBy: actor.userId,
        severity: dto.severity,
        description: dto.description,
        estimatedCost: dto.estimatedCost ?? null,
      },
      actor.userId,
    );

    await this.assets.appendEvent({
      assetId: id,
      eventType: 'damage_reported',
      payload: { reportId: report.id, severity: dto.severity },
      actorUserId: actor.userId,
    });

    if (record.status !== 'maintenance' && record.status !== 'retired') {
      const asset = await this.requireAsset(actor, id);
      asset.setStatus('maintenance');
      await this.assets.save(asset, actor.userId);
    }

    await this.audit.record(actor, {
      entityType: 'AssetDamageReport',
      entityId: report.id,
      action: 'create',
      after: report,
    });

    return report;
  }

  async resolveDamage(actor: ActorContext, reportId: string) {
    const report = await this.assets.findDamageReport(reportId);
    if (!report) throw new AssetDamageReportNotFoundError(reportId);

    await this.requireRecord(actor, report.assetId);
    const resolved = await this.assets.resolveDamageReport(reportId, actor.userId);

    await this.assets.appendEvent({
      assetId: report.assetId,
      eventType: 'damage_resolved',
      payload: { reportId },
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'AssetDamageReport',
      entityId: reportId,
      action: 'resolve',
      before: report,
      after: resolved,
    });

    return resolved;
  }

  async listAssignments(actor: ActorContext, id: string): Promise<AssetAssignmentRecord[]> {
    await this.requireRecord(actor, id);
    return this.assets.listAssignments(id);
  }

  async listDamageReports(actor: ActorContext, id: string) {
    await this.requireRecord(actor, id);
    return this.assets.listDamageReports(id);
  }

  async getHistory(actor: ActorContext, id: string) {
    await this.requireRecord(actor, id);
    const [events, assignments, damageReports] = await Promise.all([
      this.assets.listEvents(id),
      this.assets.listAssignments(id),
      this.assets.listDamageReports(id),
    ]);
    return { events, assignments, damageReports };
  }

  async listEmployeeAssets(actor: ActorContext, employeeId: string, companyId?: string) {
    const resolvedCompanyId = companyId
      ?? actor.companyId
      ?? await this.companyAccess.requireCompanyId(actor, null);

    await this.companyAccess.assertCompanyAccess(actor, resolvedCompanyId);

    const assignments = await this.assets.listEmployeeAssignments(employeeId, resolvedCompanyId);
    const active = assignments.filter((a) => !a.returnedAt);
    return { employeeId, companyId: resolvedCompanyId, active, history: assignments };
  }

  private async requireAsset(actor: ActorContext, id: string): Promise<Asset> {
    const asset = await this.assets.findById(id);
    if (!asset) throw new AssetNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, asset.companyId);
    return asset;
  }

  private async requireRecord(actor: ActorContext, id: string): Promise<AssetRecord> {
    const record = await this.assets.findRecordById(id);
    if (!record) throw new AssetNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, record.companyId);
    return record;
  }
}
