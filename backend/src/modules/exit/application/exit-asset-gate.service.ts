// ============================================================================
// modules/exit/application/exit-asset-gate.service.ts
// ASSET-001c — asset return gate before deposit settlement
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { AuditService } from '../../../shared/audit/audit.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { ASSET_REPOSITORY, AssetRepository } from '../../asset/domain/repositories/asset.repository';
import { EXIT_CASE_REPOSITORY, ExitCaseRepository } from '../domain/repositories/exit-case.repository';
import {
  ExitAssetsUnresolvedError,
  ExitCaseInvalidStatusError,
  ExitCaseNotFoundError,
  ExitReviewForbiddenError,
} from '../domain/errors/exit.errors';
import {
  CreateClaimFromAssetDto,
  ExitAssetReviewResponse,
  UpdateExitAssetReviewDto,
} from './dto/exit-asset.dto';
import { DepositLossClaimService } from './deposit-loss-claim.service';
import { LossClaimResponse } from './dto/loss-claim.dto';
import { DateProvider } from '../../../shared/time/date.provider';

const RESOLVED_STATUSES = new Set(['returned', 'damaged', 'lost', 'waived']);

@Injectable()
export class ExitAssetGateService {
  constructor(
    @Inject(EXIT_CASE_REPOSITORY) private readonly exitCases: ExitCaseRepository,
    @Inject(ASSET_REPOSITORY) private readonly assets: AssetRepository,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
    private readonly lossClaims: DepositLossClaimService,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
  ) {}

  async listAssets(actor: ActorContext, exitCaseId: string): Promise<ExitAssetReviewResponse[]> {
    const exitCase = await this.requireExitCase(actor, exitCaseId);
    await this.syncAssetReviews(exitCase.id, exitCase.employeeId, exitCase.companyId);
    return this.loadAssetReviews(exitCase.id, exitCase.companyId);
  }

  async updateAssetReview(
    actor: ActorContext,
    exitCaseId: string,
    assignmentId: string,
    dto: UpdateExitAssetReviewDto,
  ): Promise<ExitAssetReviewResponse[]> {
    const exitCase = await this.requireMutableExitCase(actor, exitCaseId);
    await this.assertAssetManage(actor);

    const review = await this.prisma.exitCaseAssetReview.findFirst({
      where: { exitCaseId, assignmentId },
    });
    if (!review) throw new ExitCaseInvalidStatusError('Asset assignment not found on exit case');

    const now = this.dates.now();
    await this.prisma.exitCaseAssetReview.update({
      where: { id: review.id },
      data: {
        status: dto.status,
        notes: dto.notes ?? review.notes,
        reviewedBy: actor.userId,
        reviewedAt: now,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'ExitCaseAssetReview',
      entityId: review.id,
      action: 'update',
      after: { status: dto.status, assignmentId },
    });

    return this.loadAssetReviews(exitCase.id, exitCase.companyId);
  }

  async createClaimFromAsset(
    actor: ActorContext,
    exitCaseId: string,
    assignmentId: string,
    dto: CreateClaimFromAssetDto,
  ): Promise<{ claim: LossClaimResponse; assets: ExitAssetReviewResponse[] }> {
    const exitCase = await this.requireMutableExitCase(actor, exitCaseId);
    const review = await this.prisma.exitCaseAssetReview.findFirst({
      where: { exitCaseId, assignmentId },
    });
    if (!review) throw new ExitCaseInvalidStatusError('Asset assignment not found on exit case');
    if (!['damaged', 'lost'].includes(review.status)) {
      throw new ExitCaseInvalidStatusError('Claims from assets require damaged or lost status');
    }

    const claim = await this.lossClaims.create(actor, exitCaseId, {
      amount: dto.amount,
      category: dto.category,
      description: dto.description,
      evidenceUrl: dto.evidenceUrl,
      assetId: review.assetId,
    });

    return {
      claim,
      assets: await this.loadAssetReviews(exitCase.id, exitCase.companyId),
    };
  }

  async assertAssetsResolved(exitCaseId: string, companyId: string): Promise<void> {
    const exitCase = await this.exitCases.findById(exitCaseId);
    if (!exitCase) return;
    await this.syncAssetReviews(exitCaseId, exitCase.employeeId, companyId);
    const reviews = await this.loadAssetReviews(exitCaseId, companyId);
    const unresolved = reviews.filter((r) => !RESOLVED_STATUSES.has(r.status));
    if (unresolved.length > 0) {
      throw new ExitAssetsUnresolvedError(unresolved.length);
    }
  }

  async hasUnresolvedAssets(exitCaseId: string, companyId: string): Promise<boolean> {
    return (await this.countUnresolvedAssets(exitCaseId, companyId)) > 0;
  }

  async countUnresolvedAssets(exitCaseId: string, companyId: string): Promise<number> {
    const exitCase = await this.exitCases.findById(exitCaseId);
    if (!exitCase) return 0;
    await this.syncAssetReviews(exitCaseId, exitCase.employeeId, companyId);
    const reviews = await this.loadAssetReviews(exitCaseId, companyId);
    return reviews.filter((r) => !RESOLVED_STATUSES.has(r.status)).length;
  }

  private async syncAssetReviews(
    exitCaseId: string,
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    const assignments = await this.assets.listEmployeeAssignments(employeeId, companyId);
    const active = assignments.filter((a) => !a.returnedAt);

    for (const assignment of active) {
      const existing = await this.prisma.exitCaseAssetReview.findFirst({
        where: { exitCaseId, assignmentId: assignment.id },
      });
      if (!existing) {
        await this.prisma.exitCaseAssetReview.create({
          data: {
            id: randomUUID(),
            exitCaseId,
            assignmentId: assignment.id,
            assetId: assignment.assetId,
            status: 'pending',
          },
        });
      }
    }
  }

  private async loadAssetReviews(
    exitCaseId: string,
    companyId: string,
  ): Promise<ExitAssetReviewResponse[]> {
    const reviews = await this.prisma.exitCaseAssetReview.findMany({
      where: { exitCaseId },
      orderBy: { createdAt: 'asc' },
    });

    const results: ExitAssetReviewResponse[] = [];
    for (const review of reviews) {
      const record = await this.assets.findRecordById(review.assetId);
      results.push({
        assignmentId: review.assignmentId,
        assetId: review.assetId,
        assetTag: record?.assetTag ?? null,
        assetName: record?.name ?? null,
        category: record?.category ?? null,
        status: review.status,
        notes: review.notes,
        reviewedBy: review.reviewedBy,
        reviewedAt: review.reviewedAt?.toISOString() ?? null,
      });
    }
    return results;
  }

  private async requireExitCase(actor: ActorContext, exitCaseId: string) {
    const exitCase = await this.exitCases.findById(exitCaseId);
    if (!exitCase) throw new ExitCaseNotFoundError(exitCaseId);
    await this.assertExitCaseAccess(actor, exitCase.companyId, exitCase.employeeId);
    return exitCase;
  }

  private async requireMutableExitCase(actor: ActorContext, exitCaseId: string) {
    const exitCase = await this.requireExitCase(actor, exitCaseId);
    if (['closed', 'cancelled', 'settled'].includes(exitCase.status)) {
      throw new ExitCaseInvalidStatusError('Exit case is not open for asset changes');
    }
    return exitCase;
  }

  private async assertExitCaseAccess(
    actor: ActorContext,
    companyId: string,
    employeeId: string,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === employeeId) return;
    await this.companyAccess.assertCompanyAccess(actor, companyId);
  }

  private async assertAssetManage(actor: ActorContext): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? null;
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new ExitReviewForbiddenError();
  }
}
