// ============================================================================
// modules/calendar/application/team-calendar-scope.service.ts
// TEAM-001 — role-based visibility resolver
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';

export interface CalendarScope {
  role: string;
  companyId: string | null;
  teamId: string | null;
  companyIds: string[];
  employeeIds: string[] | null;
}

@Injectable()
export class TeamCalendarScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async resolve(actor: ActorContext, companyId?: string, teamId?: string): Promise<CalendarScope> {
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? 'employee';

    if (role === 'owner') {
      const companies = companyId
        ? [companyId]
        : (await this.prisma.company.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true } }))
            .map((c) => c.id);
      if (companyId) await this.companyAccess.assertCompanyAccess(actor, companyId);
      return {
        role,
        companyId: companyId ?? null,
        teamId: teamId ?? null,
        companyIds: companies,
        employeeIds: null,
      };
    }

    const empId = access?.employeeId;
    if (!empId) {
      return { role, companyId: null, teamId: null, companyIds: [], employeeIds: [] };
    }

    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId: empId, effectiveTo: null, deletedAt: null },
      orderBy: [{ isPrimaryCompany: 'desc' }, { isPrimaryTeam: 'desc' }],
      include: { team: { select: { id: true, name: true, companyId: true } } },
    });
    const primaryCompanyId = assignment?.companyId ?? companyId ?? null;
    const primaryTeamId = assignment?.teamId ?? null;

    if (role === 'secretary' || role === 'big_leader') {
      const cid = companyId ?? primaryCompanyId;
      if (!cid) return { role, companyId: null, teamId: null, companyIds: [], employeeIds: [] };
      await this.companyAccess.assertCompanyAccess(actor, cid);
      if (teamId) {
        const members = await this.teamMemberIds(teamId);
        return { role, companyId: cid, teamId, companyIds: [cid], employeeIds: members };
      }
      return { role, companyId: cid, teamId: null, companyIds: [cid], employeeIds: null };
    }

    if (role === 'sub_leader') {
      const tid = teamId ?? primaryTeamId;
      const cid = companyId ?? primaryCompanyId;
      if (!cid || !tid) return { role, companyId: cid, teamId: tid, companyIds: cid ? [cid] : [], employeeIds: [empId] };
      await this.companyAccess.assertCompanyAccess(actor, cid);
      const members = await this.teamMemberIds(tid);
      return { role, companyId: cid, teamId: tid, companyIds: [cid], employeeIds: members };
    }

    // employee
    const tid = primaryTeamId;
    const cid = primaryCompanyId;
    if (!cid) return { role, companyId: null, teamId: null, companyIds: [], employeeIds: [empId] };
    await this.companyAccess.assertCompanyAccess(actor, cid);
    const members = tid ? await this.teamMemberIds(tid) : [empId];
    return { role, companyId: cid, teamId: tid, companyIds: [cid], employeeIds: members };
  }

  private async teamMemberIds(teamId: string): Promise<string[]> {
    const rows = await this.prisma.employeeAssignment.findMany({
      where: { teamId, effectiveTo: null, deletedAt: null },
      select: { employeeId: true },
    });
    return [...new Set(rows.map((r) => r.employeeId))];
  }
}
