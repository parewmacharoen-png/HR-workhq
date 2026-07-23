// ============================================================================
// modules/attendance/application/absence-record.service.ts
// Manager review queue — approve, waive, dispute absence records.
// ============================================================================

import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FormulaResolverService } from '../../formula-engine/application/formula-resolver.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { LeaveSettingsService } from '../../settings/application/leave-settings.service';
import { AbsenceRecord, AbsenceRoleLevel } from '../domain/entities/absence-record.entity';
import { ABSENCE_REPOSITORY, AbsenceRepository } from '../domain/repositories/absence.repository';
import {
  AbsenceAlreadyApprovedError,
  AbsenceContactNotesRequiredError,
  AbsenceInvalidStatusError,
  AbsenceLinkedToLockedPayrollError,
  AbsenceRecordNotFoundError,
} from '../domain/errors/absence.errors';
import {
  resolveAbsencePenalty, validateContactNotes,
} from '../domain/services/absence-penalty.service';
import {
  AbsenceFlagResult,
  AbsenceListResponse,
  AbsenceRecordResponse,
  ApproveAbsenceDto,
  DisputeAbsenceDto,
  WaiveAbsenceDto,
} from './dto/absence.dto';
import { AbsenceFlagJob } from './absence-flag.job';
import { DateProvider } from '../../../shared/time/date.provider';

@Injectable()
export class AbsenceRecordService {
  constructor(
    @Inject(ABSENCE_REPOSITORY) private readonly absences: AbsenceRepository,
    private readonly leaveSettings: LeaveSettingsService,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly audit: AuditService,
    private readonly flagJob: AbsenceFlagJob,
    private readonly dates: DateProvider,
    @Optional() private readonly formulaResolver?: FormulaResolverService,
  ) {}

  async list(
    actor: ActorContext,
    query: {
      companyId: string;
      status?: string;
      from?: string;
      to?: string;
      employeeId?: string;
    },
  ): Promise<AbsenceListResponse> {
    await this.companyAccess.assertCompanyAccess(actor, query.companyId);
    const rows = await this.absences.list({
      companyId: query.companyId,
      status: query.status as AbsenceRecord['status'] | undefined,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      employeeId: query.employeeId,
    });
    const items = rows.map((row) => this.toResponse(row.record, row.employeeName, row.employeePosition));
    return { items, total: items.length };
  }

  async getById(actor: ActorContext, id: string): Promise<AbsenceRecordResponse> {
    const record = await this.absences.findById(id);
    if (!record) throw new AbsenceRecordNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, record.companyId);
    const emp = await this.prisma.employee.findFirst({
      where: { id: record.employeeId },
      select: { firstName: true, lastName: true, position: true },
    });
    const name = emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown';
    return this.toResponse(record, name, emp?.position ?? null);
  }

  async approve(actor: ActorContext, id: string, dto: ApproveAbsenceDto): Promise<AbsenceRecordResponse> {
    const record = await this.requireMutable(id, actor);
    if (record.status === 'approved') throw new AbsenceAlreadyApprovedError();
    if (!validateContactNotes(dto.contactNotes)) {
      throw new AbsenceContactNotesRequiredError();
    }

    const context = await this.loadPenaltyContext(record);
    const rules = await this.leaveSettings.getRules(record.companyId);
    const resolution = resolveAbsencePenalty({
      position: context.position,
      roleLevel: context.roleLevel,
      penalties: rules.absencePenalties,
    });

    let penaltyAmount = resolution.amount;
    if (!resolution.exempt && this.formulaResolver) {
      const resolved = await this.formulaResolver.resolveWithFallback(
        'attendance.absence_penalty',
        {
          companyId: record.companyId,
          entityType: 'AbsenceRecord',
          entityId: record.id,
          inputs: {
            absenceDays: 1,
            rolePenaltyRate: resolution.amount,
            employeeRole: 0,
          },
          executedBy: actor.userId,
        },
        () => resolution.amount,
      );
      penaltyAmount = resolved.value;
    }

    const now = this.dates.now();
    try {
      record.approve({
        actorUserId: actor.userId,
        at: now,
        contactAttemptedAt: new Date(dto.contactAttemptedAt),
        contactNotes: dto.contactNotes.trim(),
        roleLevelSnapshot: resolution.roleLevelSnapshot,
        positionSnapshot: context.position,
        penaltyAmount,
      });
    } catch (e) {
      if (record.payrollItemId) throw new AbsenceLinkedToLockedPayrollError();
      throw e;
    }

    await this.absences.save(record);
    await this.audit.record(actor, {
      entityType: 'AbsenceRecord',
      entityId: record.id,
      action: 'approve_absence',
      after: { ...record.toPersistence(), exempt: resolution.exempt },
    });
    return this.getById(actor, id);
  }

  async waive(actor: ActorContext, id: string, dto: WaiveAbsenceDto): Promise<AbsenceRecordResponse> {
    const record = await this.requireMutable(id, actor);
    const now = this.dates.now();
    try {
      record.waive({ actorUserId: actor.userId, at: now, reason: dto.reason.trim() });
    } catch {
      throw new AbsenceLinkedToLockedPayrollError();
    }
    await this.absences.save(record);
    await this.audit.record(actor, {
      entityType: 'AbsenceRecord',
      entityId: record.id,
      action: 'waive_absence',
      after: record.toPersistence(),
    });
    return this.getById(actor, id);
  }

  async dispute(actor: ActorContext, id: string, dto: DisputeAbsenceDto): Promise<AbsenceRecordResponse> {
    const record = await this.absences.findById(id);
    if (!record) throw new AbsenceRecordNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, record.companyId);
    if (record.status !== 'flagged' && record.status !== 'approved') {
      throw new AbsenceInvalidStatusError('Only flagged or approved absences can be disputed');
    }
    record.dispute({ at: this.dates.now(), reason: dto.reason.trim() });
    await this.absences.save(record);
    await this.audit.record(actor, {
      entityType: 'AbsenceRecord',
      entityId: record.id,
      action: 'dispute_absence',
      after: record.toPersistence(),
    });
    return this.getById(actor, id);
  }

  async runFlag(actor: ActorContext, companyId: string, workDate: string): Promise<AbsenceFlagResult> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const date = new Date(workDate);
    const result = await this.flagJob.runForCompany(companyId, date, this.dates.now());
    await this.audit.record(actor, {
      entityType: 'AbsenceRecord',
      entityId: randomUUID(),
      action: 'run_absence_flag',
      after: { companyId, workDate, ...result },
    });
    return result;
  }

  private async requireMutable(id: string, actor: ActorContext): Promise<AbsenceRecord> {
    const record = await this.absences.findById(id);
    if (!record) throw new AbsenceRecordNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, record.companyId);
    if (record.payrollItemId) throw new AbsenceLinkedToLockedPayrollError();
    return record;
  }

  private async loadPenaltyContext(record: AbsenceRecord): Promise<{
    position: string | null;
    roleLevel: AbsenceRoleLevel;
  }> {
    const emp = await this.prisma.employee.findFirst({
      where: { id: record.employeeId, deletedAt: null },
      select: { position: true },
    });
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId: record.employeeId,
        companyId: record.companyId,
        effectiveTo: null,
        deletedAt: null,
      },
      orderBy: { isPrimaryCompany: 'desc' },
    });
    const roleLevel = (assignment?.roleLevel ?? 'employee') as AbsenceRoleLevel;
    return { position: emp?.position ?? null, roleLevel };
  }

  private toResponse(
    record: AbsenceRecord,
    employeeName: string,
    position: string | null,
  ): AbsenceRecordResponse {
    const p = record.toPersistence();
    const pos = position ?? p.positionSnapshot;
    const exempt = pos?.trim().toLowerCase() === 'owner' || p.penaltyAmount === 0 && pos?.trim().toLowerCase() === 'owner';
    return {
      id: p.id,
      employeeId: p.employeeId,
      employeeName,
      companyId: p.companyId,
      workDate: p.workDate.toISOString().slice(0, 10),
      status: p.status,
      roleLevelSnapshot: p.roleLevelSnapshot,
      positionSnapshot: pos,
      penaltyAmount: p.penaltyAmount,
      penaltyExempt: exempt || (p.penaltyAmount === 0 && p.status === 'approved' && pos?.trim().toLowerCase() === 'owner'),
      contactAttemptedAt: p.contactAttemptedAt?.toISOString() ?? null,
      contactNotes: p.contactNotes,
      approvedAt: p.approvedAt?.toISOString() ?? null,
      approvedBy: p.approvedBy,
      waivedAt: p.waivedAt?.toISOString() ?? null,
      waiveReason: p.waiveReason,
      payrollItemId: p.payrollItemId,
      flaggedReason: p.flaggedReason,
    };
  }
}
