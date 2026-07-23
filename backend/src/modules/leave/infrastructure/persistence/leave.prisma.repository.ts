// ============================================================================
// modules/leave/infrastructure/persistence/leave.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { LeaveRequest } from '../../domain/entities/leave-request.entity';
import {
  LeaveRepository, HolidayConversionRepository,
  LeaveTypeView, LeaveBalanceView, ApprovedLeaveSummary,
  LeaveRescheduleRecord, LeaveShiftSwapRecord,
} from '../../domain/repositories/leave.repository';
import { HolidayConversionResult } from '../../domain/services/holiday-conversion.service';

@Injectable()
export class PrismaLeaveRepository implements LeaveRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTypeByCode(code: string): Promise<LeaveTypeView | null> {
    const row = await this.prisma.leaveType.findFirst({ where: { code, deletedAt: null } });
    return row ? this.typeView(row) : null;
  }

  async findTypeById(id: string): Promise<LeaveTypeView | null> {
    const row = await this.prisma.leaveType.findFirst({ where: { id, deletedAt: null } });
    return row ? this.typeView(row) : null;
  }

  async findRequestById(id: string): Promise<LeaveRequest | null> {
    const row = await this.prisma.leaveRequest.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async findRequestByWorkflowEntity(entityId: string): Promise<LeaveRequest | null> {
    // entityId for leave workflows == leave_request.id
    const row = await this.prisma.leaveRequest.findFirst({ where: { id: entityId, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async listApprovedRequestsByEmployee(
    employeeId: string,
    companyId: string,
  ): Promise<ApprovedLeaveSummary[]> {
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
      },
      include: { leaveType: { select: { name: true } } },
      orderBy: { startDate: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      startDate: row.startDate,
      endDate: row.endDate,
      days: Number(row.days),
      rescheduleCount: row.rescheduleCount,
      leaveTypeName: row.leaveType.name,
    }));
  }

  async hasApprovedDateOverlap(
    companyId: string,
    startDate: Date,
    endDate: Date,
    excludeLeaveRequestId?: string,
  ): Promise<boolean> {
    const count = await this.prisma.leaveRequest.count({
      where: {
        companyId,
        status: 'approved',
        deletedAt: null,
        ...(excludeLeaveRequestId ? { id: { not: excludeLeaveRequestId } } : {}),
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    return count > 0;
  }

  async hasApprovedLeaveForEmployeeOnDate(
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<boolean> {
    const hasLeave = await this.prisma.leaveRequest.count({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
        startDate: { lte: workDate },
        endDate: { gte: workDate },
      },
    });
    if (hasLeave > 0) return true;

    const workDateIso = workDate.toISOString().slice(0, 10);
    const monthlyOffRows = await this.prisma.monthlyOffRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
      },
      select: { selectedDates: true },
    });
    return monthlyOffRows.some((row) => {
      const dates = Array.isArray(row.selectedDates) ? row.selectedDates as string[] : [];
      return dates.includes(workDateIso);
    });
  }

  async hasPendingReschedule(leaveRequestId: string): Promise<boolean> {
    const count = await this.prisma.leaveRescheduleRequest.count({
      where: { leaveRequestId, status: 'pending', deletedAt: null },
    });
    return count > 0;
  }

  async getBalance(employeeId: string, leaveTypeId: string, periodStart: Date): Promise<LeaveBalanceView | null> {
    const row = await this.prisma.leaveBalance.findFirst({
      where: { employeeId, leaveTypeId, periodStart, deletedAt: null },
    });
    if (!row) return null;
    return {
      entitled: Number(row.entitled),
      used: Number(row.used),
      borrowed: Number(row.borrowed),
      remaining: Number(row.remaining),
    };
  }

  async ensureEmergencyBalance(input: {
    employeeId: string;
    leaveTypeId: string;
    periodStart: Date;
    periodEnd: Date;
    entitled: number;
    actorUserId: string;
  }): Promise<void> {
    const existing = await this.prisma.leaveBalance.findFirst({
      where: {
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        periodStart: input.periodStart,
        deletedAt: null,
      },
    });
    if (existing) return;

    await this.prisma.leaveBalance.create({
      data: {
        id: randomUUID(),
        employeeId: input.employeeId,
        leaveTypeId: input.leaveTypeId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        entitled: new Prisma.Decimal(input.entitled),
        used: new Prisma.Decimal(0),
        borrowed: new Prisma.Decimal(0),
        remaining: new Prisma.Decimal(input.entitled),
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
  }

  async saveRequest(request: LeaveRequest, actorUserId: string): Promise<void> {
    const p = request.toPersistence();
    await this.prisma.leaveRequest.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        employeeId: p.employeeId,
        companyId: p.companyId,
        leaveTypeId: p.leaveTypeId,
        startDate: p.startDate,
        endDate: p.endDate,
        days: new Prisma.Decimal(p.days),
        isBorrowed: p.isBorrowed,
        reason: p.reason ?? undefined,
        rescheduleCount: p.rescheduleCount,
        workflowInstanceId: p.workflowInstanceId ?? undefined,
        status: p.status,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        leaveTypeId: p.leaveTypeId,
        startDate: p.startDate,
        endDate: p.endDate,
        days: new Prisma.Decimal(p.days),
        isBorrowed: p.isBorrowed,
        reason: p.reason ?? undefined,
        workflowInstanceId: p.workflowInstanceId ?? undefined,
        status: p.status,
        rescheduleCount: p.rescheduleCount,
        updatedBy: actorUserId,
      },
    });
  }

  async softDeleteRequest(id: string, actorUserId: string): Promise<void> {
    await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  }

  async createRescheduleRequest(
    input: Omit<LeaveRescheduleRecord, 'id' | 'status' | 'workflowInstanceId'>,
    actorUserId: string,
  ): Promise<string> {
    const id = randomUUID();
    await this.prisma.leaveRescheduleRequest.create({
      data: {
        id,
        leaveRequestId: input.leaveRequestId,
        employeeId: input.employeeId,
        companyId: input.companyId,
        originalStartDate: input.originalStartDate,
        originalEndDate: input.originalEndDate,
        originalDays: new Prisma.Decimal(input.originalDays),
        newStartDate: input.newStartDate,
        newEndDate: input.newEndDate,
        newDays: new Prisma.Decimal(input.newDays),
        reason: input.reason,
        isEmergency: input.isEmergency,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    return id;
  }

  async findRescheduleById(id: string): Promise<LeaveRescheduleRecord | null> {
    const row = await this.prisma.leaveRescheduleRequest.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toReschedule(row) : null;
  }

  async findRescheduleByWorkflowEntity(entityId: string): Promise<LeaveRescheduleRecord | null> {
    const row = await this.prisma.leaveRescheduleRequest.findFirst({ where: { id: entityId, deletedAt: null } });
    return row ? this.toReschedule(row) : null;
  }

  async attachRescheduleWorkflow(
    id: string,
    workflowInstanceId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.leaveRescheduleRequest.update({
      where: { id },
      data: { workflowInstanceId, updatedBy: actorUserId },
    });
  }

  async updateRescheduleStatus(
    id: string,
    status: LeaveRescheduleRecord['status'],
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.leaveRescheduleRequest.update({
      where: { id },
      data: { status, updatedBy: actorUserId },
    });
  }

  async applyApprovedReschedule(
    reschedule: LeaveRescheduleRecord,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: reschedule.leaveRequestId },
        data: {
          startDate: reschedule.newStartDate,
          endDate: reschedule.newEndDate,
          rescheduleCount: { increment: 1 },
          updatedBy: actorUserId,
        },
      });
      await tx.leaveRescheduleRequest.update({
        where: { id: reschedule.id },
        data: { status: 'approved', updatedBy: actorUserId },
      });
    });
  }

  async createShiftSwapRequest(input: {
    companyId: string;
    requesterEmployeeId: string;
    partnerEmployeeId: string;
    requesterLeaveRequestId: string;
    partnerLeaveRequestId: string;
    actorUserId: string;
  }): Promise<string> {
    const id = randomUUID();
    await this.prisma.leaveShiftSwapRequest.create({
      data: {
        id,
        companyId: input.companyId,
        requesterEmployeeId: input.requesterEmployeeId,
        partnerEmployeeId: input.partnerEmployeeId,
        requesterLeaveRequestId: input.requesterLeaveRequestId,
        partnerLeaveRequestId: input.partnerLeaveRequestId,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    return id;
  }

  async findShiftSwapById(id: string): Promise<LeaveShiftSwapRecord | null> {
    const row = await this.prisma.leaveShiftSwapRequest.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toShiftSwap(row) : null;
  }

  async findShiftSwapByWorkflowEntity(entityId: string): Promise<LeaveShiftSwapRecord | null> {
    const row = await this.prisma.leaveShiftSwapRequest.findFirst({ where: { id: entityId, deletedAt: null } });
    return row ? this.toShiftSwap(row) : null;
  }

  async markShiftSwapPartnerAgreed(id: string, actorUserId: string): Promise<void> {
    await this.prisma.leaveShiftSwapRequest.update({
      where: { id },
      data: {
        partnerAgreedAt: new Date(),
        status: 'pending_approval',
        updatedBy: actorUserId,
      },
    });
  }

  async attachShiftSwapWorkflow(
    id: string,
    workflowInstanceId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.leaveShiftSwapRequest.update({
      where: { id },
      data: { workflowInstanceId, updatedBy: actorUserId },
    });
  }

  async updateShiftSwapStatus(
    id: string,
    status: LeaveShiftSwapRecord['status'],
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.leaveShiftSwapRequest.update({
      where: { id },
      data: { status, updatedBy: actorUserId },
    });
  }

  async applyApprovedShiftSwap(swap: LeaveShiftSwapRecord, actorUserId: string): Promise<void> {
    const [requesterLeave, partnerLeave] = await Promise.all([
      this.prisma.leaveRequest.findFirst({ where: { id: swap.requesterLeaveRequestId, deletedAt: null } }),
      this.prisma.leaveRequest.findFirst({ where: { id: swap.partnerLeaveRequestId, deletedAt: null } }),
    ]);
    if (!requesterLeave || !partnerLeave) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id: requesterLeave.id },
        data: {
          startDate: partnerLeave.startDate,
          endDate: partnerLeave.endDate,
          updatedBy: actorUserId,
        },
      });
      await tx.leaveRequest.update({
        where: { id: partnerLeave.id },
        data: {
          startDate: requesterLeave.startDate,
          endDate: requesterLeave.endDate,
          updatedBy: actorUserId,
        },
      });
      await tx.leaveShiftSwapRequest.update({
        where: { id: swap.id },
        data: { status: 'approved', updatedBy: actorUserId },
      });
    });
  }

  async applyConsumption(input: {
    employeeId: string;
    leaveTypeId: string;
    periodStart: Date;
    days: number;
    borrowed: boolean;
    actorUserId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const bal = await tx.leaveBalance.findFirst({
        where: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          periodStart: input.periodStart,
          deletedAt: null,
        },
      });
      if (!bal) {
        // create a balance row reflecting the consumption (negative remaining if borrowed)
        await tx.leaveBalance.create({
          data: {
            id: randomUUID(),
            employeeId: input.employeeId,
            leaveTypeId: input.leaveTypeId,
            periodStart: input.periodStart,
            periodEnd: input.periodStart,
            entitled: new Prisma.Decimal(0),
            used: new Prisma.Decimal(input.days),
            borrowed: new Prisma.Decimal(input.borrowed ? input.days : 0),
            remaining: new Prisma.Decimal(-input.days),
            createdBy: input.actorUserId,
            updatedBy: input.actorUserId,
          },
        });
        return;
      }
      const used = Number(bal.used) + input.days;
      const borrowed = Number(bal.borrowed) + (input.borrowed ? input.days : 0);
      const remaining = Number(bal.entitled) - used;
      await tx.leaveBalance.update({
        where: { id: bal.id },
        data: {
          used: new Prisma.Decimal(used),
          borrowed: new Prisma.Decimal(borrowed),
          remaining: new Prisma.Decimal(remaining),
          updatedBy: input.actorUserId,
        },
      });
    });
  }

  async releaseConsumption(input: {
    employeeId: string;
    leaveTypeId: string;
    periodStart: Date;
    days: number;
    borrowed: boolean;
    actorUserId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const bal = await tx.leaveBalance.findFirst({
        where: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          periodStart: input.periodStart,
          deletedAt: null,
        },
      });
      if (!bal) return;

      const used = Math.max(0, Number(bal.used) - input.days);
      const borrowed = Math.max(0, Number(bal.borrowed) - (input.borrowed ? input.days : 0));
      const remaining = Number(bal.entitled) - used;
      await tx.leaveBalance.update({
        where: { id: bal.id },
        data: {
          used: new Prisma.Decimal(used),
          borrowed: new Prisma.Decimal(borrowed),
          remaining: new Prisma.Decimal(remaining),
          updatedBy: input.actorUserId,
        },
      });
    });
  }

  async findEmployeeIdForUser(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    return user?.employeeId ?? null;
  }

  private typeView(row: any): LeaveTypeView {
    return {
      id: row.id,
      code: row.code,
      allowBorrowFuture: row.allowBorrowFuture,
      convertibleToBonus: row.convertibleToBonus,
    };
  }

  private toDomain(row: any): LeaveRequest {
    return LeaveRequest.rehydrate({
      id: row.id,
      employeeId: row.employeeId,
      companyId: row.companyId,
      leaveTypeId: row.leaveTypeId,
      startDate: row.startDate,
      endDate: row.endDate,
      days: Number(row.days),
      isBorrowed: row.isBorrowed,
      reason: row.reason,
      rescheduleCount: row.rescheduleCount ?? 0,
      workflowInstanceId: row.workflowInstanceId,
      status: row.status,
      deletedAt: row.deletedAt,
    });
  }

  private toReschedule(row: any): LeaveRescheduleRecord {
    return {
      id: row.id,
      leaveRequestId: row.leaveRequestId,
      employeeId: row.employeeId,
      companyId: row.companyId,
      originalStartDate: row.originalStartDate,
      originalEndDate: row.originalEndDate,
      originalDays: Number(row.originalDays),
      newStartDate: row.newStartDate,
      newEndDate: row.newEndDate,
      newDays: Number(row.newDays),
      reason: row.reason,
      isEmergency: row.isEmergency,
      workflowInstanceId: row.workflowInstanceId,
      status: row.status,
    };
  }

  private toShiftSwap(row: any): LeaveShiftSwapRecord {
    return {
      id: row.id,
      companyId: row.companyId,
      requesterEmployeeId: row.requesterEmployeeId,
      partnerEmployeeId: row.partnerEmployeeId,
      requesterLeaveRequestId: row.requesterLeaveRequestId,
      partnerLeaveRequestId: row.partnerLeaveRequestId,
      requesterAgreedAt: row.requesterAgreedAt,
      partnerAgreedAt: row.partnerAgreedAt,
      workflowInstanceId: row.workflowInstanceId,
      status: row.status,
    };
  }
}

@Injectable()
export class PrismaHolidayConversionRepository implements HolidayConversionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async exists(employeeId: string, payrollCycleId: string): Promise<boolean> {
    const count = await this.prisma.holidayConversion.count({
      where: { employeeId, payrollCycleId, deletedAt: null },
    });
    return count > 0;
  }

  async create(input: {
    employeeId: string;
    companyId: string;
    payrollCycleId: string;
    result: HolidayConversionResult;
    actorUserId: string;
  }): Promise<string> {
    const id = randomUUID();
    await this.prisma.holidayConversion.create({
      data: {
        id,
        employeeId: input.employeeId,
        companyId: input.companyId,
        payrollCycleId: input.payrollCycleId,
        unusedDays: new Prisma.Decimal(input.result.unusedDays),
        ratePerDay: new Prisma.Decimal(input.result.ratePerDay),
        capAmount: new Prisma.Decimal(input.result.capAmount),
        overrideCap: input.result.overrideCap,
        bonusAmount: new Prisma.Decimal(input.result.bonusAmount),
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    return id;
  }
}
