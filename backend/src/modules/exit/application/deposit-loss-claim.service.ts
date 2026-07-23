// ============================================================================
// modules/exit/application/deposit-loss-claim.service.ts
// PAY-004c — loss claims against deposit
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { AuditService } from '../../../shared/audit/audit.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { EXIT_CASE_REPOSITORY, ExitCaseRepository } from '../domain/repositories/exit-case.repository';
import {
  ExitCaseInvalidStatusError,
  ExitCaseNotFoundError,
  ExitClaimNotFoundError,
  ExitReviewForbiddenError,
} from '../domain/errors/exit.errors';
import {
  CreateLossClaimDto,
  LossClaimResponse,
  UpdateLossClaimDto,
} from './dto/loss-claim.dto';
import { DateProvider } from '../../../shared/time/date.provider';

@Injectable()
export class DepositLossClaimService {
  constructor(
    @Inject(EXIT_CASE_REPOSITORY) private readonly exitCases: ExitCaseRepository,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
    private readonly companyAccess: CompanyAccessService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
  ) {}

  async list(actor: ActorContext, exitCaseId: string): Promise<LossClaimResponse[]> {
    const exitCase = await this.requireMutableExitCase(actor, exitCaseId);
    const rows = await this.prisma.depositLossClaim.findMany({
      where: { exitCaseId: exitCase.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async create(
    actor: ActorContext,
    exitCaseId: string,
    dto: CreateLossClaimDto,
  ): Promise<LossClaimResponse> {
    const exitCase = await this.requireMutableExitCase(actor, exitCaseId);
    await this.assertClaimCreate(actor, exitCase.toPersistence().departmentRoute);

    const id = randomUUID();
    const row = await this.prisma.depositLossClaim.create({
      data: {
        id,
        exitCaseId: exitCase.id,
        employeeId: exitCase.employeeId,
        companyId: exitCase.companyId,
        amount: new Prisma.Decimal(dto.amount),
        category: dto.category,
        description: dto.description,
        evidenceUrl: dto.evidenceUrl ?? null,
        assetId: dto.assetId ?? null,
        status: 'pending',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'DepositLossClaim',
      entityId: id,
      action: 'create',
      after: row,
    });
    return this.toResponse(row);
  }

  async update(
    actor: ActorContext,
    exitCaseId: string,
    claimId: string,
    dto: UpdateLossClaimDto,
  ): Promise<LossClaimResponse> {
    const exitCase = await this.requireMutableExitCase(actor, exitCaseId);
    const existing = await this.requireClaim(exitCaseId, claimId);
    if (existing.status === 'approved') {
      throw new ExitCaseInvalidStatusError('Approved claims cannot be edited');
    }

    await this.assertClaimCreate(actor, exitCase.toPersistence().departmentRoute);

    const row = await this.prisma.depositLossClaim.update({
      where: { id: claimId },
      data: {
        ...(dto.amount !== undefined ? { amount: new Prisma.Decimal(dto.amount) } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.evidenceUrl !== undefined ? { evidenceUrl: dto.evidenceUrl } : {}),
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'DepositLossClaim',
      entityId: claimId,
      action: 'update',
      before: existing,
      after: row,
    });
    return this.toResponse(row);
  }

  async approve(
    actor: ActorContext,
    exitCaseId: string,
    claimId: string,
  ): Promise<LossClaimResponse> {
    const exitCase = await this.requireMutableExitCase(actor, exitCaseId);
    await this.assertOwner(actor);
    const existing = await this.requireClaim(exitCaseId, claimId);

    const now = this.dates.now();
    const row = await this.prisma.depositLossClaim.update({
      where: { id: claimId },
      data: {
        status: 'approved',
        authorizedBy: actor.userId,
        approvedAt: now,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'DepositLossClaim',
      entityId: claimId,
      action: 'approve',
      before: existing,
      after: row,
    });
    return this.toResponse(row);
  }

  async remove(actor: ActorContext, exitCaseId: string, claimId: string): Promise<void> {
    const exitCase = await this.requireMutableExitCase(actor, exitCaseId);
    await this.assertClaimCreate(actor, exitCase.toPersistence().departmentRoute);
    const existing = await this.requireClaim(exitCaseId, claimId);
    if (existing.status === 'approved') {
      throw new ExitCaseInvalidStatusError('Approved claims cannot be deleted');
    }

    await this.prisma.depositLossClaim.update({
      where: { id: claimId },
      data: { deletedAt: this.dates.now(), deletedBy: actor.userId, updatedBy: actor.userId },
    });

    await this.audit.record(actor, {
      entityType: 'DepositLossClaim',
      entityId: claimId,
      action: 'delete',
      before: existing,
    });
  }

  private async requireMutableExitCase(actor: ActorContext, exitCaseId: string) {
    const exitCase = await this.exitCases.findById(exitCaseId);
    if (!exitCase) throw new ExitCaseNotFoundError(exitCaseId);
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId !== exitCase.employeeId) {
      await this.companyAccess.assertCompanyAccess(actor, exitCase.companyId);
    }
    const status = exitCase.status;
    if (['closed', 'cancelled', 'settled'].includes(status)) {
      throw new ExitCaseInvalidStatusError('Exit case is not open for claim changes');
    }
    return exitCase;
  }

  private async requireClaim(exitCaseId: string, claimId: string) {
    const row = await this.prisma.depositLossClaim.findFirst({
      where: { id: claimId, exitCaseId, deletedAt: null },
    });
    if (!row) throw new ExitClaimNotFoundError(claimId);
    return row;
  }

  private async assertClaimCreate(actor: ActorContext, departmentRoute: string): Promise<void> {
    const role = await this.actorBusinessRole(actor.userId);
    if (role === 'owner') return;
    if (departmentRoute === 'marketing') {
      if (role === 'big_leader') return;
    } else if (role === 'secretary') return;
    throw new ExitReviewForbiddenError();
  }

  private async assertOwner(actor: ActorContext): Promise<void> {
    const role = await this.actorBusinessRole(actor.userId);
    if (role !== 'owner') throw new ExitReviewForbiddenError();
  }

  private async actorBusinessRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }

  private toResponse(row: {
    id: string;
    exitCaseId: string;
    employeeId: string;
    companyId: string;
    amount: Prisma.Decimal;
    category: string;
    description: string;
    evidenceUrl: string | null;
    assetId: string | null;
    authorizedBy: string | null;
    approvedAt: Date | null;
    status: string;
    createdBy: string | null;
    createdAt: Date;
  }): LossClaimResponse {
    return {
      id: row.id,
      exitCaseId: row.exitCaseId,
      employeeId: row.employeeId,
      companyId: row.companyId,
      amount: Number(row.amount),
      category: row.category,
      description: row.description,
      evidenceUrl: row.evidenceUrl,
      assetId: row.assetId,
      status: row.status,
      approvedByOwner: row.authorizedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
