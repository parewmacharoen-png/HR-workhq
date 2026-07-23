// ============================================================================
// modules/finance/infrastructure/persistence/finance.prisma.repository.ts
// Adapters for all finance aggregates. Reads exclude soft-deleted rows.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { CostCenter } from '../../domain/entities/cost-center.entity';
import { Budget } from '../../domain/entities/budget.entity';
import { FinancialTransaction } from '../../domain/entities/financial-transaction.entity';
import { AdvanceRequest, DepositRefund } from '../../domain/entities/finance-request.entity';
import {
  CostCenterRepository, BudgetRepository, FinancialTransactionRepository,
  LedgerRepository, AdvanceRequestRepository, DepositRefundRepository,
  RevenueExpenseSummary,
} from '../../domain/repositories/finance.repository';
import { LedgerEntryDraft } from '../../domain/services/finance-posting.service';

// ── Cost Center ──────────────────────────────────────────────────────────────
@Injectable()
export class PrismaCostCenterRepository implements CostCenterRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CostCenter | null> {
    const row = await this.prisma.costCenter.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async findByCompanyAndCode(companyId: string, code: string): Promise<CostCenter | null> {
    const row = await this.prisma.costCenter.findFirst({ where: { companyId, code, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async listByCompany(companyId: string): Promise<CostCenter[]> {
    const rows = await this.prisma.costCenter.findMany({ where: { companyId, deletedAt: null }, orderBy: { code: 'asc' } });
    return rows.map((r) => this.toDomain(r));
  }
  async save(cc: CostCenter, actorUserId: string): Promise<void> {
    const p = cc.toPersistence();
    await this.prisma.costCenter.upsert({
      where: { id: p.id },
      create: {
        id: p.id, companyId: p.companyId, code: p.code, name: p.name,
        description: p.description ?? undefined, parentId: p.parentId ?? undefined,
        ownerEmployeeId: p.ownerEmployeeId ?? undefined, isActive: p.isActive,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
      update: {
        name: p.name, description: p.description ?? undefined,
        parentId: p.parentId ?? undefined, ownerEmployeeId: p.ownerEmployeeId ?? undefined,
        isActive: p.isActive, updatedBy: actorUserId,
      },
    });
  }
  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.costCenter.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorUserId, isActive: false } });
  }
  private toDomain(r: any): CostCenter {
    return CostCenter.rehydrate({
      id: r.id, companyId: r.companyId, code: r.code, name: r.name,
      description: r.description, parentId: r.parentId, ownerEmployeeId: r.ownerEmployeeId,
      isActive: r.isActive, deletedAt: r.deletedAt,
    });
  }
}

// ── Budget ───────────────────────────────────────────────────────────────────
@Injectable()
export class PrismaBudgetRepository implements BudgetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Budget | null> {
    const row = await this.prisma.budget.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async findActiveForCostCenter(companyId: string, costCenterId: string, onDate: Date): Promise<Budget | null> {
    const row = await this.prisma.budget.findFirst({
      where: {
        companyId, costCenterId, deletedAt: null,
        periodStart: { lte: onDate }, periodEnd: { gte: onDate },
      },
    });
    return row ? this.toDomain(row) : null;
  }
  async listByCompany(companyId: string): Promise<Budget[]> {
    const rows = await this.prisma.budget.findMany({ where: { companyId, deletedAt: null }, orderBy: { periodStart: 'desc' } });
    return rows.map((r) => this.toDomain(r));
  }
  async save(budget: Budget, actorUserId: string): Promise<void> {
    const p = budget.toPersistence();
    await this.prisma.budget.upsert({
      where: { id: p.id },
      create: {
        id: p.id, companyId: p.companyId, costCenterId: p.costCenterId ?? undefined,
        name: p.name, period: p.period, periodStart: p.periodStart, periodEnd: p.periodEnd,
        amount: new Prisma.Decimal(p.amount), consumed: new Prisma.Decimal(p.consumed),
        createdBy: actorUserId, updatedBy: actorUserId,
      },
      update: {
        name: p.name, amount: new Prisma.Decimal(p.amount),
        consumed: new Prisma.Decimal(p.consumed), updatedBy: actorUserId,
      },
    });
  }
  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.budget.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorUserId } });
  }
  private toDomain(r: any): Budget {
    return Budget.rehydrate({
      id: r.id, companyId: r.companyId, costCenterId: r.costCenterId, name: r.name,
      period: r.period, periodStart: r.periodStart, periodEnd: r.periodEnd,
      amount: Number(r.amount), consumed: Number(r.consumed), deletedAt: r.deletedAt,
    });
  }
}

// ── Financial Transaction ─────────────────────────────────────────────────────
@Injectable()
export class PrismaFinancialTransactionRepository implements FinancialTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<FinancialTransaction | null> {
    const row = await this.prisma.financialTransaction.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async listByCompany(companyId: string, from: Date, to: Date): Promise<FinancialTransaction[]> {
    const rows = await this.prisma.financialTransaction.findMany({
      where: { companyId, transactionDate: { gte: from, lte: to }, deletedAt: null },
      orderBy: { transactionDate: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }
  async findByWorkflowEntity(entityId: string): Promise<FinancialTransaction | null> {
    const row = await this.prisma.financialTransaction.findFirst({ where: { id: entityId, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async save(txn: FinancialTransaction, actorUserId: string): Promise<void> {
    const p = txn.toPersistence();
    await this.prisma.financialTransaction.upsert({
      where: { id: p.id },
      create: {
        id: p.id, companyId: p.companyId, costCenterId: p.costCenterId ?? undefined,
        budgetId: p.budgetId ?? undefined, type: p.type, status: p.status,
        category: p.category ?? undefined, amount: new Prisma.Decimal(p.amount),
        currency: p.currency, transactionDate: p.transactionDate,
        description: p.description ?? undefined, counterparty: p.counterparty ?? undefined,
        workflowInstanceId: p.workflowInstanceId ?? undefined,
        ledgerEntryId: p.ledgerEntryId ?? undefined,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
      update: {
        status: p.status, costCenterId: p.costCenterId ?? undefined,
        budgetId: p.budgetId ?? undefined, category: p.category ?? undefined,
        workflowInstanceId: p.workflowInstanceId ?? undefined,
        ledgerEntryId: p.ledgerEntryId ?? undefined, updatedBy: actorUserId,
      },
    });
  }
  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.financialTransaction.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorUserId } });
  }
  async summary(companyId: string, from: Date, to: Date): Promise<RevenueExpenseSummary> {
    const grouped = await this.prisma.financialTransaction.groupBy({
      by: ['type'],
      where: { companyId, transactionDate: { gte: from, lte: to }, status: 'posted', deletedAt: null },
      _sum: { amount: true },
    });
    let totalRevenue = 0, totalExpense = 0;
    for (const g of grouped) {
      const sum = Number(g._sum.amount ?? 0);
      if (g.type === 'revenue') totalRevenue = sum;
      else if (g.type === 'expense') totalExpense = sum;
    }
    return { totalRevenue, totalExpense, net: Math.round((totalRevenue - totalExpense) * 100) / 100 };
  }
  private toDomain(r: any): FinancialTransaction {
    return FinancialTransaction.rehydrate({
      id: r.id, companyId: r.companyId, costCenterId: r.costCenterId, budgetId: r.budgetId,
      type: r.type, status: r.status, category: r.category, amount: Number(r.amount),
      currency: r.currency, transactionDate: r.transactionDate, description: r.description,
      counterparty: r.counterparty, workflowInstanceId: r.workflowInstanceId,
      ledgerEntryId: r.ledgerEntryId, deletedAt: r.deletedAt,
    });
  }
}

// ── Ledger ─────────────────────────────────────────────────────────────────────
@Injectable()
export class PrismaLedgerRepository implements LedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(draft: LedgerEntryDraft, actorUserId: string): Promise<string> {
    const id = randomUUID();
    await this.prisma.ledgerEntry.create({
      data: {
        id, companyId: draft.companyId, entryDate: draft.entryDate,
        account: draft.account, direction: draft.direction,
        amount: new Prisma.Decimal(draft.amount),
        refType: draft.refType, refId: draft.refId,
        description: draft.description ?? undefined,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
    });
    return id;
  }
}

// ── Advance Request ──────────────────────────────────────────────────────────
@Injectable()
export class PrismaAdvanceRequestRepository implements AdvanceRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<AdvanceRequest | null> {
    const row = await this.prisma.advanceRequest.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async findByWorkflowEntity(entityId: string): Promise<AdvanceRequest | null> {
    const row = await this.prisma.advanceRequest.findFirst({ where: { id: entityId, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async save(req: AdvanceRequest, actorUserId: string): Promise<void> {
    const p = req.toPersistence();
    await this.prisma.advanceRequest.upsert({
      where: { id: p.id },
      create: {
        id: p.id, employeeId: p.employeeId, companyId: p.companyId,
        amount: new Prisma.Decimal(p.amount), reason: p.reason ?? undefined,
        workflowInstanceId: p.workflowInstanceId ?? undefined, status: p.status,
        recoveredPayrollItemId: p.recoveredPayrollItemId ?? undefined,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
      update: {
        workflowInstanceId: p.workflowInstanceId ?? undefined, status: p.status,
        recoveredPayrollItemId: p.recoveredPayrollItemId ?? undefined, updatedBy: actorUserId,
      },
    });
  }
  private toDomain(r: any): AdvanceRequest {
    return AdvanceRequest.rehydrate({
      id: r.id, employeeId: r.employeeId, companyId: r.companyId, amount: Number(r.amount),
      reason: r.reason, workflowInstanceId: r.workflowInstanceId, status: r.status,
      recoveredPayrollItemId: r.recoveredPayrollItemId, deletedAt: r.deletedAt,
    });
  }
}

// ── Deposit Refund ───────────────────────────────────────────────────────────
@Injectable()
export class PrismaDepositRefundRepository implements DepositRefundRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<DepositRefund | null> {
    const row = await this.prisma.depositRefund.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async findByWorkflowEntity(entityId: string): Promise<DepositRefund | null> {
    const row = await this.prisma.depositRefund.findFirst({ where: { id: entityId, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async save(req: DepositRefund, actorUserId: string): Promise<void> {
    const p = req.toPersistence();
    await this.prisma.depositRefund.upsert({
      where: { id: p.id },
      create: {
        id: p.id, employeeId: p.employeeId, owningCompanyId: p.owningCompanyId,
        amount: new Prisma.Decimal(p.amount), workflowInstanceId: p.workflowInstanceId ?? undefined,
        status: p.status, refundedPayrollItemId: p.refundedPayrollItemId ?? undefined,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
      update: {
        workflowInstanceId: p.workflowInstanceId ?? undefined, status: p.status,
        refundedPayrollItemId: p.refundedPayrollItemId ?? undefined, updatedBy: actorUserId,
      },
    });
  }
  private toDomain(r: any): DepositRefund {
    return DepositRefund.rehydrate({
      id: r.id, employeeId: r.employeeId, owningCompanyId: r.owningCompanyId,
      amount: Number(r.amount), workflowInstanceId: r.workflowInstanceId, status: r.status,
      refundedPayrollItemId: r.refundedPayrollItemId, deletedAt: r.deletedAt,
    });
  }
}
