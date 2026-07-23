import { Inject, Injectable, Logger, OnModuleInit, Optional, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  REFERRAL_PAYROLL_REPOSITORY,
  ReferralPayrollRepository,
} from '../../referral/domain/repositories/referral.repository';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import {
  CreateEmployeeReferralDto, CreateReferralProgramDto, LinkEmployeeReferralDto,
  UpdateEmployeeReferralDto, UpdateReferralProgramDto,
} from './dto/request.dto';
import { RequestForbiddenError, RequestNotFoundError, RequestValidationError } from '../domain/errors/request.errors';
import { EmployeeReferralTelegramNotifier } from '../../telegram/application/employee-referral.notifier';
import { TelegramApprovalNotifier } from '../../telegram/application/telegram-approval.notifier';
import { FormulaResolverService } from '../../formula-engine/application/formula-resolver.service';

@Injectable()
export class EmployeeReferralService implements OnModuleInit {
  private readonly logger = new Logger(EmployeeReferralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
    @Optional() @Inject(forwardRef(() => EmployeeReferralTelegramNotifier))
    private readonly telegram?: EmployeeReferralTelegramNotifier,
    @Optional() @Inject(forwardRef(() => TelegramApprovalNotifier))
    private readonly approvalNotifier?: TelegramApprovalNotifier,
    @Optional() @Inject(REFERRAL_PAYROLL_REPOSITORY)
    private readonly referralPayroll?: ReferralPayrollRepository,
    @Optional() private readonly formulaResolver?: FormulaResolverService,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.prisma.referralProgram.findFirst({
      where: { companyId: null, status: 'active' },
    });
    if (!existing) {
      await this.prisma.referralProgram.create({
        data: {
          companyId: null,
          name: 'Default Referral Program',
          description: 'Bonus after probation pass (REC-002)',
          bonusAmount: 2000,
          status: 'active',
        },
      });
    }
  }

  async create(actor: ActorContext, dto: CreateEmployeeReferralDto) {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) throw new RequestValidationError('Employee profile required');

    const program = await this.prisma.referralProgram.findFirst({
      where: { OR: [{ companyId: dto.companyId }, { companyId: null }], status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    const referral = await this.prisma.employeeReferral.create({
      data: {
        id: randomUUID(),
        companyId: dto.companyId,
        referrerEmployeeId: access.employeeId,
        candidateName: dto.candidateName,
        candidatePhone: dto.candidatePhone,
        candidateLineId: dto.candidateLineId,
        candidateEmail: dto.candidateEmail,
        targetPosition: dto.targetPosition,
        note: dto.note,
        referralProgramId: program?.id,
        status: 'submitted',
      },
    });

    await this.audit.record(actor, { entityType: 'EmployeeReferral', entityId: referral.id, action: 'create', after: referral });
    if (this.telegram) await this.telegram.notifySubmitted(referral.id);
    return referral;
  }

  async listMy(actor: ActorContext) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) return [];
    return this.prisma.employeeReferral.findMany({
      where: { referrerEmployeeId: access.employeeId },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async list(actor: ActorContext, companyId: string, status?: string) {
    await this.assertHrAccess(actor, companyId);
    return this.prisma.employeeReferral.findMany({
      where: {
        companyId,
        ...(status ? { status: status as never } : {}),
      },
      include: { referrerEmployee: true, referredEmployee: true, bonusPayouts: true },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async get(actor: ActorContext, id: string) {
    const referral = await this.prisma.employeeReferral.findUnique({
      where: { id },
      include: { referrerEmployee: true, referredEmployee: true, bonusPayouts: true, referralProgram: true },
    });
    if (!referral) throw new RequestNotFoundError('Referral not found');
    await this.assertCanViewReferral(actor, referral);
    return referral;
  }

  async update(actor: ActorContext, id: string, dto: UpdateEmployeeReferralDto) {
    const referral = await this.get(actor, id);
    await this.assertHrAccess(actor, referral.companyId);
    const updated = await this.prisma.employeeReferral.update({
      where: { id },
      data: {
        ...(dto.status ? { status: dto.status as never } : {}),
        ...(dto.rejectedReason !== undefined ? { rejectedReason: dto.rejectedReason } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
    await this.audit.record(actor, { entityType: 'EmployeeReferral', entityId: id, action: 'update', after: updated });
    return updated;
  }

  async markHired(actor: ActorContext, id: string) {
    const referral = await this.get(actor, id);
    await this.assertHrAccess(actor, referral.companyId);
    const updated = await this.prisma.employeeReferral.update({
      where: { id },
      data: { status: 'hired', hiredAt: new Date() },
    });
    await this.audit.record(actor, { entityType: 'EmployeeReferral', entityId: id, action: 'mark_hired' });
    if (this.telegram) await this.telegram.notifyHired(id);
    return updated;
  }

  async linkEmployee(actor: ActorContext, id: string, dto: LinkEmployeeReferralDto) {
    const referral = await this.get(actor, id);
    await this.assertHrAccess(actor, referral.companyId);
    const updated = await this.prisma.employeeReferral.update({
      where: { id },
      data: {
        referredEmployeeId: dto.referredEmployeeId,
        status: 'probation',
      },
    });
    await this.audit.record(actor, { entityType: 'EmployeeReferral', entityId: id, action: 'link_employee' });
    return updated;
  }

  async onProbationPassed(referredEmployeeId: string, probationReviewId: string): Promise<void> {
    const referral = await this.prisma.employeeReferral.findFirst({
      where: { referredEmployeeId, status: { in: ['hired', 'probation'] } },
      include: { referralProgram: true },
    });
    if (!referral) return;

    const fallbackBonus = referral.referralProgram?.bonusAmount ?? 2000;
    let bonusAmount = Number(fallbackBonus);
    if (this.formulaResolver) {
      const resolved = await this.formulaResolver.resolveWithFallback(
        'referral.bonus_amount',
        {
          companyId: referral.companyId,
          entityType: 'EmployeeReferral',
          entityId: referral.id,
          inputs: {
            baseReferralBonus: bonusAmount,
            positionLevel: 0,
            companyId: 0,
            passedProbation: 1,
          },
        },
        () => bonusAmount,
      );
      bonusAmount = resolved.value;
    }
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeReferral.update({
        where: { id: referral.id },
        data: {
          status: 'bonus_eligible',
          probationReviewId,
          probationPassedAt: now,
          bonusEligibleAt: now,
        },
      });
      await tx.referralBonusPayout.create({
        data: {
          referralId: referral.id,
          employeeId: referral.referrerEmployeeId,
          amount: bonusAmount,
          status: 'pending',
        },
      });
    });

    if (this.telegram) {
      await this.telegram.notifyProbationPassed(referral.id);
      await this.telegram.notifyBonusEligible(referral.id);
    }

    await this.pushReferralApproval(referral.id);
  }

  private async pushReferralApproval(referralId: string): Promise<void> {
    if (!this.approvalNotifier) return;
    const referral = await this.prisma.employeeReferral.findUnique({
      where: { id: referralId },
      include: {
        referrerEmployee: true,
        referralProgram: true,
        company: { select: { name: true } },
      },
    });
    if (!referral) return;

    const approverIds = await this.resolveOwnerSecretaryUserIds(referral.companyId);
    await this.approvalNotifier.notifyCustomApproval({
      reviewType: 'referral',
      reviewId: referral.id,
      approverUserIds: approverIds,
      display: {
        requestTypeLabel: 'อนุมัติโบนัสแนะนำเพื่อน',
        requesterName: `${referral.referrerEmployee.firstName} ${referral.referrerEmployee.lastName}`,
        companyName: referral.company.name,
        teamName: null,
        createdAt: referral.submittedAt.toISOString().slice(0, 16).replace('T', ' '),
        keyDetails: `ผู้สมัคร: ${referral.candidateName}\nโบนัส: ฿${Number(referral.referralProgram?.bonusAmount ?? 2000).toLocaleString('th-TH')}`,
      },
    });
  }

  async rejectBonus(actor: ActorContext, id: string, reason: string): Promise<unknown> {
    const referral = await this.get(actor, id);
    await this.assertOwnerOrSecretary(actor, referral.companyId);
    if (!['bonus_eligible', 'probation_passed'].includes(referral.status)) {
      throw new RequestValidationError('Referral not eligible for bonus rejection');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeReferral.update({
        where: { id },
        data: { status: 'rejected', rejectedReason: reason },
      });
      await tx.referralBonusPayout.updateMany({
        where: { referralId: id, status: 'pending' },
        data: { status: 'cancelled' },
      });
    });

    await this.audit.record(actor, {
      entityType: 'EmployeeReferral',
      entityId: id,
      action: 'reject_bonus',
      after: { reason },
    });
    if (this.telegram) await this.telegram.notifyBonusRejected(id, reason);
    return this.get(actor, id);
  }

  private async resolveOwnerSecretaryUserIds(companyId: string): Promise<string[]> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: { role: { in: ['owner', 'secretary'] }, isActive: true, deletedAt: null },
      select: { userId: true, role: true },
    });
    const ids = new Set<string>();
    for (const a of assignments) {
      const user = await this.prisma.user.findFirst({
        where: { id: a.userId, deletedAt: null, isActive: true },
        include: { scopeGrants: { where: { deletedAt: null } } },
      });
      if (!user) continue;
      if (a.role === 'owner' || user.scopeGrants.some(
        (g) => g.scopeType === 'all' || (g.scopeType === 'company' && g.companyId === companyId),
      )) {
        ids.add(user.id);
      }
    }
    return [...ids];
  }

  private async assertOwnerOrSecretary(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.businessRole === 'owner' || access?.businessRole === 'secretary') return;
    throw new RequestForbiddenError();
  }

  async approveBonus(actor: ActorContext, id: string) {
    const referral = await this.get(actor, id);
    await this.assertOwnerOrSecretary(actor, referral.companyId);
    if (!['bonus_eligible', 'probation_passed'].includes(referral.status)) {
      throw new RequestValidationError('Referral not eligible for bonus approval');
    }

    const payout = await this.prisma.referralBonusPayout.findFirst({
      where: { referralId: id, status: 'pending' },
    });
    if (!payout) throw new RequestValidationError('No pending bonus payout');

    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { companyId: referral.companyId, status: 'open', deletedAt: null },
      orderBy: { periodStart: 'desc' },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeReferral.update({
        where: { id },
        data: { status: 'bonus_approved', bonusApprovedAt: new Date() },
      });

      let payrollCycleId: string | null = null;
      let payrollItemId: string | null = null;
      if (cycle) {
        payrollCycleId = cycle.id;
        payrollItemId = randomUUID();
        await tx.payrollItem.create({
          data: {
            id: payrollItemId,
            payrollCycleId: cycle.id,
            employeeId: payout.employeeId,
            companyId: referral.companyId,
            itemType: 'referral',
            amount: payout.amount,
            sourceRefType: 'referral',
            sourceRefId: id,
            note: `โบนัสแนะนำเพื่อน (${referral.candidateName})`,
            createdBy: SYSTEM_ACTOR.userId,
            updatedBy: SYSTEM_ACTOR.userId,
          },
        });
      } else {
        this.logger.warn(`approveBonus: no open payroll cycle for company ${referral.companyId}`);
      }

      await tx.referralBonusPayout.update({
        where: { id: payout.id },
        data: {
          status: 'approved',
          approvedBy: actor.userId,
          payrollCycleId,
        },
      });
    });

    await this.audit.record(actor, { entityType: 'EmployeeReferral', entityId: id, action: 'approve_bonus' });
    if (this.telegram) await this.telegram.notifyBonusApproved(id);
    return this.get(actor, id);
  }

  async getReferralDashboardWidgets(actor: ActorContext, companyId: string) {
    await this.assertHrAccess(actor, companyId);
    const base = { companyId };
    const [pendingReferrals, eligibleReferrals, paidReferrals] = await Promise.all([
      this.prisma.employeeReferral.count({
        where: {
          ...base,
          status: { in: ['submitted', 'screening', 'interviewed', 'hired', 'probation'] },
        },
      }),
      this.prisma.employeeReferral.count({
        where: {
          ...base,
          status: { in: ['bonus_eligible', 'bonus_approved', 'probation_passed'] },
        },
      }),
      this.prisma.employeeReferral.count({
        where: { ...base, status: 'paid' },
      }),
    ]);
    return { pendingReferrals, eligibleReferrals, paidReferrals };
  }

  async markPaid(actor: ActorContext, id: string) {
    const referral = await this.get(actor, id);
    await this.assertHrAccess(actor, referral.companyId);
    const now = new Date();
    const payout = await this.prisma.referralBonusPayout.findFirst({
      where: { referralId: id, status: 'approved' },
    });
    if (!payout) throw new RequestValidationError('No approved bonus payout found');

    let payrollItemId: string | null = null;
    let payrollCycleId: string | null = null;

    if (this.referralPayroll) {
      payrollItemId = await this.referralPayroll.createReferralPayrollItem({
        referrerEmployeeId: referral.referrerEmployeeId,
        companyId: referral.companyId,
        amount: Number(payout.amount),
        referralId: id,
        actorUserId: actor.userId,
      });
      const item = await this.prisma.payrollItem.findUnique({
        where: { id: payrollItemId },
        select: { payrollCycleId: true },
      });
      payrollCycleId = item?.payrollCycleId ?? null;
    } else {
      const cycle = await this.prisma.payrollCycle.findFirst({
        where: {
          companyId: referral.companyId,
          status: { in: ['open', 'locked'] },
          deletedAt: null,
        },
        orderBy: { periodStart: 'desc' },
      });
      if (!cycle) {
        throw new RequestValidationError(
          `No open payroll cycle found for company ${referral.companyId}`,
        );
      }
      payrollItemId = randomUUID();
      payrollCycleId = cycle.id;
      await this.prisma.payrollItem.create({
        data: {
          id: payrollItemId,
          payrollCycleId: cycle.id,
          employeeId: referral.referrerEmployeeId,
          companyId: referral.companyId,
          itemType: 'referral',
          amount: new Prisma.Decimal(Number(payout.amount)),
          sourceRefType: 'referral',
          sourceRefId: id,
          note: `Referral reward — referral ${id}`,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeReferral.update({
        where: { id },
        data: { status: 'paid', paidAt: now },
      });
      await tx.referralBonusPayout.updateMany({
        where: { referralId: id, status: 'approved' },
        data: { status: 'paid', paidAt: now, payrollCycleId },
      });
    });
    await this.audit.record(actor, {
      entityType: 'EmployeeReferral',
      entityId: id,
      action: 'mark_paid',
      after: { payrollItemId, payrollCycleId },
    });
    if (this.telegram) await this.telegram.notifyBonusPaid(id);
    return this.get(actor, id);
  }

  private async assertHrAccess(actor: ActorContext, companyId: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole;
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new RequestForbiddenError();
  }

  private async assertCanViewReferral(
    actor: ActorContext,
    referral: { companyId: string; referrerEmployeeId: string },
  ) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === referral.referrerEmployeeId) return;
    await this.assertHrAccess(actor, referral.companyId);
  }
}

@Injectable()
export class ReferralProgramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async create(actor: ActorContext, dto: CreateReferralProgramDto) {
    if (dto.companyId) await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    await this.assertOwner(actor);
    const program = await this.prisma.referralProgram.create({
      data: {
        companyId: dto.companyId ?? null,
        name: dto.name,
        description: dto.description,
        bonusAmount: dto.bonusAmount,
        currency: dto.currency ?? 'THB',
        status: 'draft',
        createdBy: actor.userId,
      },
    });
    await this.audit.record(actor, { entityType: 'ReferralProgram', entityId: program.id, action: 'create', after: program });
    return program;
  }

  async list(actor: ActorContext, companyId?: string) {
    if (companyId) await this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.prisma.referralProgram.findMany({
      where: companyId ? { OR: [{ companyId }, { companyId: null }] } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(actor: ActorContext, id: string, dto: UpdateReferralProgramDto) {
    await this.assertOwner(actor);
    const updated = await this.prisma.referralProgram.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.bonusAmount !== undefined ? { bonusAmount: dto.bonusAmount } : {}),
        ...(dto.status !== undefined ? { status: dto.status as never } : {}),
      },
    });
    await this.audit.record(actor, { entityType: 'ReferralProgram', entityId: id, action: 'update', after: updated });
    return updated;
  }

  async archive(actor: ActorContext, id: string) {
    await this.assertOwner(actor);
    const updated = await this.prisma.referralProgram.update({
      where: { id },
      data: { status: 'archived' },
    });
    await this.audit.record(actor, { entityType: 'ReferralProgram', entityId: id, action: 'archive' });
    return updated;
  }

  private async assertOwner(actor: ActorContext) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.businessRole !== 'owner') throw new RequestForbiddenError('Owner only');
  }
}
