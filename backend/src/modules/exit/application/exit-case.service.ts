// ============================================================================
// modules/exit/application/exit-case.service.ts
// POL-004 Phase 4a — deposit exit workflow core
// ============================================================================

import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
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
import { EMPLOYEE_REPOSITORY, EmployeeRepository } from '../../employee/domain/repositories/employee.repository';
import { ASSIGNMENT_REPOSITORY, AssignmentRepository } from '../../employee/domain/repositories/employee.repository';
import { EmployeeNotFoundError } from '../../employee/domain/errors/employee.errors';
import { DEPOSIT_REPOSITORY, DepositRepository } from '../../payroll/domain/repositories/payroll.repository';
import { EmployeeExitCase } from '../domain/entities/employee-exit-case.entity';
import { EXIT_CASE_REPOSITORY, ExitCaseRepository } from '../domain/repositories/exit-case.repository';
import {
  ExitCaseAlreadyOpenError,
  ExitCaseInvalidStatusError,
  ExitCaseNotCancellableError,
  ExitCaseNotFoundError,
  ExitCancellationReasonRequiredError,
  ExitChecklistIncompleteError,
  ExitReviewForbiddenError,
} from '../domain/errors/exit.errors';
import {
  allocateRefundByCollector,
  computeDepositSettlement,
  resolveDepartmentRoute,
  ExitReason,
} from '../domain/services/exit-reason-policy.service';
import { mergeLegacyCollectorBreakdown } from '../domain/services/deposit-profile.util';
import { DepositReadService } from './deposit-read.service';
import { ExitAssetGateService } from './exit-asset-gate.service';
import {
  CloseExitCaseDto,
  CancelExitCaseDto,
  CreateExitCaseDto,
  EmployeeExitHistoryResponse,
  ExitCaseResponse,
  ExitDashboardResponse,
  ExitCaseSummaryRow,
  LeaderReviewDto,
  OwnerReviewDto,
  SettlementPreviewResponse,
  UpdateExitChecklistDto,
} from './dto/exit.dto';
import { ExitChecklistService } from './exit-checklist.service';
import { ExitAccessService } from './exit-access.service';
import {
  OPEN_WORKFLOW_STATUSES,
  resolveExitType,
  toLifecycleStatus,
} from '../domain/services/exit-lifecycle.mapper';
import { ExitCaseTelegramNotifier } from '../../telegram/application/exit-case.notifier';
import { TelegramApprovalNotifier } from '../../telegram/application/telegram-approval.notifier';
import { DateProvider } from '../../../shared/time/date.provider';

@Injectable()
export class ExitCaseService {
  constructor(
    @Inject(EXIT_CASE_REPOSITORY) private readonly exitCases: ExitCaseRepository,
    @Inject(DEPOSIT_REPOSITORY) private readonly deposits: DepositRepository,
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepository,
    @Inject(ASSIGNMENT_REPOSITORY) private readonly assignments: AssignmentRepository,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
    private readonly depositRead: DepositReadService,
    private readonly assetGate: ExitAssetGateService,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly audit: AuditService,
    private readonly checklist: ExitChecklistService,
    private readonly exitAccess: ExitAccessService,
    private readonly dates: DateProvider,
    @Optional() @Inject(forwardRef(() => ExitCaseTelegramNotifier))
    private readonly telegram?: ExitCaseTelegramNotifier,
    @Optional() @Inject(forwardRef(() => TelegramApprovalNotifier))
    private readonly approvalNotifier?: TelegramApprovalNotifier,
  ) {}

  async create(actor: ActorContext, employeeId: string, dto: CreateExitCaseDto): Promise<ExitCaseResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const employee = await this.employees.findById(employeeId);
    if (!employee) throw new EmployeeNotFoundError(employeeId);

    const existing = await this.exitCases.findOpenForEmployee(employeeId, dto.companyId);
    if (existing) throw new ExitCaseAlreadyOpenError();

    const departmentRoute = resolveDepartmentRoute(employee.toPersistence().department);
    const exitCase = EmployeeExitCase.create({
      id: randomUUID(),
      employeeId,
      companyId: dto.companyId,
      exitReason: dto.exitReason,
      departmentRoute,
      effectiveTerminationDate: new Date(dto.effectiveTerminationDate),
      initiatedBy: actor.userId,
      notes: dto.notes ?? null,
    });

    await this.exitCases.save(exitCase);

    const exitType = resolveExitType(dto.exitReason);
    await this.prisma.employeeExitCase.update({
      where: { id: exitCase.id },
      data: {
        exitType,
        sourceType: dto.sourceType ?? 'manual',
        sourceId: dto.sourceId ?? null,
      },
    });
    await this.checklist.seedDefaultItems(exitCase.id);

    await this.audit.record(actor, {
      entityType: 'EmployeeExitCase',
      entityId: exitCase.id,
      action: 'create',
      after: exitCase.toPersistence(),
    });

    const response = await this.toResponse(exitCase);
    if (this.telegram) {
      await this.telegram.notifyNewExitCase({
        companyId: dto.companyId,
        exitCaseId: exitCase.id,
        employeeId,
        exitType,
        effectiveTerminationDate: dto.effectiveTerminationDate,
      }).catch(() => undefined);
    }
    await this.pushExitApproval(exitCase.id, employeeId, dto.companyId, dto.effectiveTerminationDate);
    return response;
  }

  async leaderReviewFromTelegram(
    actor: ActorContext,
    id: string,
    dto: LeaderReviewDto,
  ): Promise<ExitCaseResponse> {
    return this.leaderReview(actor, id, dto);
  }

  async rejectReviewFromTelegram(
    actor: ActorContext,
    id: string,
    reason: string,
  ): Promise<ExitCaseResponse> {
    return this.cancel(actor, id, { cancellationReason: reason || 'Rejected via Telegram' });
  }

  private async pushExitApproval(
    exitCaseId: string,
    employeeId: string,
    companyId: string,
    effectiveDate: string,
  ): Promise<void> {
    if (!this.approvalNotifier) return;
    const employee = await this.employees.findById(employeeId);
    const company = await this.prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
    const leaderIds = await this.resolveBigLeaderUserIds(employeeId, companyId);
    if (!leaderIds.length) return;

    await this.approvalNotifier.notifyCustomApproval({
      reviewType: 'exit_case',
      reviewId: exitCaseId,
      approverUserIds: leaderIds,
      display: {
        requestTypeLabel: 'อนุมัติคำขอลาออก',
        requesterName: employee
          ? `${employee.toPersistence().firstName} ${employee.toPersistence().lastName}`
          : '—',
        companyName: company?.name ?? '—',
        teamName: null,
        createdAt: this.dates.now().toISOString().slice(0, 16).replace('T', ' '),
        keyDetails: `วันที่มีผล: ${effectiveDate}`,
      },
    });
  }

  private async resolveBigLeaderUserIds(employeeId: string, companyId: string): Promise<string[]> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, teamId: { not: null }, effectiveTo: null, deletedAt: null },
      select: { teamId: true },
    });
    if (!assignment?.teamId) return [];

    const team = await this.prisma.team.findFirst({
      where: { id: assignment.teamId, deletedAt: null },
      select: { bigLeaderEmployeeId: true },
    });
    const empIds = new Set<string>();
    if (team?.bigLeaderEmployeeId) empIds.add(team.bigLeaderEmployeeId);

    const leaders = await this.prisma.employeeAssignment.findMany({
      where: { teamId: assignment.teamId, roleLevel: 'big_leader', effectiveTo: null, deletedAt: null },
      select: { employeeId: true },
    });
    leaders.forEach((l) => empIds.add(l.employeeId));

    const userIds: string[] = [];
    for (const empId of empIds) {
      const users = await this.prisma.user.findMany({
        where: { employeeId: empId, deletedAt: null, isActive: true },
        select: { id: true },
      });
      userIds.push(...users.map((u) => u.id));
    }
    return userIds;
  }

  async getDashboard(actor: ActorContext, companyId: string): Promise<ExitDashboardResponse> {
    await this.exitAccess.assertCanReadDashboard(actor, companyId);

    const rows = await this.prisma.employeeExitCase.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: OPEN_WORKFLOW_STATUSES },
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        checklistItems: { where: { completed: false }, orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { effectiveTerminationDate: 'asc' },
    });

    const today = this.dates.today();

    const mapRow = (row: typeof rows[number], extra?: Partial<ExitCaseSummaryRow>): ExitCaseSummaryRow => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
      exitType: row.exitType as ExitCaseSummaryRow['exitType'],
      lifecycleStatus: toLifecycleStatus(row.status as EmployeeExitCase['status']),
      status: row.status,
      effectiveTerminationDate: row.effectiveTerminationDate.toISOString().slice(0, 10),
      pendingChecklistCount: row.checklistItems.length,
      pendingItems: row.checklistItems.map((i) => i.label),
      ...extra,
    });

    const activeExitCases = rows.map((row) => mapRow(row));
    const pendingClearance = rows
      .filter((row) => row.checklistItems.length > 0)
      .map((row) => mapRow(row));

    const upcomingEffectiveDates = rows
      .map((row) => {
        const effective = new Date(row.effectiveTerminationDate);
        effective.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((effective.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
        return mapRow(row, { daysUntil });
      })
      .filter((row) => (row.daysUntil ?? 999) >= 0 && (row.daysUntil ?? 999) <= 30)
      .sort((a, b) => (a.daysUntil ?? 0) - (b.daysUntil ?? 0));

    return { activeExitCases, pendingClearance, upcomingEffectiveDates };
  }

  async listForEmployee(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeeExitHistoryResponse> {
    await this.exitAccess.assertCanRead(actor, employeeId, companyId);

    const rows = await this.prisma.employeeExitCase.findMany({
      where: { employeeId, companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const responses = await Promise.all(
      rows.map(async (row) => {
        const domain = await this.exitCases.findById(row.id);
        if (!domain) throw new ExitCaseNotFoundError(row.id);
        return this.toResponse(domain, true);
      }),
    );

    const activeCase = responses.find((r) => r.lifecycleStatus === 'OPEN' || r.lifecycleStatus === 'IN_PROGRESS') ?? null;
    return { activeCase, history: responses };
  }

  async listChecklistItems(actor: ActorContext, id: string) {
    const exitCase = await this.requireExitCase(id);
    await this.exitAccess.assertCanRead(actor, exitCase.employeeId, exitCase.companyId);
    return this.checklist.listItems(id);
  }

  async updateChecklistItem(
    actor: ActorContext,
    id: string,
    itemId: string,
    completed: boolean,
  ) {
    const exitCase = await this.requireExitCase(id);
    await this.assertExitCaseManage(actor, exitCase);
    const beforeItems = await this.checklist.listItems(id);
    const beforeItem = beforeItems.find((i) => i.id === itemId);
    const updated = await this.checklist.updateItem(actor, id, itemId, completed);
    await this.audit.record(actor, {
      entityType: 'EmployeeExitCase',
      entityId: id,
      action: 'checklist_item_toggled',
      before: beforeItem,
      after: updated,
    });
    return updated;
  }

  async cancel(
    actor: ActorContext,
    id: string,
    dto: CancelExitCaseDto,
  ): Promise<ExitCaseResponse> {
    const reason = dto.cancellationReason?.trim();
    if (!reason) throw new ExitCancellationReasonRequiredError();

    const exitCase = await this.requireExitCase(id);
    await this.exitAccess.assertCanCancel(actor, exitCase.companyId);

    if (exitCase.status === 'closed' || exitCase.status === 'cancelled') {
      throw new ExitCaseNotCancellableError();
    }

    const before = exitCase.toPersistence();
    const now = this.dates.now();
    try {
      exitCase.cancel(actor.userId, reason, now);
    } catch {
      throw new ExitCaseNotCancellableError();
    }

    await this.exitCases.save(exitCase);
    await this.audit.record(actor, {
      entityType: 'EmployeeExitCase',
      entityId: id,
      action: 'cancel',
      before,
      after: exitCase.toPersistence(),
    });

    const response = await this.toResponse(exitCase);
    const meta = await this.loadCaseMeta(exitCase.id);
    if (this.telegram && meta) {
      await this.telegram.notifyExitCancelled({
        companyId: exitCase.companyId,
        exitCaseId: exitCase.id,
        employeeId: exitCase.employeeId,
        exitType: meta.exitType,
        effectiveTerminationDate: response.effectiveTerminationDate,
        cancellationReason: reason,
      }).catch(() => undefined);
    }
    return response;
  }

  async getById(actor: ActorContext, id: string): Promise<ExitCaseResponse> {
    const exitCase = await this.requireExitCase(id);
    await this.exitAccess.assertCanRead(actor, exitCase.employeeId, exitCase.companyId);
    return this.toResponse(exitCase, true);
  }

  async leaderReview(actor: ActorContext, id: string, dto: LeaderReviewDto): Promise<ExitCaseResponse> {
    const exitCase = await this.requireExitCase(id);
    await this.assertLeaderReview(actor, exitCase);
    if (exitCase.status !== 'pending_leader_review') {
      throw new ExitCaseInvalidStatusError('Exit case is not awaiting leader review');
    }
    const before = exitCase.toPersistence();
    exitCase.approveLeader(actor.userId, dto.notes ?? null, this.dates.now());
    await this.exitCases.save(exitCase);
    await this.audit.record(actor, {
      entityType: 'EmployeeExitCase', entityId: id, action: 'leader_review',
      before, after: exitCase.toPersistence(),
    });
    return await this.toResponse(exitCase);
  }

  async ownerReview(actor: ActorContext, id: string, dto: OwnerReviewDto): Promise<ExitCaseResponse> {
    const exitCase = await this.requireExitCase(id);
    await this.assertOwnerReview(actor);
    if (exitCase.status !== 'pending_owner_review') {
      throw new ExitCaseInvalidStatusError('Exit case is not awaiting owner review');
    }
    const before = exitCase.toPersistence();
    exitCase.approveOwner(actor.userId, dto.notes ?? null, this.dates.now());
    await this.exitCases.save(exitCase);
    await this.audit.record(actor, {
      entityType: 'EmployeeExitCase', entityId: id, action: 'owner_review',
      before, after: exitCase.toPersistence(),
    });
    return await this.toResponse(exitCase);
  }

  async updateChecklist(
    actor: ActorContext,
    id: string,
    dto: UpdateExitChecklistDto,
  ): Promise<ExitCaseResponse> {
    const exitCase = await this.requireExitCase(id);
    await this.assertExitCaseManage(actor, exitCase);
    const before = exitCase.toPersistence();
    exitCase.updateChecklist(dto);
    await this.exitCases.save(exitCase);
    await this.audit.record(actor, {
      entityType: 'EmployeeExitCase', entityId: id, action: 'update_checklist',
      before, after: exitCase.toPersistence(),
    });
    return this.toResponse(exitCase);
  }

  async settlementPreview(actor: ActorContext, id: string): Promise<SettlementPreviewResponse> {
    const exitCase = await this.requireExitCase(id);
    await this.assertExitCaseAccess(actor, exitCase);
    return this.buildSettlementPreview(exitCase);
  }

  async settle(actor: ActorContext, id: string): Promise<ExitCaseResponse> {
    const exitCase = await this.requireExitCase(id);
    await this.assertExitCaseManage(actor, exitCase);
    if (exitCase.status !== 'pending_settlement') {
      throw new ExitCaseInvalidStatusError('Exit case is not ready for settlement');
    }

    if (exitCase.exitReason === 'proper_resignation') {
      const p = exitCase.toPersistence();
      if (!p.assetsReturned || !p.debtsCleared || !p.finalPayrollBuilt || !p.accessRevoked) {
        throw new ExitChecklistIncompleteError();
      }
    }

    await this.assetGate.assertAssetsResolved(exitCase.id, exitCase.companyId);

    const preview = await this.buildSettlementPreview(exitCase);
    const before = exitCase.toPersistence();
    const now = this.dates.now();

    exitCase.applySettlement({
      depositBalance: preview.depositBalance,
      lossClaimTotal: preview.approvedClaimsTotal,
      refundAmount: preview.refundAmount,
      forfeitAmount: preview.forfeitAmount,
      at: now,
    });

    if (preview.refundAmount > 0) {
      const primaryCollector = preview.collectorBreakdown.find((c) => c.refundAmount > 0);
      const refundId = randomUUID();
      await this.prisma.depositRefund.create({
        data: {
          id: refundId,
          employeeId: exitCase.employeeId,
          owningCompanyId: primaryCollector?.companyId ?? exitCase.companyId,
          amount: new Prisma.Decimal(preview.refundAmount),
          exitCaseId: exitCase.id,
          refundType: preview.outcome === 'full_refund' ? 'full' : 'partial',
          status: 'approved',
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      exitCase.linkDepositRefund(refundId);
    }

    await this.exitCases.save(exitCase);
    await this.audit.record(actor, {
      entityType: 'EmployeeExitCase', entityId: id, action: 'settlement_completed',
      before, after: exitCase.toPersistence(),
    });
    return await this.toResponse(exitCase);
  }

  async close(actor: ActorContext, id: string, dto: CloseExitCaseDto): Promise<ExitCaseResponse> {
    const exitCase = await this.requireExitCase(id);
    await this.assertExitCaseManage(actor, exitCase);
    if (exitCase.status !== 'settled') {
      throw new ExitCaseInvalidStatusError('Exit case must be settled before closing');
    }

    const before = exitCase.toPersistence();
    const when = dto.terminationAt ? new Date(dto.terminationAt) : this.dates.now();
    const employee = await this.employees.findById(exitCase.employeeId);
    if (!employee) throw new EmployeeNotFoundError(exitCase.employeeId);

    employee.terminate(when);
    const current = await this.assignments.listByEmployee(exitCase.employeeId);
    for (const a of current.filter((x) => x.isCurrent)) {
      a.close(when);
      await this.assignments.save(a, actor.userId);
    }
    await this.employees.save(employee, actor.userId);

    exitCase.close(this.dates.now());
    await this.exitCases.save(exitCase);

    await this.audit.record(actor, {
      entityType: 'EmployeeExitCase', entityId: id, action: 'close',
      before, after: exitCase.toPersistence(),
    });
    await this.audit.record(actor, {
      entityType: 'Employee', entityId: exitCase.employeeId, action: 'terminate',
      after: employee.toPersistence(),
    });

    const response = await this.toResponse(exitCase);
    const meta = await this.loadCaseMeta(exitCase.id);
    if (this.telegram && meta) {
      await this.telegram.notifyExitCompleted({
        companyId: exitCase.companyId,
        exitCaseId: exitCase.id,
        employeeId: exitCase.employeeId,
        exitType: meta.exitType,
        effectiveTerminationDate: response.effectiveTerminationDate,
      }).catch(() => undefined);
    }
    return response;
  }

  async findOpenForEmployee(employeeId: string, companyId: string): Promise<EmployeeExitCase | null> {
    return this.exitCases.findOpenForEmployee(employeeId, companyId);
  }

  private   async buildSettlementPreview(exitCase: EmployeeExitCase): Promise<SettlementPreviewResponse> {
    const snapshot = await this.depositRead.loadDepositSnapshot(exitCase.employeeId);
    const depositBalance = snapshot.totalBalance;
    const collectors = mergeLegacyCollectorBreakdown(
      snapshot.collectorBreakdown,
      snapshot.profile,
    );

    const claimRows = await this.prisma.depositLossClaim.findMany({
      where: { exitCaseId: exitCase.id, deletedAt: null },
    });
    const approvedClaims = claimRows.filter((c) => c.status === 'approved');
    const approvedClaimsTotal = approvedClaims.reduce((s, c) => s + Number(c.amount), 0);

    const settlement = computeDepositSettlement({
      exitReason: exitCase.exitReason,
      depositBalance,
      approvedClaimsTotal,
    });

    const refundAllocations = allocateRefundByCollector(settlement.refundAmount, collectors);
    const allocationMap = new Map(refundAllocations.map((a) => [a.companyId, a.refundAmount]));

    const claimShortfallWarning = approvedClaimsTotal > depositBalance
      ? Math.round((approvedClaimsTotal - depositBalance) * 100) / 100
      : null;
    const ownerCaseByCase = claimShortfallWarning != null && claimShortfallWarning > 0;
    const unresolvedAssetCount = await this.assetGate.countUnresolvedAssets(
      exitCase.id,
      exitCase.companyId,
    );

    return {
      depositBalance,
      collectorBreakdown: collectors.map((c) => ({
        ...c,
        refundAmount: allocationMap.get(c.companyId) ?? 0,
      })),
      approvedClaimsTotal,
      claims: claimRows.map((c) => ({
        id: c.id,
        amount: Number(c.amount),
        category: c.category,
        description: c.description,
        status: c.status,
        evidenceUrl: c.evidenceUrl,
        approvedByOwner: c.authorizedBy,
        approvedAt: c.approvedAt?.toISOString() ?? null,
      })),
      refundAmount: settlement.refundAmount,
      forfeitAmount: settlement.forfeitAmount,
      outcome: settlement.outcome,
      legalReviewRequired: settlement.legalReviewRequired,
      policyRules: settlement.policyRules,
      claimShortfallWarning,
      ownerCaseByCase,
      unresolvedAssetCount,
      assetsBlockingSettlement: unresolvedAssetCount > 0,
    };
  }

  private async requireExitCase(id: string): Promise<EmployeeExitCase> {
    const exitCase = await this.exitCases.findById(id);
    if (!exitCase) throw new ExitCaseNotFoundError(id);
    return exitCase;
  }

  private async assertExitCaseAccess(actor: ActorContext, exitCase: EmployeeExitCase): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === exitCase.employeeId) return;
    await this.companyAccess.assertCompanyAccess(actor, exitCase.companyId);
  }

  private async assertExitCaseManage(actor: ActorContext, exitCase: EmployeeExitCase): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, exitCase.companyId);
    const role = await this.actorBusinessRole(actor.userId);
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new ExitReviewForbiddenError();
  }

  private async assertLeaderReview(actor: ActorContext, exitCase: EmployeeExitCase): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, exitCase.companyId);
    const role = await this.actorBusinessRole(actor.userId);
    if (exitCase.departmentRoute === 'marketing') {
      if (role === 'big_leader' || role === 'owner') return;
    } else {
      if (role === 'secretary' || role === 'owner') return;
    }
    throw new ExitReviewForbiddenError();
  }

  private async assertOwnerReview(actor: ActorContext): Promise<void> {
    const role = await this.actorBusinessRole(actor.userId);
    if (role !== 'owner') throw new ExitReviewForbiddenError();
  }

  private async actorBusinessRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }

  private async toResponse(
    exitCase: EmployeeExitCase,
    includeChecklist = false,
  ): Promise<ExitCaseResponse> {
    const p = exitCase.toPersistence();
    const meta = await this.loadCaseMeta(exitCase.id);
    const pendingChecklistCount = await this.checklist.countPending(exitCase.id);
    const checklistItems = includeChecklist
      ? await this.checklist.listItems(exitCase.id)
      : undefined;

    return {
      id: p.id,
      employeeId: p.employeeId,
      companyId: p.companyId,
      exitReason: p.exitReason,
      exitType: meta?.exitType ?? resolveExitType(p.exitReason),
      lifecycleStatus: toLifecycleStatus(p.status),
      sourceType: meta?.sourceType ?? 'manual',
      sourceId: meta?.sourceId ?? null,
      status: p.status,
      departmentRoute: p.departmentRoute,
      effectiveTerminationDate: p.effectiveTerminationDate.toISOString().slice(0, 10),
      assetsReturned: p.assetsReturned,
      debtsCleared: p.debtsCleared,
      finalPayrollBuilt: p.finalPayrollBuilt,
      accessRevoked: p.accessRevoked,
      pendingChecklistCount,
      depositBalanceAtExit: p.depositBalanceAtExit,
      lossClaimTotal: p.lossClaimTotal,
      refundAmount: p.refundAmount,
      forfeitAmount: p.forfeitAmount,
      legalReviewRequired: p.legalReviewRequired,
      depositRefundId: p.depositRefundId,
      leaderReviewedBy: p.leaderReviewedBy,
      leaderReviewedAt: p.leaderReviewedAt?.toISOString() ?? null,
      leaderNotes: p.leaderNotes,
      ownerReviewedBy: p.ownerReviewedBy,
      ownerReviewedAt: p.ownerReviewedAt?.toISOString() ?? null,
      ownerNotes: p.ownerNotes,
      notes: p.notes,
      initiatedBy: p.initiatedBy,
      settledAt: p.settledAt?.toISOString() ?? null,
      closedAt: p.closedAt?.toISOString() ?? null,
      cancelledAt: p.cancelledAt?.toISOString() ?? null,
      cancelledBy: p.cancelledBy,
      cancellationReason: p.cancellationReason,
      checklistItems,
    };
  }

  private async loadCaseMeta(exitCaseId: string) {
    return this.prisma.employeeExitCase.findFirst({
      where: { id: exitCaseId },
      select: { exitType: true, sourceType: true, sourceId: true },
    });
  }
}
