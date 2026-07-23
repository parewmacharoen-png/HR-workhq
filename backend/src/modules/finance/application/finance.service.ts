// ============================================================================
// modules/finance/application/finance.service.ts
// Orchestrates all six finance features. Cross-cutting rules applied here:
//   * Multi-company: every entity carries company_id; callers pass it.
//   * Audit-first: every mutation writes an audit log via AuditService.
//   * Soft delete: deletes go through repository softDelete().
//   * Workflow integration: expenses over threshold, advances, and deposit
//     refunds open approval workflows and react to resolution.
//   * Cost-center assignment: transactions can be tagged to a cost center and
//     a budget; posting consumes the budget.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  COST_CENTER_REPOSITORY, BUDGET_REPOSITORY, FINANCIAL_TXN_REPOSITORY,
  LEDGER_REPOSITORY, ADVANCE_REQUEST_REPOSITORY, DEPOSIT_REFUND_REPOSITORY,
  CostCenterRepository, BudgetRepository, FinancialTransactionRepository,
  LedgerRepository, AdvanceRequestRepository, DepositRefundRepository,
} from '../domain/repositories/finance.repository';
import { CostCenter } from '../domain/entities/cost-center.entity';
import { Budget } from '../domain/entities/budget.entity';
import { FinancialTransaction } from '../domain/entities/financial-transaction.entity';
import { AdvanceRequest, DepositRefund } from '../domain/entities/finance-request.entity';
import { FinancePostingService, DEFAULT_POSTING_PARAMS } from '../domain/services/finance-posting.service';
import {
  CostCenterNotFoundError, DuplicateCostCenterCodeError, CostCenterCompanyMismatchError,
  BudgetNotFoundError, TransactionNotFoundError, AdvanceRequestNotFoundError,
  DepositRefundNotFoundError,
} from '../domain/errors/finance.errors';
import {
  CreateCostCenterDto, UpdateCostCenterDto, CreateBudgetDto, AdjustBudgetDto,
  CreateTransactionDto, CreateAdvanceDto, CreateDepositRefundDto,
  CostCenterResponse, BudgetResponse, TransactionResponse,
  FinanceRequestResponse, FinancialSummaryResponse,
} from './dto/finance.dto';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';

@Injectable()
export class FinanceService {
  private readonly posting = new FinancePostingService(DEFAULT_POSTING_PARAMS);

  constructor(
    @Inject(COST_CENTER_REPOSITORY)     private readonly costCenters: CostCenterRepository,
    @Inject(BUDGET_REPOSITORY)          private readonly budgets: BudgetRepository,
    @Inject(FINANCIAL_TXN_REPOSITORY)   private readonly txns: FinancialTransactionRepository,
    @Inject(LEDGER_REPOSITORY)          private readonly ledger: LedgerRepository,
    @Inject(ADVANCE_REQUEST_REPOSITORY) private readonly advances: AdvanceRequestRepository,
    @Inject(DEPOSIT_REFUND_REPOSITORY)  private readonly refunds: DepositRefundRepository,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  // ══ Cost Centers ════════════════════════════════════════════════════════

  async createCostCenter(actor: ActorContext, dto: CreateCostCenterDto): Promise<CostCenterResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const dup = await this.costCenters.findByCompanyAndCode(dto.companyId, dto.code.toUpperCase());
    if (dup) throw new DuplicateCostCenterCodeError(dto.code);

    if (dto.parentId) {
      const parent = await this.costCenters.findById(dto.parentId);
      if (!parent) throw new CostCenterNotFoundError(dto.parentId);
      if (parent.companyId !== dto.companyId) throw new CostCenterCompanyMismatchError();
    }

    const cc = CostCenter.create({ id: randomUUID(), ...dto });
    await this.costCenters.save(cc, actor.userId);
    await this.audit.record(actor, {
      entityType: 'CostCenter', entityId: cc.id, action: 'create', after: cc.toPersistence(),
    });
    return this.toCostCenterResponse(cc);
  }

  async updateCostCenter(actor: ActorContext, id: string, dto: UpdateCostCenterDto): Promise<CostCenterResponse> {
    const cc = await this.costCenters.findById(id);
    if (!cc) throw new CostCenterNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, cc.companyId);
    const before = cc.toPersistence();
    if (dto.name !== undefined) cc.rename(dto.name);
    if (dto.ownerEmployeeId !== undefined) cc.assignOwner(dto.ownerEmployeeId);
    if (dto.isActive === true) cc.activate();
    if (dto.isActive === false) cc.deactivate();
    await this.costCenters.save(cc, actor.userId);
    await this.audit.record(actor, {
      entityType: 'CostCenter', entityId: id, action: 'update', before, after: cc.toPersistence(),
    });
    return this.toCostCenterResponse(cc);
  }

  async deleteCostCenter(actor: ActorContext, id: string): Promise<void> {
    const cc = await this.costCenters.findById(id);
    if (!cc) throw new CostCenterNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, cc.companyId);
    await this.costCenters.softDelete(id, actor.userId);
    await this.audit.record(actor, { entityType: 'CostCenter', entityId: id, action: 'delete', before: cc.toPersistence() });
  }

  async listCostCenters(actor: ActorContext, companyId: string): Promise<CostCenterResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const list = await this.costCenters.listByCompany(companyId);
    return list.map((c) => this.toCostCenterResponse(c));
  }

  // ══ Budgets ═════════════════════════════════════════════════════════════

  async createBudget(actor: ActorContext, dto: CreateBudgetDto): Promise<BudgetResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    if (dto.costCenterId) {
      const cc = await this.costCenters.findById(dto.costCenterId);
      if (!cc) throw new CostCenterNotFoundError(dto.costCenterId);
      if (cc.companyId !== dto.companyId) throw new CostCenterCompanyMismatchError();
    }
    const budget = Budget.create({
      id: randomUUID(),
      companyId: dto.companyId,
      name: dto.name,
      period: dto.period,
      periodStart: new Date(dto.periodStart),
      periodEnd: new Date(dto.periodEnd),
      amount: dto.amount,
      costCenterId: dto.costCenterId ?? null,
    });
    await this.budgets.save(budget, actor.userId);
    await this.audit.record(actor, { entityType: 'Budget', entityId: budget.id, action: 'create', after: budget.toPersistence() });
    return this.toBudgetResponse(budget);
  }

  async adjustBudget(actor: ActorContext, id: string, dto: AdjustBudgetDto): Promise<BudgetResponse> {
    const budget = await this.budgets.findById(id);
    if (!budget) throw new BudgetNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, budget.companyId);
    const before = budget.toPersistence();
    budget.adjustAmount(dto.amount);
    await this.budgets.save(budget, actor.userId);
    await this.audit.record(actor, { entityType: 'Budget', entityId: id, action: 'adjust', before, after: budget.toPersistence() });
    return this.toBudgetResponse(budget);
  }

  async listBudgets(actor: ActorContext, companyId: string): Promise<BudgetResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const list = await this.budgets.listByCompany(companyId);
    return list.map((b) => this.toBudgetResponse(b));
  }

  // ══ Revenue / Expense transactions ════════════════════════════════════════

  async createTransaction(actor: ActorContext, dto: CreateTransactionDto): Promise<TransactionResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    if (dto.costCenterId) {
      const cc = await this.costCenters.findById(dto.costCenterId);
      if (!cc) throw new CostCenterNotFoundError(dto.costCenterId);
      if (cc.companyId !== dto.companyId) throw new CostCenterCompanyMismatchError();
    }
    const txn = FinancialTransaction.create({
      id: randomUUID(),
      companyId: dto.companyId,
      type: dto.type,
      amount: dto.amount,
      transactionDate: new Date(dto.transactionDate),
      costCenterId: dto.costCenterId ?? null,
      budgetId: dto.budgetId ?? null,
      category: dto.category ?? null,
      currency: dto.currency ?? 'THB',
      description: dto.description ?? null,
      counterparty: dto.counterparty ?? null,
    });
    await this.txns.save(txn, actor.userId);
    await this.audit.record(actor, { entityType: 'FinancialTransaction', entityId: txn.id, action: 'create', after: txn.toPersistence() });
    return this.toTransactionResponse(txn);
  }

  /**
   * Submit a transaction. If it requires approval (expense over threshold),
   * open a workflow; otherwise auto-approve so it can be posted.
   */
  async submitTransaction(actor: ActorContext, id: string): Promise<TransactionResponse> {
    const txn = await this.txns.findById(id);
    if (!txn) throw new TransactionNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, txn.companyId);

    txn.submit();
    if (this.posting.requiresApproval(txn)) {
      const { instanceId } = await this.workflow.start(actor, {
        entityType: 'payroll_adjustment', // reuse generic finance workflow type
        entityId: txn.id,
        companyId: txn.companyId,
      });
      txn.attachWorkflow(instanceId);
    } else {
      txn.approve();
    }
    await this.txns.save(txn, actor.userId);
    await this.audit.record(actor, { entityType: 'FinancialTransaction', entityId: id, action: 'submit', after: txn.toPersistence() });
    return this.toTransactionResponse(txn);
  }

  /**
   * Post an approved transaction to the ledger and consume budget (expenses).
   * Revenue credits, expense debits.
   */
  async postTransaction(actor: ActorContext, id: string): Promise<TransactionResponse> {
    const txn = await this.txns.findById(id);
    if (!txn) throw new TransactionNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, txn.companyId);

    // Budget consumption for expenses with a linked budget
    if (txn.isExpense && txn.budgetId) {
      const budget = await this.budgets.findById(txn.budgetId);
      if (budget) {
        budget.consume(txn.amount); // throws BudgetExceededError if over
        await this.budgets.save(budget, actor.userId);
      }
    }

    const ledgerEntryId = await this.ledger.create(this.posting.toLedgerEntry(txn), actor.userId);
    txn.post(ledgerEntryId);
    await this.txns.save(txn, actor.userId);
    await this.audit.record(actor, {
      entityType: 'FinancialTransaction', entityId: id, action: 'post',
      after: { ...txn.toPersistence(), ledgerEntryId },
    });
    return this.toTransactionResponse(txn);
  }

  /** React to a finance workflow resolution (called by outbox handler). */
  async onTransactionWorkflowResolved(entityId: string, status: 'approved' | 'rejected' | 'cancelled'): Promise<void> {
    const txn = await this.txns.findByWorkflowEntity(entityId);
    if (!txn) return;
    if (status === 'approved') txn.approve();
    else txn.reject();
    await this.txns.save(txn, txn.companyId);
  }

  async financialSummary(actor: ActorContext, companyId: string, from: string, to: string): Promise<FinancialSummaryResponse> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const s = await this.txns.summary(companyId, new Date(from), new Date(to));
    return { companyId, from, to, totalRevenue: s.totalRevenue, totalExpense: s.totalExpense, net: s.net };
  }

  // ══ Advance Requests ═══════════════════════════════════════════════════════

  async createAdvance(actor: ActorContext, dto: CreateAdvanceDto): Promise<FinanceRequestResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const req = AdvanceRequest.create({ id: randomUUID(), ...dto });
    await this.advances.save(req, actor.userId);
    const { instanceId } = await this.workflow.start(actor, {
      entityType: 'advance',
      entityId: req.id,
      companyId: dto.companyId,
      workflowType: 'advance_payment',
      approvalContext: { employeeId: dto.employeeId, companyId: dto.companyId },
    });
    req.attachWorkflow(instanceId);
    await this.advances.save(req, actor.userId);
    await this.audit.record(actor, { entityType: 'AdvanceRequest', entityId: req.id, action: 'create', after: req.toPersistence() });
    const p = req.toPersistence();
    return { id: p.id, status: p.status, workflowInstanceId: p.workflowInstanceId };
  }

  async onAdvanceWorkflowResolved(entityId: string, status: 'approved' | 'rejected' | 'cancelled'): Promise<void> {
    const req = await this.advances.findByWorkflowEntity(entityId);
    if (!req) return;
    if (status === 'approved') req.approve(); else req.reject();
    await this.advances.save(req, req.employeeId);
  }

  async getAdvance(actor: ActorContext, id: string): Promise<FinanceRequestResponse> {
    const req = await this.advances.findById(id);
    if (!req) throw new AdvanceRequestNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, req.companyId);
    const p = req.toPersistence();
    return { id: p.id, status: p.status, workflowInstanceId: p.workflowInstanceId };
  }

  // ══ Deposit Refunds ═══════════════════════════════════════════════════════

  async createDepositRefund(actor: ActorContext, dto: CreateDepositRefundDto): Promise<FinanceRequestResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.owningCompanyId);
    const req = DepositRefund.create({ id: randomUUID(), ...dto });
    await this.refunds.save(req, actor.userId);
    const { instanceId } = await this.workflow.start(actor, {
      entityType: 'deposit_refund', entityId: req.id, companyId: dto.owningCompanyId,
    });
    req.attachWorkflow(instanceId);
    await this.refunds.save(req, actor.userId);
    await this.audit.record(actor, { entityType: 'DepositRefund', entityId: req.id, action: 'create', after: req.toPersistence() });
    const p = req.toPersistence();
    return { id: p.id, status: p.status, workflowInstanceId: p.workflowInstanceId };
  }

  async onDepositRefundWorkflowResolved(entityId: string, status: 'approved' | 'rejected' | 'cancelled'): Promise<void> {
    const req = await this.refunds.findByWorkflowEntity(entityId);
    if (!req) return;
    if (status === 'approved') req.approve(); else req.reject();
    await this.refunds.save(req, req.owningCompanyId);
  }

  async getDepositRefund(actor: ActorContext, id: string): Promise<FinanceRequestResponse> {
    const req = await this.refunds.findById(id);
    if (!req) throw new DepositRefundNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, req.owningCompanyId);
    const p = req.toPersistence();
    return { id: p.id, status: p.status, workflowInstanceId: p.workflowInstanceId };
  }

  // ══ Mappers ════════════════════════════════════════════════════════════════

  private toCostCenterResponse(c: CostCenter): CostCenterResponse {
    const p = c.toPersistence();
    return { id: p.id, companyId: p.companyId, code: p.code, name: p.name, parentId: p.parentId, isActive: p.isActive };
  }
  private toBudgetResponse(b: Budget): BudgetResponse {
    const p = b.toPersistence();
    return { id: p.id, companyId: p.companyId, costCenterId: p.costCenterId, name: p.name, amount: p.amount, consumed: p.consumed, remaining: b.remaining };
  }
  private toTransactionResponse(t: FinancialTransaction): TransactionResponse {
    const p = t.toPersistence();
    return { id: p.id, companyId: p.companyId, type: p.type, status: p.status, amount: p.amount, costCenterId: p.costCenterId, budgetId: p.budgetId, workflowInstanceId: p.workflowInstanceId };
  }
}
