// ============================================================================
// modules/salary-review/application/compensation-apply.service.ts
// SAL-001 — apply approved salary/promotion on effective date.
// ============================================================================

import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { DateProvider } from '../../../shared/time/date.provider';
import { PayrollBuilderService } from '../../payroll/application/payroll-builder.service';
import { SharedPayrollService } from '../../payroll/application/shared-payroll.service';
import { resolveInitialSalaryEffectiveDate } from '../../payroll/domain/services/salary-band-employment.util';
import { CompensationReviewInvalidStatusError } from '../domain/errors/salary-review.errors';

const SYSTEM_ACTOR: ActorContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  impersonatorUserId: null,
  companyId: null,
};

@Injectable()
export class CompensationApplyService {
  private readonly logger = new Logger(CompensationApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
    @Optional() @Inject(forwardRef(() => PayrollBuilderService))
    private readonly payrollBuilder?: PayrollBuilderService,
    @Optional() @Inject(forwardRef(() => SharedPayrollService))
    private readonly sharedPayroll?: SharedPayrollService,
  ) {}

  async applySalaryReview(reviewId: string, actor: ActorContext = SYSTEM_ACTOR): Promise<void> {
    const review = await this.prisma.salaryReview.findFirst({
      where: { id: reviewId, deletedAt: null },
    });
    if (!review) throw new CompensationReviewInvalidStatusError('Salary review not found');
    if (review.status !== 'approved') {
      throw new CompensationReviewInvalidStatusError('Only approved salary reviews can be applied');
    }

    const effectiveDate = review.effectiveDate;

    const employee = await this.prisma.employee.findFirst({
      where: { id: review.employeeId, deletedAt: null },
      select: { hireDate: true, payrollAllocationMode: true },
    });
    const priorBandCount = await this.prisma.salaryHistory.count({
      where: {
        employeeId: review.employeeId,
        companyId: review.companyId,
        deletedAt: null,
      },
    });
    const salaryEffectiveFrom = resolveInitialSalaryEffectiveDate(
      effectiveDate,
      employee?.hireDate,
      priorBandCount > 0,
    );

    if (employee?.payrollAllocationMode === 'shared_across_companies' && this.sharedPayroll) {
      const masterSalary = Number(review.proposedSalary);
      await this.sharedPayroll.syncSalaryHistories(
        actor,
        review.employeeId,
        masterSalary,
        salaryEffectiveFrom.toISOString().slice(0, 10),
        review.reason ?? 'ปรับเงินเดือนจาก compensation review',
      );
      await this.prisma.salaryReview.update({
        where: { id: review.id },
        data: {
          status: 'applied',
          appliedAt: this.dates.now(),
          updatedBy: actor.userId,
        },
      });
      await this.audit.record(actor, {
        entityType: 'salary_review',
        entityId: reviewId,
        action: 'applied',
        after: {
          proposedSalary: masterSalary,
          effectiveDate: review.effectiveDate.toISOString().slice(0, 10),
          sharedPayroll: true,
        },
      });
      await this.sharedPayroll.syncEmployeeOpenCyclesAllCompanies(actor, review.employeeId);
      return;
    }

    const dayBefore = this.dates.addDays(salaryEffectiveFrom, -1);

    await this.prisma.$transaction(async (tx) => {
      const openBands = await tx.salaryHistory.findMany({
        where: {
          employeeId: review.employeeId,
          companyId: review.companyId,
          deletedAt: null,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: salaryEffectiveFrom } }],
        },
      });

      for (const band of openBands) {
        if (band.effectiveFrom >= salaryEffectiveFrom) continue;
        await tx.salaryHistory.update({
          where: { id: band.id },
          data: {
            effectiveTo: dayBefore,
            updatedBy: actor.userId,
          },
        });
      }

      await tx.salaryHistory.create({
        data: {
          employeeId: review.employeeId,
          companyId: review.companyId,
          monthlySalary: review.proposedSalary,
          effectiveFrom: salaryEffectiveFrom,
          reason: review.reason ?? 'Salary review applied',
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });

      await tx.salaryReview.update({
        where: { id: review.id },
        data: {
          status: 'applied',
          appliedAt: this.dates.now(),
          updatedBy: actor.userId,
        },
      });
    });

    await this.audit.record(actor, {
      entityType: 'salary_review',
      entityId: reviewId,
      action: 'applied',
      after: {
        proposedSalary: Number(review.proposedSalary),
        effectiveDate: review.effectiveDate.toISOString().slice(0, 10),
      },
    });

    await this.rebuildOpenPayrollCycles(review.companyId, actor);
  }

  private async rebuildOpenPayrollCycles(companyId: string, actor: ActorContext): Promise<void> {
    if (!this.payrollBuilder) return;

    const cycles = await this.prisma.payrollCycle.findMany({
      where: { companyId, status: 'open', deletedAt: null },
      select: { id: true },
    });

    for (const cycle of cycles) {
      try {
        await this.payrollBuilder.buildCycle(actor, cycle.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Payroll rebuild skipped for cycle ${cycle.id}: ${message}`);
      }
    }
  }

  async applyPromotionReview(reviewId: string, actor: ActorContext = SYSTEM_ACTOR): Promise<void> {
    const review = await this.prisma.promotionReview.findFirst({
      where: { id: reviewId, deletedAt: null },
    });
    if (!review) throw new CompensationReviewInvalidStatusError('Promotion review not found');
    if (review.status !== 'approved') {
      throw new CompensationReviewInvalidStatusError('Only approved promotion reviews can be applied');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: review.employeeId },
        data: {
          position: review.proposedPosition,
          updatedBy: actor.userId,
        },
      });

      await tx.promotionReview.update({
        where: { id: review.id },
        data: {
          status: 'applied',
          appliedAt: this.dates.now(),
          updatedBy: actor.userId,
        },
      });
    });

    await this.audit.record(actor, {
      entityType: 'promotion_review',
      entityId: reviewId,
      action: 'applied',
      after: {
        proposedPosition: review.proposedPosition,
        effectiveDate: review.effectiveDate.toISOString().slice(0, 10),
      },
    });
  }

  async applyDueReviews(asOf?: Date): Promise<{ salaryApplied: number; promotionApplied: number }> {
    const ref = asOf ?? this.dates.now();
    const today = this.dates.parseDate(ref.toISOString().slice(0, 10));
    const dueSalaries = await this.prisma.salaryReview.findMany({
      where: {
        status: 'approved',
        deletedAt: null,
        effectiveDate: { lte: today },
      },
    });
    const duePromotions = await this.prisma.promotionReview.findMany({
      where: {
        status: 'approved',
        deletedAt: null,
        effectiveDate: { lte: today },
      },
    });

    for (const review of dueSalaries) {
      await this.applySalaryReview(review.id);
    }
    for (const review of duePromotions) {
      await this.applyPromotionReview(review.id);
    }

    return { salaryApplied: dueSalaries.length, promotionApplied: duePromotions.length };
  }
}

export function computeIncrease(current: number, proposed: number): {
  increaseAmount: number;
  increasePercent: number;
} {
  const increaseAmount = roundMoney(proposed - current);
  const increasePercent = current > 0
    ? roundMoney((increaseAmount / current) * 100)
    : 0;
  return { increaseAmount, increasePercent };
}

export function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
