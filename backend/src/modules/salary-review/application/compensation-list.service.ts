// ============================================================================
// modules/salary-review/application/compensation-list.service.ts
// SAL-001b — filtered list of salary + promotion reviews.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompensationReviewAccessService } from './compensation-review-access.service';
import {
  CompensationReviewListItem,
  CompensationReviewListResponse,
  CompensationReviewStatus,
} from './dto/salary-review.dto';

export interface CompensationListFilters {
  companyId: string;
  type?: 'salary' | 'promotion' | 'all';
  status?: CompensationReviewStatus;
  effectiveFrom?: string;
  effectiveTo?: string;
  search?: string;
}

@Injectable()
export class CompensationListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CompensationReviewAccessService,
  ) {}

  async list(actor: ActorContext, filters: CompensationListFilters): Promise<CompensationReviewListResponse> {
    await this.access.assertCanViewDashboard(actor, filters.companyId);

    const type = filters.type ?? 'all';
    const items: CompensationReviewListItem[] = [];

    if (type === 'salary' || type === 'all') {
      const salaryRows = await this.prisma.salaryReview.findMany({
        where: this.salaryWhere(filters),
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      });
      for (const row of salaryRows) {
        items.push(await this.toSalaryItem(row));
      }
    }

    if (type === 'promotion' || type === 'all') {
      const promotionRows = await this.prisma.promotionReview.findMany({
        where: this.promotionWhere(filters),
        orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      });
      for (const row of promotionRows) {
        items.push(await this.toPromotionItem(row));
      }
    }

    items.sort((a, b) => {
      const dateCmp = b.effectiveDate.localeCompare(a.effectiveDate);
      if (dateCmp !== 0) return dateCmp;
      return b.createdAt.localeCompare(a.createdAt);
    });

    return {
      companyId: filters.companyId,
      items,
      total: items.length,
    };
  }

  private salaryWhere(filters: CompensationListFilters): Prisma.SalaryReviewWhereInput {
    const effectiveDate = this.effectiveDateFilter(filters);
    return {
      companyId: filters.companyId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(effectiveDate ? { effectiveDate } : {}),
      ...(filters.search ? { employee: this.employeeSearch(filters.search) } : {}),
    };
  }

  private promotionWhere(filters: CompensationListFilters): Prisma.PromotionReviewWhereInput {
    const effectiveDate = this.effectiveDateFilter(filters);
    return {
      companyId: filters.companyId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(effectiveDate ? { effectiveDate } : {}),
      ...(filters.search ? { employee: this.employeeSearch(filters.search) } : {}),
    };
  }

  private effectiveDateFilter(filters: CompensationListFilters): Prisma.DateTimeFilter | undefined {
    if (!filters.effectiveFrom && !filters.effectiveTo) return undefined;
    return {
      ...(filters.effectiveFrom ? { gte: new Date(filters.effectiveFrom) } : {}),
      ...(filters.effectiveTo ? { lte: new Date(filters.effectiveTo) } : {}),
    };
  }

  private employeeSearch(search: string): Prisma.EmployeeWhereInput {
    const q = search.trim();
    return {
      deletedAt: null,
      OR: [
        { globalId: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ],
    };
  }

  private async toSalaryItem(row: {
    id: string;
    employeeId: string;
    companyId: string;
    currentSalary: Prisma.Decimal;
    proposedSalary: Prisma.Decimal;
    increaseAmount: Prisma.Decimal;
    increasePercent: Prisma.Decimal;
    reason: string | null;
    effectiveDate: Date;
    status: CompensationReviewStatus;
    requestedBy: string | null;
    approvedBy: string | null;
    createdAt: Date;
  }): Promise<CompensationReviewListItem> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: row.employeeId, deletedAt: null },
      select: { globalId: true, firstName: true, lastName: true },
    });
    const [requestedByName, approvedByName] = await Promise.all([
      this.userName(row.requestedBy),
      this.userName(row.approvedBy),
    ]);

    return {
      id: row.id,
      type: 'salary',
      employeeId: row.employeeId,
      companyId: row.companyId,
      employeeCode: employee?.globalId ?? '',
      employeeName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : '',
      currentValue: Number(row.currentSalary).toLocaleString('th-TH'),
      proposedValue: Number(row.proposedSalary).toLocaleString('th-TH'),
      increaseAmount: Number(row.increaseAmount),
      increasePercent: Number(row.increasePercent),
      effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
      status: row.status,
      requestedBy: row.requestedBy,
      requestedByName,
      approvedBy: row.approvedBy,
      approvedByName,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async toPromotionItem(row: {
    id: string;
    employeeId: string;
    companyId: string;
    currentPosition: string | null;
    proposedPosition: string;
    reason: string | null;
    effectiveDate: Date;
    status: CompensationReviewStatus;
    requestedBy: string | null;
    approvedBy: string | null;
    createdAt: Date;
  }): Promise<CompensationReviewListItem> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: row.employeeId, deletedAt: null },
      select: { globalId: true, firstName: true, lastName: true },
    });
    const [requestedByName, approvedByName] = await Promise.all([
      this.userName(row.requestedBy),
      this.userName(row.approvedBy),
    ]);

    return {
      id: row.id,
      type: 'promotion',
      employeeId: row.employeeId,
      companyId: row.companyId,
      employeeCode: employee?.globalId ?? '',
      employeeName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : '',
      currentValue: row.currentPosition ?? '—',
      proposedValue: row.proposedPosition,
      increaseAmount: null,
      increasePercent: null,
      effectiveDate: row.effectiveDate.toISOString().slice(0, 10),
      status: row.status,
      requestedBy: row.requestedBy,
      requestedByName,
      approvedBy: row.approvedBy,
      approvedByName,
      reason: row.reason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async userName(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { username: true, employee: { select: { firstName: true, lastName: true } } },
    });
    if (!user) return null;
    if (user.employee) {
      return `${user.employee.firstName} ${user.employee.lastName}`.trim();
    }
    return user.username;
  }
}
