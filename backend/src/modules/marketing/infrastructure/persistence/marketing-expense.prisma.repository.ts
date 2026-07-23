// ============================================================================
// modules/marketing/infrastructure/persistence/marketing-expense.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { MarketingExpenseStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  CommissionExpenseTotals,
  CreateMarketingExpenseInput,
  MarketingExpenseCategory,
  MarketingExpenseListFilters,
  MarketingExpenseRepository,
  MarketingExpenseRow,
  UpdateMarketingExpenseInput,
} from '../../domain/repositories/marketing-expense.repository';
import {
  buildCommissionExpenseTotals,
  emptyCategoryTotals,
} from '../../domain/services/marketing-expense-aggregation.service';
import { MarketingExpenseNotFoundError } from '../../domain/errors/marketing.errors';

@Injectable()
export class PrismaMarketingExpenseRepository implements MarketingExpenseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateMarketingExpenseInput): Promise<MarketingExpenseRow> {
    const row = await this.prisma.marketingExpense.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        teamId: input.teamId ?? null,
        employeeId: input.employeeId ?? null,
        earnCycleId: input.earnCycleId,
        expenseDate: input.expenseDate,
        category: input.category,
        subCategory: input.subCategory ?? null,
        amount: input.amount,
        description: input.description ?? null,
        attachmentUrl: input.attachmentUrl ?? null,
        status: 'draft',
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    return this.map(row);
  }

  async update(id: string, input: UpdateMarketingExpenseInput): Promise<MarketingExpenseRow> {
    try {
      const row = await this.prisma.marketingExpense.update({
        where: { id },
        data: {
          teamId: input.teamId,
          employeeId: input.employeeId,
          expenseDate: input.expenseDate,
          category: input.category,
          subCategory: input.subCategory,
          amount: input.amount,
          description: input.description,
          attachmentUrl: input.attachmentUrl,
          updatedBy: input.actorUserId,
        },
      });
      return this.map(row);
    } catch {
      throw new MarketingExpenseNotFoundError(id);
    }
  }

  async findById(id: string): Promise<MarketingExpenseRow | null> {
    const row = await this.prisma.marketingExpense.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.map(row) : null;
  }

  async list(filters: MarketingExpenseListFilters): Promise<MarketingExpenseRow[]> {
    const rows = await this.prisma.marketingExpense.findMany({
      where: this.where(filters),
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
      take: filters.limit ?? 200,
    });
    return rows.map((row) => this.map(row));
  }

  async saveStatus(
    id: string,
    status: MarketingExpenseStatus,
    actorUserId: string,
    meta: {
      submittedBy?: string;
      approvedBy?: string;
      approvedAt?: Date;
      rejectedReason?: string | null;
    } = {},
  ): Promise<MarketingExpenseRow> {
    try {
      const row = await this.prisma.marketingExpense.update({
        where: { id },
        data: {
          status,
          submittedBy: meta.submittedBy,
          approvedBy: meta.approvedBy,
          approvedAt: meta.approvedAt,
          rejectedReason: meta.rejectedReason,
          updatedBy: actorUserId,
        },
      });
      return this.map(row);
    } catch {
      throw new MarketingExpenseNotFoundError(id);
    }
  }

  async sumApprovedAmount(
    filters: Omit<MarketingExpenseListFilters, 'status' | 'limit'>,
  ): Promise<number> {
    const result = await this.prisma.marketingExpense.aggregate({
      where: { ...this.where(filters), status: 'approved' },
      _sum: { amount: true },
    });
    return Number(result._sum.amount ?? 0);
  }

  async aggregateCommissionTotals(
    companyId: string,
    teamId: string,
    earnCycleId: string,
  ): Promise<CommissionExpenseTotals> {
    const byCategory = await this.aggregateApprovedByCategory({ companyId, teamId, earnCycleId });
    return buildCommissionExpenseTotals(byCategory);
  }

  async aggregateApprovedByCategory(
    filters: Omit<MarketingExpenseListFilters, 'status' | 'limit'>,
  ): Promise<Record<MarketingExpenseCategory, number>> {
    const grouped = await this.prisma.marketingExpense.groupBy({
      by: ['category'],
      where: { ...this.where(filters), status: 'approved' },
      _sum: { amount: true },
    });

    const totals = emptyCategoryTotals();
    for (const row of grouped) {
      totals[row.category as MarketingExpenseCategory] = Number(row._sum.amount ?? 0);
    }
    return totals;
  }

  private where(filters: MarketingExpenseListFilters): Prisma.MarketingExpenseWhereInput {
    return {
      companyId: filters.companyId,
      deletedAt: null,
      teamId: filters.teamId,
      employeeId: filters.employeeId,
      earnCycleId: filters.earnCycleId,
      status: filters.status,
      category: filters.category,
      expenseDate: filters.dateFrom || filters.dateTo
        ? { gte: filters.dateFrom, lte: filters.dateTo }
        : undefined,
    };
  }

  private map(row: {
    id: string;
    companyId: string;
    teamId: string | null;
    employeeId: string | null;
    earnCycleId: string;
    expenseDate: Date;
    category: MarketingExpenseCategory;
    subCategory: string | null;
    amount: Prisma.Decimal;
    description: string | null;
    attachmentUrl: string | null;
    status: MarketingExpenseStatus;
    submittedBy: string | null;
    approvedBy: string | null;
    approvedAt: Date | null;
    rejectedReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): MarketingExpenseRow {
    return {
      id: row.id,
      companyId: row.companyId,
      teamId: row.teamId,
      employeeId: row.employeeId,
      earnCycleId: row.earnCycleId,
      expenseDate: row.expenseDate,
      category: row.category,
      subCategory: row.subCategory,
      amount: Number(row.amount),
      description: row.description,
      attachmentUrl: row.attachmentUrl,
      status: row.status,
      submittedBy: row.submittedBy,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
      rejectedReason: row.rejectedReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
