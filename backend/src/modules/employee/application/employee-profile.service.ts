// ============================================================================
// EMP-015 — Editable employee profile & safe delete controls
// ============================================================================

import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EmployeeChangeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeNotFoundError } from '../domain/errors/employee.errors';
import { EmployeeProfileAccessService } from './employee-profile-access.service';
import { EmployeeAccessService } from './employee-access.service';
import { AccessControlService } from '../../permission/application/access-control.service';
import {
  ArchiveEmployeeDto,
  CreateProfileChangeRequestDto,
  HardDeleteEmployeeDto,
  RestoreEmployeeDto,
  SalaryDirectEditDto,
  UpdateEmployeeAccessDto,
  UpdateEmployeePayrollInfoDto,
  UpdateEmployeeProfileDto,
} from './dto/employee-profile.dto';
import { DateProvider } from '../../../shared/time/date.provider';
import { resolveInitialSalaryEffectiveDate } from '../../payroll/domain/services/salary-band-employment.util';
import { PayrollBuilderService } from '../../payroll/application/payroll-builder.service';

const THAI_PHONE = /^0[0-9]{8,9}$/;

@Injectable()
export class EmployeeProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: EmployeeProfileAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly accessControl: AccessControlService,
    private readonly dates: DateProvider,
    @Inject(forwardRef(() => PayrollBuilderService))
    private readonly payrollBuilder: PayrollBuilderService,
  ) {}

  async getFullProfile(actor: ActorContext, employeeId: string) {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const row = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: {
        bankAccounts: { where: { deletedAt: null, isPrimary: true }, take: 1 },
        assignments: {
          where: { effectiveTo: null, deletedAt: null },
          include: { company: true, team: true },
        },
        users: { take: 1, select: { id: true, username: true } },
      },
    });
    if (!row) throw new EmployeeNotFoundError(employeeId);
    const primaryAssignment = row.assignments.find((a) => a.isPrimaryCompany) ?? row.assignments[0];
    const bank = row.bankAccounts[0];
    return {
      id: row.id,
      globalId: row.globalId,
      firstName: row.firstName,
      lastName: row.lastName,
      nickname: row.nickname,
      phone: row.phone,
      email: row.email,
      lineId: row.lineId,
      address: row.address,
      dateOfBirth: row.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      emergencyContactName: row.emergencyContactName,
      emergencyContactRelationship: row.emergencyContactRelationship,
      emergencyContactPhone: row.emergencyContactPhone,
      department: row.department,
      position: row.position,
      positionDefinitionId: row.positionDefinitionId,
      positionFamilyId: row.positionFamilyId,
      positionLevelId: row.positionLevelId,
      employmentType: row.employmentType,
      employmentStatus: row.employmentStatus,
      hireDate: row.hireDate.toISOString().slice(0, 10),
      probationEndDate: row.probationEndDate?.toISOString().slice(0, 10) ?? null,
      workCategory: row.workCategory,
      companyId: primaryAssignment?.companyId ?? null,
      companyName: primaryAssignment?.company?.name ?? null,
      teamId: primaryAssignment?.teamId ?? null,
      teamName: primaryAssignment?.team?.name ?? null,
      username: row.users[0]?.username ?? null,
      bankCode: bank?.bankCode ?? null,
      bankAccountNo: bank?.accountNo ?? null,
      bankAccountName: bank?.accountName ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      archiveReason: row.archiveReason,
      terminationDate: row.terminationDate?.toISOString().slice(0, 10) ?? null,
      nationalIdMasked: row.nationalId ? maskNationalId(row.nationalId) : null,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  async updateProfile(actor: ActorContext, employeeId: string, dto: UpdateEmployeeProfileDto) {
    const companyId = await this.access.assertOwnerOrSecretary(actor, employeeId);
    const before = await this.prisma.employee.findFirstOrThrow({ where: { id: employeeId } });

    if (dto.phone && !THAI_PHONE.test(dto.phone.replace(/\s/g, ''))) {
      throw new Error('Invalid Thai phone format');
    }
    if (dto.emergencyContactPhone && !THAI_PHONE.test(dto.emergencyContactPhone.replace(/\s/g, ''))) {
      throw new Error('Invalid emergency phone format');
    }
    if (dto.dateOfBirth && new Date(dto.dateOfBirth) > new Date()) {
      throw new Error('Date of birth cannot be in the future');
    }

    const update: Prisma.EmployeeUpdateInput = { updatedBy: actor.userId };
    if (dto.fullName) {
      const parts = dto.fullName.trim().split(/\s+/);
      update.firstName = parts[0];
      update.lastName = parts.slice(1).join(' ') || parts[0];
    }
    if (dto.nickname !== undefined) update.nickname = dto.nickname;
    if (dto.phone !== undefined) update.phone = dto.phone;
    if (dto.email !== undefined) update.email = dto.email;
    if (dto.lineId !== undefined) update.lineId = dto.lineId;
    if (dto.address !== undefined) update.address = dto.address;
    if (dto.dateOfBirth) update.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.emergencyContactName !== undefined) update.emergencyContactName = dto.emergencyContactName;
    if (dto.emergencyContactRelationship !== undefined) {
      update.emergencyContactRelationship = dto.emergencyContactRelationship;
    }
    if (dto.emergencyContactPhone !== undefined) update.emergencyContactPhone = dto.emergencyContactPhone;

    const after = await this.prisma.employee.update({ where: { id: employeeId }, data: update });
    await this.recordChanges(actor, employeeId, companyId, 'profile', before, after, dto.reason);
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_profile_updated',
      before: this.profileSnapshot(before),
      after: this.profileSnapshot(after),
    });
    return this.getFullProfile(actor, employeeId);
  }

  async updatePayrollInfo(actor: ActorContext, employeeId: string, dto: UpdateEmployeePayrollInfoDto) {
    const companyId = await this.access.assertPayrollEdit(actor, employeeId);
    const beforeBank = await this.prisma.employeeBankAccount.findFirst({
      where: { employeeId, isPrimary: true, deletedAt: null },
    });

    if (dto.bankAccountNumber && !/^\d+$/.test(dto.bankAccountNumber)) {
      throw new Error('Bank account must be numeric');
    }

    if (dto.bankAccountNumber && dto.bankAccountHolder) {
      if (beforeBank) {
        await this.prisma.employeeBankAccount.update({
          where: { id: beforeBank.id },
          data: { deletedAt: new Date(), deletedBy: actor.userId },
        });
      }
      await this.prisma.employeeBankAccount.create({
        data: {
          id: randomUUID(),
          employeeId,
          bankCode: (dto.bankName ?? 'UNKNOWN').slice(0, 20),
          accountNo: dto.bankAccountNumber,
          accountName: dto.bankAccountHolder,
          isPrimary: true,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
    }

    await this.recordFieldChange(actor, employeeId, companyId, 'payroll', 'bankAccount', beforeBank, dto, dto.reason);
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_payroll_info_updated',
      after: { reason: dto.reason },
    });
    return this.getFullProfile(actor, employeeId);
  }

  async salaryDirectEdit(actor: ActorContext, employeeId: string, dto: SalaryDirectEditDto) {
    if (dto.confirmation !== 'CONFIRM') {
      throw new Error('Confirmation required — send confirmation: CONFIRM');
    }
    const companyId = await this.access.assertPayrollEdit(actor, employeeId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { hireDate: true },
    });
    const priorBandCount = await this.prisma.salaryHistory.count({
      where: { employeeId, companyId, deletedAt: null },
    });
    const salaryEffectiveFrom = resolveInitialSalaryEffectiveDate(
      new Date(dto.effectiveDate),
      employee?.hireDate,
      priorBandCount > 0,
    );
    const dayBefore = this.dates.addDays(salaryEffectiveFrom, -1);

    await this.prisma.$transaction(async (tx) => {
      const openBands = await tx.salaryHistory.findMany({
        where: {
          employeeId,
          companyId,
          deletedAt: null,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: salaryEffectiveFrom } }],
        },
      });
      for (const band of openBands) {
        if (band.effectiveFrom >= salaryEffectiveFrom) continue;
        await tx.salaryHistory.update({
          where: { id: band.id },
          data: { effectiveTo: dayBefore, updatedBy: actor.userId },
        });
      }
      await tx.salaryHistory.create({
        data: {
          employeeId,
          companyId,
          monthlySalary: dto.salaryAmount,
          effectiveFrom: salaryEffectiveFrom,
          reason: dto.reason,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
    });

    await this.recordFieldChange(actor, employeeId, companyId, 'salary', 'monthlySalary', null, dto.salaryAmount, dto.reason);
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_salary_direct_edited',
      after: { salaryAmount: dto.salaryAmount, effectiveDate: salaryEffectiveFrom.toISOString().slice(0, 10), reason: dto.reason },
    });
    await this.payrollBuilder.syncEmployeeInOpenCycles(actor, employeeId, companyId);
    return this.getFullProfile(actor, employeeId);
  }

  async updateAccess(actor: ActorContext, employeeId: string, dto: UpdateEmployeeAccessDto) {
    await this.access.assertOwner(actor);
    const companyId = await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null },
    });
    if (!user) throw new Error('Employee has no linked user account');

    if (dto.businessRole) {
      await this.accessControl.assignBusinessRole(actor, user.id, {
        role: dto.businessRole as never,
        reason: dto.reason,
      });
    }

    await this.recordFieldChange(actor, employeeId, companyId, 'access', 'businessRole', null, dto.businessRole, dto.reason);
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_access_updated',
      after: { reason: dto.reason },
    });
    return { ok: true };
  }

  async archive(actor: ActorContext, employeeId: string, dto: ArchiveEmployeeDto) {
    const companyId = await this.access.assertOwnerOrSecretary(actor, employeeId);
    const row = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        archivedAt: new Date(),
        archivedBy: actor.userId,
        archiveReason: dto.reason,
        employmentStatus: 'suspended',
        updatedBy: actor.userId,
      },
    });
    await this.recordFieldChange(actor, employeeId, companyId, 'archive', 'archivedAt', null, row.archivedAt, dto.reason);
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_archived',
      after: { reason: dto.reason },
    });
    return this.getFullProfile(actor, employeeId);
  }

  async restore(actor: ActorContext, employeeId: string, dto: RestoreEmployeeDto) {
    const companyId = await this.access.assertOwnerOrSecretary(actor, employeeId);
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
        restoredAt: new Date(),
        restoredBy: actor.userId,
        restoreReason: dto.reason,
        employmentStatus: 'active',
        updatedBy: actor.userId,
      },
    });
    await this.recordFieldChange(actor, employeeId, companyId, 'restore', 'archivedAt', true, false, dto.reason);
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_restored',
      after: { reason: dto.reason },
    });
    return this.getFullProfile(actor, employeeId);
  }

  async hardDeleteDraft(actor: ActorContext, employeeId: string, dto: HardDeleteEmployeeDto) {
    await this.access.assertOwner(actor);
    if (dto.confirmation !== 'DELETE EMPLOYEE') {
      throw new Error('Typed confirmation DELETE EMPLOYEE required');
    }

    const employee = await this.prisma.employee.findFirstOrThrow({ where: { id: employeeId } });
    if (employee.employmentStatus !== 'probation' && employee.hireDate) {
      const hasAssignment = await this.prisma.employeeAssignment.count({
        where: { employeeId, deletedAt: null },
      });
      if (hasAssignment > 0) {
        throw new Error('Cannot hard delete active employee — use archive or exit workflow');
      }
    }

    const blockers = await Promise.all([
      this.prisma.payrollItem.count({ where: { employeeId } }),
      this.prisma.attendanceRecord.count({ where: { employeeId } }),
      this.prisma.leaveRequest.count({ where: { employeeId } }),
      this.prisma.employeeDocument.count({ where: { employeeId, deletedAt: null } }),
    ]);
    if (blockers.some((n) => n > 0)) {
      throw new Error('Employee has payroll/attendance/leave/documents/workflow records — hard delete blocked');
    }

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { deletedAt: new Date(), deletedBy: actor.userId, updatedBy: actor.userId },
    });
    await this.recordFieldChange(actor, employeeId, null, 'delete', 'deletedAt', null, new Date(), dto.reason);
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_draft_deleted',
      after: { reason: dto.reason },
    });
    return { ok: true, id: employeeId };
  }

  async getChangeHistory(actor: ActorContext, employeeId: string) {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    return this.prisma.employeeChangeHistory.findMany({
      where: { employeeId },
      orderBy: { changedAt: 'desc' },
      take: 200,
    });
  }

  async getAudit(actor: ActorContext, employeeId: string) {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    return this.prisma.auditLog.findMany({
      where: { entityType: 'Employee', entityId: employeeId },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
  }

  async createProfileChangeRequest(actor: ActorContext, employeeId: string, dto: CreateProfileChangeRequestDto) {
    const companyId = await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const access = await this.prisma.user.findFirst({ where: { id: actor.userId }, select: { employeeId: true } });
    if (access?.employeeId !== employeeId) {
      throw new Error('Employees can only request changes for their own profile');
    }
    const row = await this.prisma.employeeProfileChangeRequest.create({
      data: {
        employeeId,
        companyId,
        requestedByUserId: actor.userId,
        requestedFieldsJson: dto as Prisma.InputJsonValue,
        status: 'pending',
      },
    });
    await this.audit.record(actor, {
      entityType: 'EmployeeProfileChangeRequest',
      entityId: row.id,
      action: 'employee_change_requested',
    });
    return row;
  }

  async approveProfileChangeRequest(actor: ActorContext, requestId: string) {
    const req = await this.prisma.employeeProfileChangeRequest.findUniqueOrThrow({ where: { id: requestId } });
    await this.access.assertOwnerOrSecretary(actor, req.employeeId);
    if (req.status !== 'pending') throw new Error('Request not pending');

    await this.updateProfile(actor, req.employeeId, {
      ...(req.requestedFieldsJson as UpdateEmployeeProfileDto),
      reason: 'Approved profile change request',
    });

    return this.prisma.employeeProfileChangeRequest.update({
      where: { id: requestId },
      data: { status: 'approved', reviewedBy: actor.userId, reviewedAt: new Date() },
    });
  }

  private profileSnapshot(row: {
    firstName: string; lastName: string; nickname: string | null; phone: string | null;
    email: string | null; lineId: string | null; address: string | null;
  }) {
    return {
      firstName: row.firstName,
      lastName: row.lastName,
      nickname: row.nickname,
      phone: row.phone,
      email: row.email,
      lineId: row.lineId,
      address: row.address,
    };
  }

  private async recordChanges(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    changeType: EmployeeChangeType,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    reason?: string,
  ) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const b = (before as Record<string, unknown>)[key];
      const a = (after as Record<string, unknown>)[key];
      if (JSON.stringify(b) === JSON.stringify(a)) continue;
      await this.recordFieldChange(actor, employeeId, companyId, changeType, key, b, a, reason);
    }
  }

  private async recordFieldChange(
    actor: ActorContext,
    employeeId: string,
    companyId: string | null,
    changeType: EmployeeChangeType,
    fieldName: string,
    before: unknown,
    after: unknown,
    reason?: string,
  ) {
    await this.prisma.employeeChangeHistory.create({
      data: {
        employeeId,
        companyId,
        changeType,
        fieldName,
        beforeValueJson: before == null ? undefined : (before as Prisma.InputJsonValue),
        afterValueJson: after == null ? undefined : (after as Prisma.InputJsonValue),
        reason,
        changedBy: actor.userId,
        source: 'web',
      },
    });
  }
}

function maskNationalId(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${digits.slice(0, 4)}-XXXX-XXXX-${digits.slice(-3)}`;
}
