// ============================================================================
// modules/salary-review/application/promotion-review.service.ts
// SAL-001
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { CompensationReviewTelegramNotifier } from '../../telegram/application/compensation-review.notifier';
import {
  CompensationReviewInvalidStatusError,
  PromotionReviewNotFoundError,
} from '../domain/errors/salary-review.errors';
import { CompensationReviewAccessService } from './compensation-review-access.service';
import { CompensationApplyService } from './compensation-apply.service';
import { PromotionPathValidationService } from '../../position-framework/application/promotion-path-validation.service';
import {
  CreatePromotionReviewDto,
  PromotionReviewResponse,
  RejectCompensationReviewDto,
  UpdatePromotionReviewDto,
} from './dto/salary-review.dto';
import { mergeReasonNote } from './compensation-reason.util';

@Injectable()
export class PromotionReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CompensationReviewAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly applyService: CompensationApplyService,
    private readonly pathValidation: PromotionPathValidationService,
    private readonly audit: AuditService,
    private readonly notifier: CompensationReviewTelegramNotifier,
  ) {}

  async create(actor: ActorContext, dto: CreatePromotionReviewDto): Promise<PromotionReviewResponse> {
    await this.access.assertCanPropose(actor, dto.companyId);
    await this.employeeAccess.assertEmployeeInCompany(dto.employeeId, dto.companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, deletedAt: null },
      select: { position: true },
    });

    const review = await this.prisma.promotionReview.create({
      data: {
        employeeId: dto.employeeId,
        companyId: dto.companyId,
        currentPosition: employee?.position ?? null,
        proposedPosition: dto.proposedPosition,
        reason: mergeReasonNote(dto.reason, dto.note),
        effectiveDate: new Date(dto.effectiveDate),
        status: 'draft',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'promotion_review',
      entityId: review.id,
      action: 'draft_created',
    });

    return this.toResponse(review);
  }

  async update(actor: ActorContext, id: string, dto: UpdatePromotionReviewDto): Promise<PromotionReviewResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanEdit(actor, existing.companyId);
    if (existing.status !== 'draft') {
      throw new CompensationReviewInvalidStatusError('Only draft promotion reviews can be edited');
    }

    const mergedReason = dto.reason !== undefined || dto.note !== undefined
      ? mergeReasonNote(dto.reason ?? existing.reason, dto.note)
      : existing.reason;

    const review = await this.prisma.promotionReview.update({
      where: { id },
      data: {
        proposedPosition: dto.proposedPosition ?? existing.proposedPosition,
        reason: mergedReason,
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : existing.effectiveDate,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'promotion_review',
      entityId: id,
      action: 'edited',
    });

    return this.toResponse(review);
  }

  async submit(actor: ActorContext, id: string): Promise<PromotionReviewResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanPropose(actor, existing.companyId);
    if (existing.status !== 'draft') {
      throw new CompensationReviewInvalidStatusError('Only draft promotion reviews can be submitted');
    }

    const review = await this.prisma.promotionReview.update({
      where: { id },
      data: {
        status: 'pending_approval',
        requestedBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'promotion_review',
      entityId: id,
      action: 'submitted',
    });

    const response = await this.toResponse(review);
    const validation = await this.resolvePathValidation(actor, review);
    if (validation) response.pathValidation = validation;
    await this.notifier.notifyPromotionSubmitted(response, validation);
    return response;
  }

  async getPathValidation(actor: ActorContext, id: string) {
    const review = await this.getOrThrow(id);
    await this.access.assertCanViewDashboard(actor, review.companyId);
    return this.resolvePathValidation(actor, review);
  }

  private async resolvePathValidation(
    actor: ActorContext,
    review: { employeeId: string; companyId: string; proposedPosition: string },
  ) {
    const positions = await this.prisma.positionDefinition.findMany({
      where: { companyId: review.companyId, deletedAt: null, status: 'active' },
    });
    const target = positions.find(
      (p) => p.name === review.proposedPosition || p.code === review.proposedPosition,
    );
    if (!target) return null;
    const result = await this.pathValidation.validate(actor, {
      employeeId: review.employeeId,
      companyId: review.companyId,
      targetPositionDefinitionId: target.id,
    });
    return {
      valid: result.valid,
      warning: result.warning,
      suggestedPathCount: result.suggestedPaths.length,
      careerPath: result.careerPath,
      nextPositions: result.nextPositions,
      currentPosition: result.currentPosition,
      suggestedPaths: result.suggestedPaths,
    };
  }

  async approve(actor: ActorContext, id: string): Promise<PromotionReviewResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanApprove(actor, existing.companyId);
    if (existing.status !== 'pending_approval') {
      throw new CompensationReviewInvalidStatusError('Only pending promotion reviews can be approved');
    }

    const review = await this.prisma.promotionReview.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'promotion_review',
      entityId: id,
      action: 'approved',
    });

    const response = await this.toResponse(review);
    await this.notifier.notifyPromotionApproved(response);

    const today = new Date().toISOString().slice(0, 10);
    if (review.effectiveDate.toISOString().slice(0, 10) <= today) {
      await this.applyService.applyPromotionReview(id, actor);
      return this.toResponse(await this.getOrThrow(id));
    }

    return response;
  }

  async reject(actor: ActorContext, id: string, dto: RejectCompensationReviewDto): Promise<PromotionReviewResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanApprove(actor, existing.companyId);
    if (existing.status !== 'pending_approval') {
      throw new CompensationReviewInvalidStatusError('Only pending promotion reviews can be rejected');
    }

    const review = await this.prisma.promotionReview.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectedBy: actor.userId,
        rejectedAt: new Date(),
        reason: dto.reason ?? existing.reason,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'promotion_review',
      entityId: id,
      action: 'rejected',
    });

    const response = await this.toResponse(review);
    await this.notifier.notifyPromotionRejected(response);
    return response;
  }

  async apply(actor: ActorContext, id: string): Promise<PromotionReviewResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanEdit(actor, existing.companyId);
    await this.applyService.applyPromotionReview(id, actor);
    const response = await this.toResponse(await this.getOrThrow(id));
    await this.notifier.notifyPromotionApplied(response);
    return response;
  }

  async get(actor: ActorContext, id: string): Promise<PromotionReviewResponse> {
    const review = await this.getOrThrow(id);
    await this.access.assertCanViewDashboard(actor, review.companyId);
    return this.toResponse(review);
  }

  async list(actor: ActorContext, companyId: string, status?: string): Promise<PromotionReviewResponse[]> {
    await this.access.assertCanViewDashboard(actor, companyId);
    const rows = await this.prisma.promotionReview.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'desc' }],
    });
    return Promise.all(rows.map((row) => this.toResponse(row)));
  }

  async listForEmployee(employeeId: string, companyId?: string) {
    return this.prisma.promotionReview.findMany({
      where: {
        employeeId,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getOrThrow(id: string) {
    const review = await this.prisma.promotionReview.findFirst({
      where: { id, deletedAt: null },
    });
    if (!review) throw new PromotionReviewNotFoundError(id);
    return review;
  }

  async toResponse(review: {
    id: string;
    employeeId: string;
    companyId: string;
    currentPosition: string | null;
    proposedPosition: string;
    reason: string | null;
    effectiveDate: Date;
    status: PromotionReviewResponse['status'];
    requestedBy: string | null;
    approvedBy: string | null;
    rejectedBy: string | null;
    rejectedAt: Date | null;
    appliedAt: Date | null;
    createdAt: Date;
  }): Promise<PromotionReviewResponse> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: review.employeeId, deletedAt: null },
      select: { globalId: true, firstName: true, lastName: true },
    });

    return {
      id: review.id,
      employeeId: review.employeeId,
      companyId: review.companyId,
      employeeCode: employee?.globalId ?? '',
      employeeName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : '',
      currentPosition: review.currentPosition,
      proposedPosition: review.proposedPosition,
      reason: review.reason,
      effectiveDate: review.effectiveDate.toISOString().slice(0, 10),
      status: review.status,
      requestedBy: review.requestedBy,
      approvedBy: review.approvedBy,
      rejectedBy: review.rejectedBy,
      rejectedAt: review.rejectedAt?.toISOString() ?? null,
      appliedAt: review.appliedAt?.toISOString() ?? null,
      createdAt: review.createdAt.toISOString(),
    };
  }
}
