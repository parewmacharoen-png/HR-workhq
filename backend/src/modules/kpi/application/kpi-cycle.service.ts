// ============================================================================
// modules/kpi/application/kpi-cycle.service.ts
// KPI-001
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { KpiCycleNotFoundError, KpiInvalidStatusError } from '../domain/errors/kpi.errors';
import { KpiAccessService } from './kpi-access.service';
import { KpiAssignmentService } from './kpi-assignment.service';
import { AssignKpiCycleDto, CreateKpiCycleDto, KpiCycleResponse } from './dto/kpi.dto';

@Injectable()
export class KpiCycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KpiAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly assignments: KpiAssignmentService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: ActorContext, dto: CreateKpiCycleDto): Promise<KpiCycleResponse> {
    await this.access.assertCanManageCycles(actor, dto.companyId);

    const cycle = await this.prisma.kpiCycle.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        status: 'draft',
        createdBy: actor.userId,
      },
      include: { _count: { select: { assignments: true } } },
    });

    await this.audit.record(actor, {
      entityType: 'kpi_cycle',
      entityId: cycle.id,
      action: 'created',
    });

    return this.toResponse(cycle);
  }

  async list(actor: ActorContext, companyId: string): Promise<KpiCycleResponse[]> {
    await this.access.assertCanViewDashboard(actor, companyId);

    const rows = await this.prisma.kpiCycle.findMany({
      where: { companyId, deletedAt: null },
      include: { _count: { select: { assignments: true } } },
      orderBy: { periodStart: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  async assign(
    actor: ActorContext,
    cycleId: string,
    dto: AssignKpiCycleDto,
  ) {
    const cycle = await this.getOrThrow(cycleId);
    await this.access.assertCanAssign(actor, cycle.companyId);

    if (cycle.status === 'finalized' || cycle.status === 'cancelled') {
      throw new KpiInvalidStatusError('Cannot assign employees to a finalized or cancelled cycle');
    }

    for (const employeeId of dto.employeeIds) {
      await this.employeeAccess.assertEmployeeInCompany(employeeId, cycle.companyId);
    }

    return this.assignments.assignMany(actor, cycle, dto);
  }

  async listAssignments(actor: ActorContext, cycleId: string) {
    const cycle = await this.getOrThrow(cycleId);
    await this.access.assertCanViewCycleAssignments(actor, cycle.companyId);
    return this.assignments.listByCycle(cycleId);
  }

  async getOrThrow(id: string) {
    const cycle = await this.prisma.kpiCycle.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { assignments: true } } },
    });
    if (!cycle) throw new KpiCycleNotFoundError(id);
    return cycle;
  }

  toResponse(cycle: {
    id: string;
    companyId: string;
    name: string;
    periodStart: Date;
    periodEnd: Date;
    status: KpiCycleResponse['status'];
    createdAt: Date;
    _count: { assignments: number };
  }): KpiCycleResponse {
    return {
      id: cycle.id,
      companyId: cycle.companyId,
      name: cycle.name,
      periodStart: cycle.periodStart.toISOString().slice(0, 10),
      periodEnd: cycle.periodEnd.toISOString().slice(0, 10),
      status: cycle.status,
      assignmentCount: cycle._count.assignments,
      createdAt: cycle.createdAt.toISOString(),
    };
  }
}
