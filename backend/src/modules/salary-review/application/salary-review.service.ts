// ============================================================================
// modules/salary-review/application/salary-review.service.ts
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
  SalaryReviewNotFoundError,
} from '../domain/errors/salary-review.errors';
import { CompensationReviewAccessService } from './compensation-review-access.service';
import {
  computeIncrease,
  CompensationApplyService,
  decimal,
} from './compensation-apply.service';
import {
  CreateSalaryReviewDto,
  RejectCompensationReviewDto,
  SalaryReviewResponse,
  UpdateSalaryReviewDto,
} from './dto/salary-review.dto';
import { mergeReasonNote } from './compensation-reason.util';
import { DateProvider } from '../../../shared/time/date.provider';

@Injectable()
export class SalaryReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CompensationReviewAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly applyService: CompensationApplyService,
    private readonly audit: AuditService,
    private readonly notifier: CompensationReviewTelegramNotifier,
    private readonly dates: DateProvider,
  ) {}

  async create(actor: ActorContext, dto: CreateSalaryReviewDto): Promise<SalaryReviewResponse> {
    await this.access.assertCanPropose(actor, dto.companyId);
    await this.employeeAccess.assertEmployeeInCompany(dto.employeeId, dto.companyId);

    const currentSalary = await this.getCurrentSalary(dto.employeeId, dto.companyId);
    const { increaseAmount, increasePercent } = computeIncrease(currentSalary, dto.proposedSalary);

    let effectiveDate = new Date(dto.effectiveDate);
    if (currentSalary <= 0) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, deletedAt: null },
        select: { hireDate: true },
      });
      if (employee?.hireDate) {
        effectiveDate = employee.hireDate;
      }
    }

    const review = await this.prisma.salaryReview.create({
      data: {
        employeeId: dto.employeeId,
        companyId: dto.companyId,
        currentSalary: decimal(currentSalary),
        proposedSalary: decimal(dto.proposedSalary),
        increaseAmount: decimal(increaseAmount),
        increasePercent: decimal(increasePercent),
        reason: mergeReasonNote(dto.reason, dto.note),
        effectiveDate,
        status: 'draft',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'salary_review',
      entityId: review.id,
      action: 'draft_created',
    });

    return this.toResponse(review);
  }

  async update(actor: ActorContext, id: string, dto: UpdateSalaryReviewDto): Promise<SalaryReviewResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanEdit(actor, existing.companyId);
    if (existing.status !== 'draft') {
      throw new CompensationReviewInvalidStatusError('Only draft salary reviews can be edited');
    }

    const proposedSalary = dto.proposedSalary ?? existing.proposedSalary;
    const currentSalary = Number(existing.currentSalary);
    const { increaseAmount, increasePercent } = computeIncrease(currentSalary, Number(proposedSalary));

    const mergedReason = dto.reason !== undefined || dto.note !== undefined
      ? mergeReasonNote(dto.reason ?? existing.reason, dto.note)
      : existing.reason;

    const review = await this.prisma.salaryReview.update({
      where: { id },
      data: {
        proposedSalary: decimal(Number(proposedSalary)),
        increaseAmount: decimal(increaseAmount),
        increasePercent: decimal(increasePercent),
        reason: mergedReason,
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : existing.effectiveDate,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'salary_review',
      entityId: id,
      action: 'edited',
    });

    return this.toResponse(review);
  }

  async submit(actor: ActorContext, id: string): Promise<SalaryReviewResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanPropose(actor, existing.companyId);
    if (existing.status !== 'draft') {
      throw new CompensationReviewInvalidStatusError('Only draft salary reviews can be submitted');
    }

    const currentSalary = Number(existing.currentSalary);
    if (currentSalary <= 0) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: existing.employeeId, deletedAt: null },
        select: { hireDate: true },
      });

      const review = await this.prisma.salaryReview.update({
        where: { id },
        data: {
          ...(employee?.hireDate ? { effectiveDate: employee.hireDate } : {}),
          status: 'approved',
          requestedBy: actor.userId,
          approvedBy: actor.userId,
          updatedBy: actor.userId,
        },
      });

      await this.audit.record(actor, {
        entityType: 'salary_review',
        entityId: id,
        action: 'initial_salary_applied',
      });

      await this.applyService.applySalaryReview(id, actor);
      const response = await this.toResponse(await this.getOrThrow(id));
      await this.notifier.notifySalaryApplied(response);
      return response;
    }

    const review = await this.prisma.salaryReview.update({
      where: { id },
      data: {
        status: 'pending_approval',
        requestedBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'salary_review',
      entityId: id,
      action: 'submitted',
    });

    const response = await this.toResponse(review);
    await this.notifier.notifySalarySubmitted(response);
    return response;
  }

  async approve(actor: ActorContext, id: string): Promise<SalaryReviewResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanApprove(actor, existing.companyId);
    if (existing.status !== 'pending_approval') {
      throw new CompensationReviewInvalidStatusError('Only pending salary reviews can be approved');
    }

    const review = await this.prisma.salaryReview.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'salary_review',
      entityId: id,
      action: 'approved',
    });

    const response = await this.toResponse(review);
    await this.notifier.notifySalaryApproved(response);

    const today = this.dates.todayString();
    if (review.effectiveDate.toISOString().slice(0, 10) <= today) {
      await this.applyService.applySalaryReview(id, actor);
      return this.toResponse(await this.getOrThrow(id));
    }

    return response;
  }

  async reject(actor: ActorContext, id: string, dto: RejectCompensationReviewDto): Promise<SalaryReviewResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanApprove(actor, existing.companyId);
    if (existing.status !== 'pending_approval') {
      throw new CompensationReviewInvalidStatusError('Only pending salary reviews can be rejected');
    }

    const review = await this.prisma.salaryReview.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectedBy: actor.userId,
        rejectedAt: this.dates.now(),
        reason: dto.reason ?? existing.reason,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'salary_review',
      entityId: id,
      action: 'rejected',
    });

    const response = await this.toResponse(review);
    await this.notifier.notifySalaryRejected(response);
    return response;
  }

  async apply(actor: ActorContext, id: string): Promise<SalaryReviewResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanEdit(actor, existing.companyId);
    await this.applyService.applySalaryReview(id, actor);
    const response = await this.toResponse(await this.getOrThrow(id));
    await this.notifier.notifySalaryApplied(response);
    return response;
  }

  async get(actor: ActorContext, id: string): Promise<SalaryReviewResponse> {
    const review = await this.getOrThrow(id);
    await this.access.assertCanViewDashboard(actor, review.companyId);
    return this.toResponse(review);
  }

  async list(actor: ActorContext, companyId: string, status?: string): Promise<SalaryReviewResponse[]> {
    await this.access.assertCanViewDashboard(actor, companyId);
    const rows = await this.prisma.salaryReview.findMany({
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
    return this.prisma.salaryReview.findMany({
      where: {
        employeeId,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getOrThrow(id: string) {
    const review = await this.prisma.salaryReview.findFirst({
      where: { id, deletedAt: null },
    });
    if (!review) throw new SalaryReviewNotFoundError(id);
    return review;
  }

  private async getCurrentSalary(employeeId: string, companyId: string): Promise<number> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { payrollAllocationMode: true, masterMonthlySalary: true },
    });
    if (employee?.payrollAllocationMode === 'shared_across_companies' && employee.masterMonthlySalary != null) {
      return Number(employee.masterMonthlySalary);
    }

    const today = this.dates.now();
    const band = await this.prisma.salaryHistory.findFirst({
      where: {
        employeeId,
        companyId,
        deletedAt: null,
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return band ? Number(band.monthlySalary) : 0;
  }

  async toResponse(review: {
    id: string;
    employeeId: string;
    companyId: string;
    currentSalary: { toString(): string } | number;
    proposedSalary: { toString(): string } | number;
    increaseAmount: { toString(): string } | number;
    increasePercent: { toString(): string } | number;
    reason: string | null;
    effectiveDate: Date;
    status: SalaryReviewResponse['status'];
    requestedBy: string | null;
    approvedBy: string | null;
    rejectedBy: string | null;
    rejectedAt: Date | null;
    appliedAt: Date | null;
    createdAt: Date;
  }): Promise<SalaryReviewResponse> {
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
      currentSalary: Number(review.currentSalary),
      proposedSalary: Number(review.proposedSalary),
      increaseAmount: Number(review.increaseAmount),
      increasePercent: Number(review.increasePercent),
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
