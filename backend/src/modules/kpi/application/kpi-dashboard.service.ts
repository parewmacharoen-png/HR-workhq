// ============================================================================
// modules/kpi/application/kpi-dashboard.service.ts
// KPI-001
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { KpiAccessService } from './kpi-access.service';
import { KpiAssignmentService } from './kpi-assignment.service';
import { KpiCycleService } from './kpi-cycle.service';
import { KpiDashboardResponse } from './dto/kpi.dto';
import { KPI_ASSIGNMENT_INCLUDE } from './kpi-assignment.include';

@Injectable()
export class KpiDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KpiAccessService,
    private readonly cycles: KpiCycleService,
    private readonly assignments: KpiAssignmentService,
  ) {}

  async getDashboard(actor: ActorContext, companyId: string): Promise<KpiDashboardResponse> {
    await this.access.assertCanViewDashboard(actor, companyId);

    const activeCycles = (await this.cycles.list(actor, companyId))
      .filter((cycle) => cycle.status === 'active' || cycle.status === 'scoring');

    const baseWhere = {
      deletedAt: null as null,
      cycle: { companyId, deletedAt: null as null },
    };

    const [pendingRows, submittedRows, finalizedRows] = await Promise.all([
      this.prisma.kpiAssignment.findMany({
        where: { ...baseWhere, status: { in: ['pending', 'in_progress'] } },
        include: KPI_ASSIGNMENT_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.kpiAssignment.findMany({
        where: { ...baseWhere, status: { in: ['submitted', 'reviewed'] } },
        include: KPI_ASSIGNMENT_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.kpiAssignment.findMany({
        where: { ...baseWhere, status: 'finalized' },
        include: KPI_ASSIGNMENT_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      companyId,
      activeCycles,
      pendingAssignments: pendingRows.map((row) => this.assignments.toResponse(row)),
      submittedAssignments: submittedRows.map((row) => this.assignments.toResponse(row)),
      recentlyFinalized: finalizedRows.map((row) => this.assignments.toResponse(row)),
    };
  }
}
