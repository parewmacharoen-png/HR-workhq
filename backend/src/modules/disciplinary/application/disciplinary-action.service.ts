// ============================================================================
// modules/disciplinary/application/disciplinary-action.service.ts
// POL-025 — DISC-001–005 disciplinary foundation
// ============================================================================

import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
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
import { EmployeeNotFoundError } from '../../employee/domain/errors/employee.errors';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { resolveDepartmentRoute } from '../../exit/domain/services/exit-reason-policy.service';
import {
  DisciplinaryAcknowledgeForbiddenError,
  DisciplinaryActionNotFoundError,
  DisciplinaryAlreadyAcknowledgedError,
  DisciplinaryForbiddenError,
  DisciplinaryTerminationReasonRequiredError,
} from '../domain/errors/disciplinary.errors';
import {
  CreateDisciplinaryActionDto,
  DisciplinaryActionResponse,
  DisciplinaryActionType,
  DisciplinaryListResponse,
  DisciplinarySummaryResponse,
} from './dto/disciplinary.dto';
import { DisciplinaryTelegramNotifier } from './disciplinary-telegram.notifier';
import { ExitCaseService } from '../../exit/application/exit-case.service';
import { ExitCaseAlreadyOpenError } from '../../exit/domain/errors/exit.errors';

@Injectable()
export class DisciplinaryActionService {
  constructor(
    @Inject(EMPLOYEE_REPOSITORY) private readonly employees: EmployeeRepository,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly audit: AuditService,
    @Optional() @Inject(forwardRef(() => DisciplinaryTelegramNotifier))
    private readonly telegram?: DisciplinaryTelegramNotifier,
    @Optional() @Inject(forwardRef(() => ExitCaseService))
    private readonly exitCases?: ExitCaseService,
  ) {}

  async createAction(
    actor: ActorContext,
    employeeId: string,
    dto: CreateDisciplinaryActionDto,
  ): Promise<DisciplinaryActionResponse> {
    await this.assertCanCreate(actor, employeeId, dto.companyId);

    const employee = await this.employees.findById(employeeId);
    if (!employee) throw new EmployeeNotFoundError(employeeId);

    if (dto.actionType === 'termination' && !dto.terminationReason?.trim()) {
      throw new DisciplinaryTerminationReasonRequiredError();
    }

    const id = randomUUID();
    const row = await this.prisma.disciplinaryAction.create({
      data: {
        id,
        employeeId,
        companyId: dto.companyId,
        actionType: dto.actionType,
        reason: dto.reason,
        details: dto.details ?? null,
        evidenceUrl: dto.evidenceUrl ?? null,
        terminationReason: dto.actionType === 'termination' ? (dto.terminationReason ?? null) : null,
        terminationNote: dto.actionType === 'termination' ? (dto.terminationNote ?? null) : null,
        issuedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'DisciplinaryAction',
      entityId: id,
      action: 'create',
      after: row,
    });

    const response = await this.toResponse(row);
    if (this.telegram) {
      await this.telegram.notifyEmployee(response).catch(() => undefined);
    }

    if (dto.actionType === 'termination' && this.exitCases) {
      try {
        await this.exitCases.create(actor, employeeId, {
          companyId: dto.companyId,
          exitReason: 'gross_misconduct',
          effectiveTerminationDate: new Date().toISOString().slice(0, 10),
          notes: dto.terminationReason ?? dto.reason,
          sourceType: 'disciplinary_action',
          sourceId: id,
        });
      } catch (err) {
        if (!(err instanceof ExitCaseAlreadyOpenError)) throw err;
      }
    }

    return response;
  }

  async acknowledgeAction(
    actor: ActorContext,
    actionId: string,
  ): Promise<DisciplinaryActionResponse> {
    const row = await this.prisma.disciplinaryAction.findFirst({
      where: { id: actionId, deletedAt: null },
    });
    if (!row) throw new DisciplinaryActionNotFoundError(actionId);

    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId !== row.employeeId) {
      throw new DisciplinaryAcknowledgeForbiddenError();
    }
    if (row.acknowledgedAt) {
      throw new DisciplinaryAlreadyAcknowledgedError();
    }

    const now = new Date();
    const updated = await this.prisma.disciplinaryAction.update({
      where: { id: actionId },
      data: {
        acknowledgedBy: actor.userId,
        acknowledgedAt: now,
      },
    });

    await this.audit.record(actor, {
      entityType: 'DisciplinaryAction',
      entityId: actionId,
      action: 'acknowledge',
      before: row,
      after: updated,
    });

    return this.toResponse(updated);
  }

  /** Used by Telegram callback — actor is the employee user */
  async acknowledgeFromTelegram(userId: string, actionId: string): Promise<DisciplinaryActionResponse> {
    return this.acknowledgeAction(
      { userId, impersonatorUserId: null, companyId: null },
      actionId,
    );
  }

  async getById(actor: ActorContext, actionId: string): Promise<DisciplinaryActionResponse> {
    const row = await this.prisma.disciplinaryAction.findFirst({
      where: { id: actionId, deletedAt: null },
    });
    if (!row) throw new DisciplinaryActionNotFoundError(actionId);
    await this.assertCanRead(actor, row.employeeId, row.companyId);
    return this.toResponse(row);
  }

  async listEmployeeActions(
    actor: ActorContext,
    employeeId: string,
    companyId?: string,
  ): Promise<DisciplinaryListResponse> {
    const resolvedCompanyId = companyId ?? await this.resolvePrimaryCompanyId(employeeId);
    await this.assertCanRead(actor, employeeId, resolvedCompanyId);

    const rows = await this.prisma.disciplinaryAction.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    const items = await Promise.all(rows.map((r) => this.toResponse(r)));
    return {
      summary: this.buildSummary(employeeId, rows),
      items,
    };
  }

  async getEmployeeDisciplinarySummary(
    actor: ActorContext,
    employeeId: string,
    companyId?: string,
  ): Promise<DisciplinarySummaryResponse> {
    const list = await this.listEmployeeActions(actor, employeeId, companyId);
    return list.summary;
  }

  private buildSummary(
    employeeId: string,
    rows: Array<{ actionType: string; acknowledgedAt: Date | null; createdAt: Date }>,
  ): DisciplinarySummaryResponse {
    const count = (type: string) => rows.filter((r) => r.actionType === type).length;
    const latest = rows.length ? rows[rows.length - 1] : null;
    return {
      employeeId,
      verbalWarningCount: count('verbal_warning'),
      warning1Count: count('warning_1'),
      warning2Count: count('warning_2'),
      terminationCount: count('termination'),
      latestActionType: latest?.actionType as DisciplinaryActionType | null ?? null,
      latestActionAt: latest?.createdAt.toISOString() ?? null,
      unacknowledgedCount: rows.filter((r) => !r.acknowledgedAt).length,
      warningsNeverExpire: true,
    };
  }

  private async assertCanCreate(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorBusinessRole(actor.userId);
    if (role === 'owner') return;

    const employee = await this.employees.findById(employeeId);
    if (!employee) throw new EmployeeNotFoundError(employeeId);
    const route = resolveDepartmentRoute(employee.toPersistence().department);

    if (route === 'marketing') {
      if (role === 'big_leader') return;
    } else if (role === 'secretary') return;

    throw new DisciplinaryForbiddenError();
  }

  private async assertCanRead(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === employeeId) return;

    await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorBusinessRole(actor.userId);
    if (role === 'owner') return;

    const employee = await this.employees.findById(employeeId);
    if (!employee) throw new EmployeeNotFoundError(employeeId);
    const route = resolveDepartmentRoute(employee.toPersistence().department);

    if (route === 'marketing') {
      if (role === 'big_leader') return;
    } else if (role === 'secretary') return;

    throw new DisciplinaryForbiddenError();
  }

  private async actorBusinessRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }

  private async resolvePrimaryCompanyId(employeeId: string): Promise<string> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null, isPrimaryCompany: true },
      select: { companyId: true },
    });
    if (!assignment) {
      const any = await this.prisma.employeeAssignment.findFirst({
        where: { employeeId, effectiveTo: null, deletedAt: null },
        select: { companyId: true },
      });
      if (!any) throw new EmployeeNotFoundError(employeeId);
      return any.companyId;
    }
    return assignment.companyId;
  }

  private async toResponse(row: {
    id: string;
    employeeId: string;
    companyId: string;
    actionType: string;
    reason: string;
    details: string | null;
    evidenceUrl: string | null;
    terminationReason: string | null;
    terminationNote: string | null;
    issuedBy: string;
    acknowledgedBy: string | null;
    acknowledgedAt: Date | null;
    createdAt: Date;
  }): Promise<DisciplinaryActionResponse> {
    const issuer = await this.prisma.user.findFirst({
      where: { id: row.issuedBy },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    const issuerName = issuer?.employee
      ? `${issuer.employee.firstName} ${issuer.employee.lastName}`.trim()
      : issuer?.username ?? null;

    return {
      id: row.id,
      employeeId: row.employeeId,
      companyId: row.companyId,
      actionType: row.actionType as DisciplinaryActionType,
      reason: row.reason,
      details: row.details,
      evidenceUrl: row.evidenceUrl,
      terminationReason: row.terminationReason,
      terminationNote: row.terminationNote,
      issuedBy: row.issuedBy,
      issuerName,
      acknowledgedBy: row.acknowledgedBy,
      acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      acknowledged: row.acknowledgedAt != null,
    };
  }
}
