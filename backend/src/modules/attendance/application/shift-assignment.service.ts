// ============================================================================
// modules/attendance/application/shift-assignment.service.ts
// Shift assignment history with future-dated scheduling.
// ============================================================================

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';
import { AuditService } from '../../../shared/audit/audit.service';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  buildShiftWindow,
  dayShiftFromRules,
  isExplicitNightShift,
  nightShiftFromRules,
  resolveEffectiveAssignment,
  resolveShiftFallbackFromProfile,
  toShiftDefinition,
  ResolvedShiftWindow,
  ShiftAssignmentRow,
} from '../domain/services/shift-resolver.service';
import {
  assertNoOverlap,
  dayBeforeIso,
  findAssignmentsToClose,
  parseWorkDateIso,
  ShiftAssignmentOverlapError,
  ShiftAssignmentValidationError,
  ShiftAssignmentWithId,
  toDateIso,
} from '../domain/services/shift-assignment.domain';
import { AttendanceSettingsService } from '../../settings/application/attendance-settings.service';

export interface ShiftAssignmentView {
  id: string;
  shiftId: string;
  shiftName: string;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
  assignedById: string | null;
  createdAt: string;
}

export interface EmployeeShiftProfile {
  current: ShiftAssignmentView | null;
  nextScheduled: ShiftAssignmentView | null;
  history: ShiftAssignmentView[];
}

@Injectable()
export class ShiftAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceSettings: AttendanceSettingsService,
    private readonly time: BangkokTimeProvider,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  async listCompanyShifts(companyId: string) {
    return this.prisma.shift.findMany({
      where: { companyId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        startMinutes: true,
        endMinutes: true,
        crossesMidnight: true,
        isActive: true,
      },
    });
  }

  async createShift(
    actor: ActorContext,
    companyId: string,
    input: {
      name: string;
      startMinutes: number;
      endMinutes: number;
      crossesMidnight?: boolean;
    },
  ) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    this.assertShiftTimes(input.startMinutes, input.endMinutes);

    const crossesMidnight = input.crossesMidnight
      ?? input.endMinutes <= input.startMinutes;
    const id = randomUUID();
    await this.prisma.shift.create({
      data: {
        id,
        companyId,
        name: input.name.trim(),
        startMinutes: input.startMinutes,
        endMinutes: input.endMinutes,
        crossesMidnight,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'Shift',
      entityId: id,
      action: 'shift_created',
      after: { companyId, name: input.name, startMinutes: input.startMinutes, endMinutes: input.endMinutes },
    });
    return { id };
  }

  async updateShift(
    actor: ActorContext,
    companyId: string,
    shiftId: string,
    input: {
      name?: string;
      startMinutes?: number;
      endMinutes?: number;
      crossesMidnight?: boolean;
      isActive?: boolean;
    },
  ) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const existing = await this.prisma.shift.findFirst({
      where: { id: shiftId, companyId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Shift not found');

    const startMinutes = input.startMinutes ?? existing.startMinutes;
    const endMinutes = input.endMinutes ?? existing.endMinutes;
    this.assertShiftTimes(startMinutes, endMinutes);

    const crossesMidnight = input.crossesMidnight
      ?? (input.startMinutes !== undefined || input.endMinutes !== undefined
        ? endMinutes <= startMinutes
        : existing.crossesMidnight);

    await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.startMinutes !== undefined ? { startMinutes: input.startMinutes } : {}),
        ...(input.endMinutes !== undefined ? { endMinutes: input.endMinutes } : {}),
        crossesMidnight,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'Shift',
      entityId: shiftId,
      action: 'shift_updated',
      after: input,
    });
    return { id: shiftId };
  }

  async deleteShift(actor: ActorContext, companyId: string, shiftId: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const existing = await this.prisma.shift.findFirst({
      where: { id: shiftId, companyId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Shift not found');

    const activeAssignments = await this.prisma.employeeShiftAssignment.count({
      where: {
        shiftId,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: this.time.workDate() } }],
      },
    });
    if (activeAssignments > 0) {
      throw new ConflictException('Cannot delete shift with active employee assignments');
    }

    await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        deletedAt: new Date(),
        deletedBy: actor.userId,
        isActive: false,
        updatedBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'Shift',
      entityId: shiftId,
      action: 'shift_deleted',
      after: { companyId },
    });
    return { id: shiftId };
  }

  private assertShiftTimes(startMinutes: number, endMinutes: number): void {
    if (startMinutes === endMinutes) {
      throw new BadRequestException('Shift start and end times must differ');
    }
  }

  async getShiftProfile(employeeId: string, _companyId: string): Promise<EmployeeShiftProfile> {
    const today = this.time.workDate();
    const rows = await this.loadAssignmentsWithMeta(employeeId);
    const currentMeta = resolveEffectiveAssignment(rows, today) as typeof rows[number] | null;
    const day = this.time.workDateString();
    const nextMeta = rows
      .filter((row) => toDateIso(row.effectiveFrom) > day)
      .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime())[0] ?? null;

    return {
      current: currentMeta ? this.toView(currentMeta) : null,
      nextScheduled: nextMeta ? this.toView(nextMeta) : null,
      history: rows.map((r) => this.toView(r)),
    };
  }

  async scheduleAssignment(
    actor: ActorContext,
    input: {
      employeeId: string;
      companyId: string;
      shiftId: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
      reason?: string;
    },
  ): Promise<{ id: string }> {
    await this.companyAccess.assertCompanyAccess(actor, input.companyId);

    const fromIso = input.effectiveFrom;
    const toIso = input.effectiveTo ?? null;
    if (toIso && toIso < fromIso) {
      throw new BadRequestException('effectiveTo must be on or after effectiveFrom');
    }

    const shift = await this.prisma.shift.findFirst({
      where: {
        id: input.shiftId,
        companyId: input.companyId,
        deletedAt: null,
        isActive: true,
      },
    });
    if (!shift) throw new NotFoundException('Shift not found');

    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId: input.employeeId,
        companyId: input.companyId,
        effectiveTo: null,
        deletedAt: null,
      },
    });
    if (!assignment) {
      throw new BadRequestException('Employee is not assigned to this company');
    }

    const existing = await this.loadAssignmentsWithMeta(input.employeeId);
    const toClose = findAssignmentsToClose(existing, fromIso);
    const closeBeforeId = new Map<string, string>(
      toClose.map((row) => [row.id, dayBeforeIso(fromIso)]),
    );

    try {
      assertNoOverlap(existing, closeBeforeId, fromIso, toIso);
    } catch (err) {
      if (err instanceof ShiftAssignmentOverlapError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    const priorOnFrom = resolveEffectiveAssignment(existing, parseWorkDateIso(fromIso));
    const newId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      for (const row of toClose) {
        await tx.employeeShiftAssignment.update({
          where: { id: row.id },
          data: { effectiveTo: parseWorkDateIso(closeBeforeId.get(row.id)!) },
        });
      }

      await tx.employeeShiftAssignment.create({
        data: {
          id: newId,
          employeeId: input.employeeId,
          shiftId: input.shiftId,
          effectiveFrom: parseWorkDateIso(fromIso),
          effectiveTo: toIso ? parseWorkDateIso(toIso) : null,
          reason: input.reason ?? null,
          assignedById: actor.userId,
        },
      });

      await tx.attendanceRecord.updateMany({
        where: {
          employeeId: input.employeeId,
          companyId: input.companyId,
          deletedAt: null,
          checkInAt: { not: null },
          workDate: {
            gte: parseWorkDateIso(fromIso),
            ...(toIso ? { lte: parseWorkDateIso(toIso) } : {}),
          },
        },
        data: { needsRecalculation: true, updatedBy: actor.userId },
      });
    });

    await this.audit.record(actor, {
      entityType: 'EmployeeShiftAssignment',
      entityId: newId,
      action: 'shift_assignment_scheduled',
      before: priorOnFrom
        ? {
          shiftId: priorOnFrom.shift.id,
          shiftName: priorOnFrom.shift.name,
          effectiveFrom: toDateIso(priorOnFrom.effectiveFrom),
          effectiveTo: priorOnFrom.effectiveTo ? toDateIso(priorOnFrom.effectiveTo) : null,
        }
        : null,
      after: {
        shiftId: shift.id,
        shiftName: shift.name,
        effectiveFrom: fromIso,
        effectiveTo: toIso,
        changedBy: actor.userId,
        reason: input.reason ?? null,
      },
    });

    return { id: newId };
  }

  /** @deprecated Use scheduleAssignment — kept for backward compatibility. */
  async assignShift(
    actor: ActorContext,
    input: {
      employeeId: string;
      companyId: string;
      shiftId: string;
      effectiveFrom?: Date;
      reason?: string;
    },
  ): Promise<void> {
    const effectiveFrom = input.effectiveFrom
      ? toDateIso(input.effectiveFrom)
      : this.time.workDateString();
    await this.scheduleAssignment(actor, {
      employeeId: input.employeeId,
      companyId: input.companyId,
      shiftId: input.shiftId,
      effectiveFrom,
      reason: input.reason,
    });
  }

  async getCurrentShift(
    employeeId: string,
    companyId: string,
  ): Promise<ShiftAssignmentView | null> {
    const profile = await this.getShiftProfile(employeeId, companyId);
    return profile.current;
  }

  async resolveShiftWindow(
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<ResolvedShiftWindow> {
    const assignments = await this.loadAssignments(employeeId);
    const effective = resolveEffectiveAssignment(assignments, workDate);
    if (effective) {
      return buildShiftWindow(workDate, toShiftDefinition(effective.shift));
    }
    const rules = await this.attendanceSettings.getRules(companyId);
    const profileShift = await this.resolveEmployeeShiftPreference(employeeId, companyId);
    const fallback = resolveShiftFallbackFromProfile(profileShift, rules);
    return buildShiftWindow(workDate, fallback);
  }

  /**
   * When HR has not assigned a shift, default to day shift (กะกลางวัน).
   * Skips employees with an explicit night profile until HR schedules night shift.
   */
  async ensureDefaultDayShiftIfUnassigned(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    effectiveFromIso?: string,
  ): Promise<void> {
    const today = this.time.workDate();
    const assignments = await this.loadAssignments(employeeId);
    if (resolveEffectiveAssignment(assignments, today)) return;

    const profileShift = await this.resolveEmployeeShiftPreference(employeeId, companyId);
    if (isExplicitNightShift(profileShift)) return;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { hireDate: true },
    });
    const effectiveFrom = effectiveFromIso
      ?? employee?.hireDate.toISOString().slice(0, 10)
      ?? this.time.workDateString();

    await this.syncEmployeeProfileShift(actor, employeeId, companyId, 'day', effectiveFrom);
  }

  private async resolveEmployeeShiftPreference(
    employeeId: string,
    companyId: string,
  ): Promise<'day' | 'night' | null> {
    const profile = await this.prisma.adminCommissionEmployeeProfile.findFirst({
      where: { employeeId, companyId, deletedAt: null },
      select: { defaultShift: true },
    });
    if (isExplicitNightShift(profile?.defaultShift)) return 'night';
    return 'day';
  }

  /** Sync EmployeeShiftAssignment when employment profile shift (day/night) is saved. */
  async syncEmployeeProfileShift(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    shiftType: 'day' | 'night',
    effectiveFromIso: string,
  ): Promise<void> {
    const rules = await this.attendanceSettings.getRules(companyId);
    const targetDef = shiftType === 'night'
      ? nightShiftFromRules(rules.shiftStartMinutes, rules.shiftEndMinutes)
      : dayShiftFromRules(rules.shiftStartMinutes, rules.shiftEndMinutes);

    const shifts = await this.listCompanyShifts(companyId);
    let shift = shifts.find(
      (s) => s.startMinutes === targetDef.startMinutes
        && s.endMinutes === targetDef.endMinutes
        && s.crossesMidnight === targetDef.crossesMidnight,
    );

    if (!shift) {
      const created = await this.createShift(actor, companyId, {
        name: shiftType === 'night' ? 'กะกลางคืน' : 'กะกลางวัน',
        startMinutes: targetDef.startMinutes,
        endMinutes: targetDef.endMinutes,
        crossesMidnight: targetDef.crossesMidnight,
      });
      shift = (await this.listCompanyShifts(companyId)).find((s) => s.id === created.id);
    }
    if (!shift) return;

    const current = await this.getCurrentShift(employeeId, companyId);
    if (current?.shiftId === shift.id) return;

    await this.scheduleAssignment(actor, {
      employeeId,
      companyId,
      shiftId: shift.id,
      effectiveFrom: effectiveFromIso,
      reason: 'ตั้งจากข้อมูลการทำงาน (กะงาน)',
    });
  }

  private async loadAssignments(employeeId: string): Promise<ShiftAssignmentRow[]> {
    const rows = await this.loadAssignmentsWithMeta(employeeId);
    return rows.map(({ id: _id, reason: _r, assignedById: _a, createdAt: _c, ...row }) => row);
  }

  private async loadAssignmentsWithMeta(employeeId: string): Promise<Array<ShiftAssignmentWithId & {
    reason: string | null;
    assignedById: string | null;
    createdAt: Date;
  }>> {
    const rows = await this.prisma.employeeShiftAssignment.findMany({
      where: { employeeId },
      include: {
        shift: {
          select: {
            id: true,
            name: true,
            startMinutes: true,
            endMinutes: true,
            crossesMidnight: true,
          },
        },
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      shiftId: r.shiftId,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      reason: r.reason,
      assignedById: r.assignedById,
      createdAt: r.createdAt,
      shift: r.shift,
    }));
  }

  private toView(row: ShiftAssignmentWithId & {
    reason: string | null;
    assignedById: string | null;
    createdAt: Date;
  }): ShiftAssignmentView {
    return {
      id: row.id,
      shiftId: row.shift.id,
      shiftName: row.shift.name,
      startMinutes: row.shift.startMinutes,
      endMinutes: row.shift.endMinutes,
      crossesMidnight: row.shift.crossesMidnight,
      effectiveFrom: toDateIso(row.effectiveFrom),
      effectiveTo: row.effectiveTo ? toDateIso(row.effectiveTo) : null,
      reason: row.reason,
      assignedById: row.assignedById,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

export { ShiftAssignmentValidationError, ShiftAssignmentOverlapError };
