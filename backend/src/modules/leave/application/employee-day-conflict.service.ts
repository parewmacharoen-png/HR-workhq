// ============================================================================
// Prevents the same employee from booking leave / monthly-off on the same day
// when a pending or approved request already covers that date.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EmployeeDayAlreadyBookedError } from '../domain/errors/leave.errors';

export type EmployeeDayBookingKind = 'leave' | 'monthly_off';

export interface EmployeeDayConflict {
  date: string;
  kind: EmployeeDayBookingKind;
  status: 'pending' | 'approved';
}

export function expandIsoDateRange(startIso: string, endIso: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
    return [];
  }
  if (endIso < startIso) return [];

  const dates: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function statusLabel(status: 'pending' | 'approved'): string {
  return status === 'pending' ? 'รออนุมัติ' : 'อนุมัติแล้ว';
}

function kindLabel(kind: EmployeeDayBookingKind): string {
  return kind === 'monthly_off' ? 'วันหยุดประจำเดือน' : 'ลา';
}

export function formatEmployeeDayConflictMessage(conflicts: EmployeeDayConflict[]): string {
  const uniqueDates = [...new Set(conflicts.map((row) => row.date))].sort();
  const sample = conflicts[0];
  const detail = sample
    ? `${kindLabel(sample.kind)} (${statusLabel(sample.status)})`
    : 'ลา/วันหยุด';
  return `วันที่ ${uniqueDates.join(', ')} มีคำขอ${detail} อยู่แล้ว — ไม่สามารถขอซ้ำได้`;
}

@Injectable()
export class EmployeeDayConflictService {
  constructor(private readonly prisma: PrismaService) {}

  async findConflicts(input: {
    employeeId: string;
    companyId: string;
    dates: string[];
    excludeLeaveRequestId?: string;
    excludeMonthlyOffRequestId?: string;
  }): Promise<EmployeeDayConflict[]> {
    const wanted = [...new Set(
      input.dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)),
    )].sort();
    if (!wanted.length) return [];

    const minDate = wanted[0];
    const maxDate = wanted[wanted.length - 1];
    const wantedSet = new Set(wanted);
    const conflicts: EmployeeDayConflict[] = [];

    const leaveRows = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId: input.employeeId,
        companyId: input.companyId,
        status: { in: ['pending', 'approved'] },
        deletedAt: null,
        startDate: { lte: new Date(`${maxDate}T00:00:00.000Z`) },
        endDate: { gte: new Date(`${minDate}T00:00:00.000Z`) },
        ...(input.excludeLeaveRequestId ? { id: { not: input.excludeLeaveRequestId } } : {}),
      },
      select: { startDate: true, endDate: true, status: true },
    });

    for (const row of leaveRows) {
      const status = row.status === 'approved' ? 'approved' as const : 'pending' as const;
      for (const date of expandIsoDateRange(
        row.startDate.toISOString().slice(0, 10),
        row.endDate.toISOString().slice(0, 10),
      )) {
        if (wantedSet.has(date)) {
          conflicts.push({ date, kind: 'leave', status });
        }
      }
    }

    const monthlyOffRows = await this.prisma.monthlyOffRequest.findMany({
      where: {
        employeeId: input.employeeId,
        companyId: input.companyId,
        status: { in: ['pending', 'approved'] },
        deletedAt: null,
        ...(input.excludeMonthlyOffRequestId
          ? { id: { not: input.excludeMonthlyOffRequestId } }
          : {}),
      },
      select: { selectedDates: true, status: true },
    });

    for (const row of monthlyOffRows) {
      const status = row.status === 'approved' ? 'approved' as const : 'pending' as const;
      const dates = Array.isArray(row.selectedDates)
        ? (row.selectedDates as string[])
        : [];
      for (const date of dates) {
        if (wantedSet.has(date)) {
          conflicts.push({ date, kind: 'monthly_off', status });
        }
      }
    }

    conflicts.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
    return conflicts;
  }

  async assertNoConflict(input: {
    employeeId: string;
    companyId: string;
    dates: string[];
    excludeLeaveRequestId?: string;
    excludeMonthlyOffRequestId?: string;
  }): Promise<void> {
    const conflicts = await this.findConflicts(input);
    if (!conflicts.length) return;
    throw new EmployeeDayAlreadyBookedError(formatEmployeeDayConflictMessage(conflicts));
  }
}
