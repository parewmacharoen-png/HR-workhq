// ============================================================================
// CommissionDeclarationService
// ============================================================================

import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  CommissionDeclarationMethod,
  CommissionDeclarationStatus,
  CommissionDeclarationAssignmentType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  COMMISSION_DECLARATION_SIDE_EFFECTS,
  CommissionDeclarationSideEffects,
} from './commission-declaration-side-effects.port';
import {
  COMMISSION_SPLIT_EXPECTED_TOTAL,
  DeclarationAssignmentInput,
  isAssignmentComplete,
  splitPercentMismatch,
  validateAssignmentInputs,
} from '../domain/commission-declaration.types';

export interface DeclarationAssignmentResponse {
  id: string;
  companyId: string;
  companyName: string;
  teamId: string;
  teamName: string;
  assignmentType: string;
  commissionMethod: string;
  bigLeaderPercent: number | null;
  employeePercent: number | null;
  isComplete: boolean;
  splitMismatch: boolean;
}

export interface DeclarationResponse {
  id: string;
  employeeId: string;
  employeeName: string;
  globalId: string;
  companyId: string;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  assignments: DeclarationAssignmentResponse[];
  hasIncompleteMethod: boolean;
  hasSplitMismatch: boolean;
}

export interface DeclarationSummaryGroup {
  companyId: string;
  companyName: string;
  teamId: string;
  teamName: string;
  teamPool: DeclarationResponse[];
  bigLeaderSplit: DeclarationResponse[];
  none: DeclarationResponse[];
  unsure: DeclarationResponse[];
  incomplete: DeclarationResponse[];
  splitMismatch: DeclarationResponse[];
}

export interface DeclarationSummaryResponse {
  groups: DeclarationSummaryGroup[];
  warnings: string[];
}

const TRANSITIONS: Record<CommissionDeclarationStatus, CommissionDeclarationStatus[]> = {
  draft: ['submitted'],
  submitted: ['hr_review'],
  hr_review: ['approved', 'rejected'],
  approved: [],
  rejected: ['submitted'],
};

@Injectable()
export class CommissionDeclarationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    @Optional()
    @Inject(COMMISSION_DECLARATION_SIDE_EFFECTS)
    private readonly sideEffects?: CommissionDeclarationSideEffects,
  ) {}

  async createSubmittedDeclaration(
    actorUserId: string,
    employeeId: string,
    primaryCompanyId: string,
    assignments: DeclarationAssignmentInput[],
  ): Promise<DeclarationResponse> {
    const error = validateAssignmentInputs(assignments);
    if (error) throw new BadRequestException(error);

    const declarationId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.commissionDeclaration.create({
        data: {
          id: declarationId,
          employeeId,
          companyId: primaryCompanyId,
          status: 'submitted',
          submittedAt: new Date(),
          createdBy: actorUserId,
          updatedBy: actorUserId,
          assignments: {
            create: assignments.map((a, idx) => ({
              id: randomUUID(),
              companyId: a.companyId,
              teamId: a.teamId,
              assignmentType: a.assignmentType as CommissionDeclarationAssignmentType,
              commissionMethod: a.commissionMethod as CommissionDeclarationMethod,
              bigLeaderPercent: a.bigLeaderPercent ?? undefined,
              employeePercent: a.employeePercent ?? undefined,
              sortOrder: idx,
            })),
          },
        },
      });
    });

    await this.audit.record(
      { userId: actorUserId, companyId: primaryCompanyId } as ActorContext,
      {
        entityType: 'CommissionDeclaration',
        entityId: declarationId,
        action: 'submit',
        after: { status: 'submitted', employeeId, assignmentCount: assignments.length },
      },
    );

    return this.getDeclaration(declarationId);
  }

  async resubmitDeclaration(
    actorUserId: string,
    employeeId: string,
    declarationId: string,
    assignments: DeclarationAssignmentInput[],
  ): Promise<DeclarationResponse> {
    const error = validateAssignmentInputs(assignments);
    if (error) throw new BadRequestException(error);

    const row = await this.prisma.commissionDeclaration.findFirst({
      where: { id: declarationId, employeeId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Declaration not found');
    if (row.status !== 'rejected') {
      throw new BadRequestException('Only rejected declarations can be resubmitted');
    }

    const primaryCount = assignments.filter((a) => a.assignmentType === 'primary').length;
    if (primaryCount !== 1) throw new BadRequestException('Exactly one PRIMARY assignment is required');

    const primaryCompanyId = assignments.find((a) => a.assignmentType === 'primary')!.companyId;

    await this.prisma.$transaction(async (tx) => {
      await tx.commissionDeclarationAssignment.updateMany({
        where: { declarationId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      await tx.commissionDeclaration.update({
        where: { id: declarationId },
        data: {
          companyId: primaryCompanyId,
          status: 'submitted',
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedBy: null,
          rejectReason: null,
          updatedBy: actorUserId,
        },
      });

      await tx.commissionDeclarationAssignment.createMany({
        data: assignments.map((a, idx) => ({
          id: randomUUID(),
          declarationId,
          companyId: a.companyId,
          teamId: a.teamId,
          assignmentType: a.assignmentType as CommissionDeclarationAssignmentType,
          commissionMethod: a.commissionMethod as CommissionDeclarationMethod,
          bigLeaderPercent: a.bigLeaderPercent ?? undefined,
          employeePercent: a.employeePercent ?? undefined,
          sortOrder: idx,
        })),
      });
    });

    await this.audit.record(
      { userId: actorUserId, companyId: primaryCompanyId } as ActorContext,
      {
        entityType: 'CommissionDeclaration',
        entityId: declarationId,
        action: 'resubmit',
        before: { status: 'rejected' },
        after: { status: 'submitted', assignmentCount: assignments.length },
      },
    );

    return this.getDeclaration(declarationId);
  }

  async getLatestRejectedDeclaration(employeeId: string): Promise<DeclarationResponse | null> {
    const row = await this.prisma.commissionDeclaration.findFirst({
      where: { employeeId, status: 'rejected', deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: this.declarationInclude(),
    });
    return row ? this.toResponse(row) : null;
  }

  async list(actor: ActorContext, companyId: string, status?: string): Promise<DeclarationResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.prisma.commissionDeclaration.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(status ? { status: status as CommissionDeclarationStatus } : {}),
      },
      include: this.declarationInclude(),
      orderBy: { submittedAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getSummary(actor: ActorContext, companyId: string): Promise<DeclarationSummaryResponse> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.prisma.commissionDeclaration.findMany({
      where: {
        deletedAt: null,
        status: { in: ['submitted', 'hr_review', 'approved'] },
        assignments: { some: { companyId, deletedAt: null } },
      },
      include: this.declarationInclude(),
    });

    const groupMap = new Map<string, DeclarationSummaryGroup>();
    const warnings = new Set<string>();

    for (const row of rows) {
      const decl = this.toResponse(row);
      if (decl.hasIncompleteMethod) warnings.add('Some employees have incomplete commission methods');
      if (decl.hasSplitMismatch) warnings.add('Some BIG_LEADER_SPLIT declarations do not total 100%');

      for (const assignment of decl.assignments.filter((a) => a.companyId === companyId)) {
        const key = `${assignment.companyId}:${assignment.teamId}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            companyId: assignment.companyId,
            companyName: assignment.companyName,
            teamId: assignment.teamId,
            teamName: assignment.teamName,
            teamPool: [],
            bigLeaderSplit: [],
            none: [],
            unsure: [],
            incomplete: [],
            splitMismatch: [],
          });
        }
        const group = groupMap.get(key)!;
        if (!assignment.isComplete || assignment.commissionMethod === 'unsure') {
          if (!assignment.isComplete) group.incomplete.push(decl);
          else group.unsure.push(decl);
          continue;
        }
        if (assignment.splitMismatch) group.splitMismatch.push(decl);
        switch (assignment.commissionMethod) {
          case 'team_pool': group.teamPool.push(decl); break;
          case 'big_leader_split': group.bigLeaderSplit.push(decl); break;
          case 'none': group.none.push(decl); break;
          default: group.unsure.push(decl); break;
        }
      }
    }

    return {
      groups: [...groupMap.values()].sort((a, b) => a.teamName.localeCompare(b.teamName)),
      warnings: [...warnings],
    };
  }

  async hrReview(actor: ActorContext, id: string): Promise<DeclarationResponse> {
    return this.transitionStatus(actor, id, 'hr_review');
  }

  async approve(actor: ActorContext, id: string): Promise<DeclarationResponse> {
    return this.transitionStatus(actor, id, 'approved');
  }

  async reject(actor: ActorContext, id: string, reason: string): Promise<DeclarationResponse> {
    const trimmed = reason?.trim();
    if (!trimmed) throw new BadRequestException('Reject reason is required');
    return this.transitionStatus(actor, id, 'rejected', trimmed);
  }

  async transitionStatus(
    actor: ActorContext,
    id: string,
    status: CommissionDeclarationStatus,
    rejectReason?: string,
  ): Promise<DeclarationResponse> {
    const row = await this.prisma.commissionDeclaration.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Declaration not found');
    await this.companyAccess.assertCompanyAccess(actor, row.companyId);

    const allowed = TRANSITIONS[row.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot transition from ${row.status} to ${status}`);
    }

    await this.prisma.commissionDeclaration.update({
      where: { id },
      data: {
        status,
        reviewedAt: ['approved', 'rejected', 'hr_review'].includes(status) ? new Date() : undefined,
        reviewedBy: actor.userId,
        rejectReason: status === 'rejected' ? rejectReason ?? null : null,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'CommissionDeclaration',
      entityId: id,
      action: `status_${status}`,
      before: { status: row.status, rejectReason: row.rejectReason },
      after: { status, rejectReason: status === 'rejected' ? rejectReason : null },
    });

    if (status === 'rejected' && rejectReason) {
      await this.sideEffects?.onRejected(row.employeeId, rejectReason);
    }

    return this.getDeclaration(id);
  }

  async getApprovedAssignmentMap(
    companyId: string,
    teamId: string,
    employeeIds: string[],
  ): Promise<Map<string, {
    commissionMethod: CommissionDeclarationMethod;
    bigLeaderPercent: number | null;
    employeePercent: number | null;
  }>> {
    if (employeeIds.length === 0) return new Map();

    const rows = await this.prisma.commissionDeclarationAssignment.findMany({
      where: {
        companyId,
        teamId,
        deletedAt: null,
        declaration: {
          status: 'approved',
          deletedAt: null,
          employeeId: { in: employeeIds },
        },
      },
      include: { declaration: { select: { employeeId: true } } },
    });

    const map = new Map<string, {
      commissionMethod: CommissionDeclarationMethod;
      bigLeaderPercent: number | null;
      employeePercent: number | null;
    }>();
    for (const row of rows) {
      map.set(row.declaration.employeeId, {
        commissionMethod: row.commissionMethod,
        bigLeaderPercent: row.bigLeaderPercent != null ? Number(row.bigLeaderPercent) : null,
        employeePercent: row.employeePercent != null ? Number(row.employeePercent) : null,
      });
    }
    return map;
  }

  private async getDeclaration(id: string): Promise<DeclarationResponse> {
    const row = await this.prisma.commissionDeclaration.findFirst({
      where: { id, deletedAt: null },
      include: this.declarationInclude(),
    });
    if (!row) throw new NotFoundException('Declaration not found');
    return this.toResponse(row);
  }

  private declarationInclude() {
    return {
      employee: { select: { id: true, globalId: true, firstName: true, lastName: true } },
      assignments: {
        where: { deletedAt: null },
        include: {
          company: { select: { id: true, name: true, code: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private toResponse(row: {
    id: string;
    employeeId: string;
    companyId: string;
    status: CommissionDeclarationStatus;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    rejectReason: string | null;
    employee: { globalId: string; firstName: string; lastName: string };
    assignments: Array<{
      id: string;
      companyId: string;
      teamId: string;
      assignmentType: CommissionDeclarationAssignmentType;
      commissionMethod: CommissionDeclarationMethod;
      bigLeaderPercent: unknown;
      employeePercent: unknown;
      company: { name: string };
      team: { name: string };
    }>;
  }): DeclarationResponse {
    const assignments: DeclarationAssignmentResponse[] = row.assignments.map((a) => {
      const bigLeaderPercent = a.bigLeaderPercent != null ? Number(a.bigLeaderPercent) : null;
      const employeePercent = a.employeePercent != null ? Number(a.employeePercent) : null;
      const complete = isAssignmentComplete({
        commissionMethod: a.commissionMethod,
        bigLeaderPercent,
        employeePercent,
      });
      const mismatch = a.commissionMethod === 'big_leader_split'
        && splitPercentMismatch(bigLeaderPercent, employeePercent, COMMISSION_SPLIT_EXPECTED_TOTAL);
      return {
        id: a.id,
        companyId: a.companyId,
        companyName: a.company.name,
        teamId: a.teamId,
        teamName: a.team.name,
        assignmentType: a.assignmentType,
        commissionMethod: a.commissionMethod,
        bigLeaderPercent,
        employeePercent,
        isComplete: complete,
        splitMismatch: mismatch,
      };
    });

    return {
      id: row.id,
      employeeId: row.employeeId,
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
      globalId: row.employee.globalId,
      companyId: row.companyId,
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      rejectReason: row.rejectReason,
      assignments,
      hasIncompleteMethod: assignments.some((a) => !a.isComplete),
      hasSplitMismatch: assignments.some((a) => a.splitMismatch),
    };
  }
}
