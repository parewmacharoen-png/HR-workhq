import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';

export interface GraphQueryResult {
  query: string;
  intent: string;
  rows: Array<Record<string, unknown>>;
  sources: Array<{ type: string; id: string; label: string }>;
  redactedFields?: string[];
}

/** AI-003 — Relational HR Knowledge Graph (no external graph DB) */
@Injectable()
export class GraphEntityResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async employeeContext(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        assignments: { where: { effectiveTo: null }, include: { company: true, team: true } },
        positionDefinition: true,
        employeeCompetencies: { include: { competency: true } },
        kpiAssignments: { include: { cycle: true } },
        trainingAssignments: true,
        documents: { where: { deletedAt: null } },
      },
    });
    return employee;
  }

  async teamSummary(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        assignments: {
          where: { effectiveTo: null, deletedAt: null },
          include: { employee: { select: { id: true, firstName: true, lastName: true, employmentStatus: true } } },
        },
      },
    });
    return team;
  }

  async companySummary(companyId: string) {
    const [employees, teams, openInsights, criticalRoles] = await Promise.all([
      this.prisma.employee.count({
        where: { deletedAt: null, assignments: { some: { companyId, effectiveTo: null } } },
      }),
      this.prisma.team.count({ where: { companyId, deletedAt: null } }),
      this.prisma.aiInsight.count({ where: { companyId, status: 'open' } }),
      this.prisma.criticalRole.count({ where: { companyId, status: 'active' } }),
    ]);
    return { companyId, employees, teams, openInsights, criticalRoles };
  }
}

@Injectable()
export class GraphPermissionFilterService {
  constructor(private readonly companyAccess: CompanyAccessService) {}

  async canViewSalary(actor: ActorContext): Promise<boolean> {
    return this.companyAccess.hasAllScope(actor.userId);
  }

  async redactRow(actor: ActorContext, row: Record<string, unknown>): Promise<Record<string, unknown>> {
    const out = { ...row };
    if (!(await this.canViewSalary(actor))) {
      delete out.salary;
      delete out.netPay;
      delete out.baseSalary;
      delete out.amount;
    }
    return out;
  }
}

@Injectable()
export class GraphQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: GraphEntityResolverService,
    private readonly filter: GraphPermissionFilterService,
  ) {}

  async executeNaturalQuery(actor: ActorContext, companyId: string, query: string): Promise<GraphQueryResult> {
    const q = query.toLowerCase();
    const sources: GraphQueryResult['sources'] = [];
    let rows: Array<Record<string, unknown>> = [];
    let intent = 'general';

    if (q.includes('kpi') && (q.includes('ต่ำ') || q.includes('low') || q.includes('70'))) {
      intent = 'low_kpi_no_training';
      rows = await this.lowKpiWithoutTraining(companyId);
    } else if (q.includes('โปร') || q.includes('probation')) {
      intent = 'probation_near_end';
      rows = await this.probationNearEnd(companyId);
    } else if (q.includes('competency') || q.includes('ทักษะ') || q.includes('gap')) {
      intent = 'competency_gap';
      rows = await this.competencyGaps(companyId);
    } else if (q.includes('successor') || q.includes('สำรอง') || q.includes('critical')) {
      intent = 'critical_role_no_successor';
      rows = await this.criticalRolesNoSuccessor(companyId);
    } else if (q.includes('เอกสาร') || q.includes('document')) {
      intent = 'missing_documents';
      rows = await this.missingDocuments(companyId);
    } else if (q.includes('เงินเดือน') || q.includes('salary') || q.includes('ปรับ')) {
      intent = 'tenure_no_salary_review';
      rows = await this.tenureWithoutSalaryReview(companyId);
    } else if (q.includes('หยุด') || q.includes('leave') || q.includes('team')) {
      intent = 'team_leave_this_month';
      rows = await this.teamLeaveThisMonth(companyId);
    } else if (q.includes('นโยบาย') || q.includes('announcement')) {
      intent = 'unacknowledged_announcements';
      rows = await this.unacknowledgedAnnouncements(companyId);
    } else {
      intent = 'employee_list';
      rows = await this.defaultEmployeeList(companyId);
    }

    const filtered = await Promise.all(rows.map((r) => this.filter.redactRow(actor, r)));
    return {
      query,
      intent,
      rows: filtered,
      sources,
      redactedFields: (await this.filter.canViewSalary(actor)) ? [] : ['salary', 'netPay', 'baseSalary', 'amount'],
    };
  }

  private async lowKpiWithoutTraining(companyId: string) {
    const scores = await this.prisma.kpiScore.findMany({
      where: {
        totalScore: { lt: 70 },
        assignment: { employee: { assignments: { some: { companyId, effectiveTo: null } } } },
      },
      include: {
        assignment: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      take: 50,
    });
    const rows: Array<Record<string, unknown>> = [];
    for (const s of scores) {
      const training = await this.prisma.trainingAssignment.count({
        where: { employeeId: s.assignment.employeeId, status: 'completed' },
      });
      if (training > 0) continue;
      rows.push({
        employeeId: s.assignment.employeeId,
        name: `${s.assignment.employee.firstName} ${s.assignment.employee.lastName}`,
        kpiScore: s.totalScore,
        trainingCompleted: training,
      });
    }
    return rows;
  }

  private async probationNearEnd(companyId: string) {
    const in14 = new Date();
    in14.setDate(in14.getDate() + 14);
    const employees = await this.prisma.employee.findMany({
      where: {
        employmentStatus: 'probation',
        probationEndDate: { lte: in14 },
        assignments: { some: { companyId, effectiveTo: null } },
      },
      select: { id: true, firstName: true, lastName: true, probationEndDate: true },
    });
    const rows = [];
    for (const e of employees) {
      const review = await this.prisma.probationReview.findFirst({ where: { employeeId: e.id } });
      rows.push({
        employeeId: e.id,
        name: `${e.firstName} ${e.lastName}`,
        probationEndDate: e.probationEndDate,
        hasReview: !!review,
      });
    }
    return rows;
  }

  private async competencyGaps(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: {
        positionDefinitionId: { not: null },
        assignments: { some: { companyId, effectiveTo: null } },
      },
      select: { id: true, firstName: true, lastName: true, positionDefinitionId: true },
      take: 100,
    });
    const rows = [];
    for (const e of employees) {
      const reqs = await this.prisma.positionCompetencyRequirement.findMany({
        where: { positionDefinitionId: e.positionDefinitionId! },
      });
      const skills = await this.prisma.employeeCompetency.findMany({ where: { employeeId: e.id } });
      const gaps = reqs.filter((r) => {
        const s = skills.find((sk) => sk.competencyId === r.competencyId);
        return (s?.currentLevel ?? 0) < r.requiredLevel;
      });
      if (gaps.length) {
        rows.push({ employeeId: e.id, name: `${e.firstName} ${e.lastName}`, gapCount: gaps.length });
      }
    }
    return rows;
  }

  private async criticalRolesNoSuccessor(companyId: string) {
    const roles = await this.prisma.criticalRole.findMany({
      where: { companyId, status: 'active' },
      include: { candidates: true, currentHolder: { select: { firstName: true, lastName: true } } },
    });
    return roles
      .filter((r) => !r.candidates.some((c) => c.readiness === 'ready_now' || c.readiness === 'ready_3_months'))
      .map((r) => ({
        criticalRoleId: r.id,
        name: r.name,
        holder: r.currentHolder ? `${r.currentHolder.firstName} ${r.currentHolder.lastName}` : null,
        candidateCount: r.candidates.length,
      }));
  }

  private async missingDocuments(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { assignments: { some: { companyId, effectiveTo: null } }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
      take: 200,
    });
    const rows = [];
    for (const e of employees) {
      const count = await this.prisma.employeeDocument.count({ where: { employeeId: e.id, deletedAt: null } });
      if (count < 2) rows.push({ employeeId: e.id, name: `${e.firstName} ${e.lastName}`, documentCount: count });
    }
    return rows;
  }

  private async tenureWithoutSalaryReview(companyId: string) {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const employees = await this.prisma.employee.findMany({
      where: {
        hireDate: { lte: twoYearsAgo },
        employmentStatus: 'active',
        assignments: { some: { companyId, effectiveTo: null } },
      },
      select: { id: true, firstName: true, lastName: true, hireDate: true },
    });
    const rows = [];
    for (const e of employees) {
      const review = await this.prisma.salaryReview.findFirst({
        where: { employeeId: e.id, status: 'applied' },
      });
      if (!review) {
        rows.push({
          employeeId: e.id,
          name: `${e.firstName} ${e.lastName}`,
          hireDate: e.hireDate,
          note: 'Salary review data redacted unless authorized',
        });
      }
    }
    return rows;
  }

  private async teamLeaveThisMonth(companyId: string) {
    const start = new Date();
    start.setDate(1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        companyId,
        status: 'approved',
        startDate: { gte: start, lt: end },
      },
      select: { id: true, employeeId: true },
    });
    const teamCounts = new Map<string, number>();
    for (const leave of leaves) {
      const assignment = await this.prisma.employeeAssignment.findFirst({
        where: { employeeId: leave.employeeId, companyId, effectiveTo: null, isPrimaryTeam: true },
        select: { teamId: true },
      });
      const teamId = assignment?.teamId ?? 'unassigned';
      teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
    }
    const rows = [];
    for (const [teamId, leaveCount] of teamCounts.entries()) {
      const team = teamId !== 'unassigned'
        ? await this.prisma.team.findUnique({ where: { id: teamId }, select: { name: true } })
        : null;
      rows.push({ teamId, teamName: team?.name ?? 'Unassigned', leaveCount });
    }
    return rows.sort((a, b) => (b.leaveCount as number) - (a.leaveCount as number));
  }

  private async unacknowledgedAnnouncements(companyId: string) {
    const announcements = await this.prisma.announcement.findMany({
      where: { companyId, status: 'published' },
      orderBy: { publishedAt: 'desc' },
      take: 5,
    });
    const rows = [];
    for (const a of announcements) {
      const total = await this.prisma.announcementDelivery.count({ where: { announcementId: a.id } });
      const ack = await this.prisma.announcementDelivery.count({
        where: { announcementId: a.id, acknowledgedAt: { not: null } },
      });
      if (ack < total) {
        rows.push({ announcementId: a.id, title: a.title, unacknowledged: total - ack });
      }
    }
    return rows;
  }

  private async defaultEmployeeList(companyId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { assignments: { some: { companyId, effectiveTo: null } }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, employmentStatus: true, hireDate: true },
      take: 50,
    });
    return employees.map((e) => ({
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName}`,
      status: e.employmentStatus,
      hireDate: e.hireDate,
    }));
  }
}

@Injectable()
export class KnowledgeGraphService {
  constructor(
    private readonly graphQuery: GraphQueryService,
    private readonly resolver: GraphEntityResolverService,
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  async query(actor: ActorContext, companyId: string, naturalLanguageQuery: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.graphQuery.executeNaturalQuery(actor, companyId, naturalLanguageQuery);
  }

  async employeeContext(actor: ActorContext, employeeId: string) {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    return this.resolver.employeeContext(employeeId);
  }

  teamSummary(actor: ActorContext, teamId: string, companyId: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.resolver.teamSummary(teamId);
  }

  companySummary(actor: ActorContext, companyId: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.resolver.companySummary(companyId);
  }
}
