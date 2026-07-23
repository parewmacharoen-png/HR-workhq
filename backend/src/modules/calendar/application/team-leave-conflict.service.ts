// ============================================================================
// modules/calendar/application/team-leave-conflict.service.ts
// TEAM-001 — team staffing overlap detection
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { LeaveConflictResponse } from './dto/team-calendar.dto';

@Injectable()
export class TeamLeaveConflictService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async checkTeamOverlap(
    actor: ActorContext,
    teamMemberIds: string[],
    companyId: string,
    startDate: Date,
    endDate: Date,
    excludeRequestId?: string,
  ): Promise<LeaveConflictResponse> {
    if (teamMemberIds.length === 0) {
      return { overlappingCount: 0, overlappingEmployees: [], message: '' };
    }

    const overlapping = await this.prisma.leaveRequest.findMany({
      where: {
        companyId,
        employeeId: { in: teamMemberIds },
        status: 'approved',
        deletedAt: null,
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const byEmployee = new Map<string, { employeeId: string; name: string }>();
    for (const row of overlapping) {
      byEmployee.set(row.employeeId, {
        employeeId: row.employeeId,
        name: `${row.employee.firstName} ${row.employee.lastName}`,
      });
    }
    const list = [...byEmployee.values()];
    const count = list.length;
    const message = count > 0
      ? `⚠️ วันที่เลือกมีพนักงานหยุดแล้ว ${count} คน`
      : '';

    if (count > 0) {
      await this.audit.record(actor, {
        entityType: 'TeamCalendar',
        entityId: companyId,
        action: 'leave_conflict_detected',
        after: { count, startDate: startDate.toISOString().slice(0, 10), endDate: endDate.toISOString().slice(0, 10) },
      });
    }

    return { overlappingCount: count, overlappingEmployees: list, message };
  }
}
