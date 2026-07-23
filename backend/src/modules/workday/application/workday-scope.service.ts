// ============================================================================
// modules/workday/application/workday-scope.service.ts
// Role-based employee scope for command center (mirrors team calendar scope).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { TeamCalendarScopeService } from '../../calendar/application/team-calendar-scope.service';

@Injectable()
export class WorkDayScopeService {
  constructor(
    private readonly calendarScope: TeamCalendarScopeService,
    private readonly prisma: PrismaService,
  ) {}

  async resolveEmployeeIds(
    actor: ActorContext,
    companyId: string,
    teamId?: string,
  ): Promise<string[]> {
    const scope = await this.calendarScope.resolve(actor, companyId, teamId);
    if (scope.employeeIds) {
      return scope.employeeIds.length ? scope.employeeIds : [];
    }
    const rows = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { in: ['active', 'probation'] },
        assignments: {
          some: {
            companyId,
            effectiveTo: null,
            deletedAt: null,
          },
        },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
