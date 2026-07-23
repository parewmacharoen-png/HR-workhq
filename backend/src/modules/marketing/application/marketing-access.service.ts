// ============================================================================
// MarketingAccessService — role-based edit permissions for marketing reports
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { PermissionService } from '../../permission/application/permission.service';
import { MarketingDailyReportRow } from '../domain/repositories/marketing-daily-report.repository';
import {
  MARKETING_TEAM_REPOSITORY,
  MarketingTeamRepository,
} from '../domain/repositories/marketing-team.repository';
import {
  MarketingDailyReportNotEditableError,
  MarketingEditReasonRequiredError,
  MarketingReportAccessDeniedError,
} from '../domain/errors/marketing.errors';

export type MarketingEditScope = 'employee' | 'leader' | 'admin';

@Injectable()
export class MarketingAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly permissions: PermissionService,
    @Inject(MARKETING_TEAM_REPOSITORY)
    private readonly marketingTeams: MarketingTeamRepository,
  ) {}

  async assertCanEdit(
    actor: ActorContext,
    report: MarketingDailyReportRow,
    reason?: string | null,
    options: { requireReason?: boolean } = {},
  ): Promise<MarketingEditScope> {
    const scope = await this.resolveEditScope(actor, report);
    if (!scope) {
      if (['approved', 'rejected', 'voided'].includes(report.status)) {
        throw new MarketingDailyReportNotEditableError(report.status);
      }
      throw new MarketingReportAccessDeniedError();
    }

    const needsReason = options.requireReason !== false
      && (scope === 'leader' || scope === 'admin');
    if (needsReason && !reason?.trim()) {
      throw new MarketingEditReasonRequiredError();
    }

    return scope;
  }

  async resolveEditScope(
    actor: ActorContext,
    report: MarketingDailyReportRow,
  ): Promise<MarketingEditScope | null> {
    await this.companyAccess.assertCompanyAccess(actor, report.companyId);

    if (await this.companyAccess.hasAllScope(actor.userId)) {
      if (this.isEditableStatus(report.status)) return 'admin';
      return null;
    }

    if (await this.hasPermission(actor.userId, 'marketing:audit', report.companyId)) {
      if (this.isEditableStatus(report.status)) return 'admin';
      return null;
    }

    const actorEmployeeId = await this.employeeIdForUser(actor.userId);
    if (actorEmployeeId === report.employeeId) {
      if (report.status === 'draft' || report.status === 'submitted') {
        return 'employee';
      }
      return null;
    }

    if (actorEmployeeId && await this.isLeaderOfEmployee(
      actorEmployeeId,
      report.employeeId,
      report.companyId,
      report.reportDate,
    )) {
      if (this.isEditableStatus(report.status)) return 'leader';
      return null;
    }

    return null;
  }

  async assertCanViewTeamReports(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    if (await this.companyAccess.hasAllScope(actor.userId)) return;
    if (await this.hasPermission(actor.userId, 'marketing:audit', companyId)) return;
    if (await this.hasPermission(actor.userId, 'marketing:approve', companyId)) return;

    const employeeId = await this.employeeIdForUser(actor.userId);
    if (employeeId && await this.isLeader(employeeId)) return;

    throw new MarketingReportAccessDeniedError();
  }

  private isEditableStatus(status: string): boolean {
    return status !== 'approved' && status !== 'rejected' && status !== 'voided';
  }

  private async employeeIdForUser(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    return user?.employeeId ?? null;
  }

  private async isLeader(employeeId: string): Promise<boolean> {
    const subLeaderTeam = await this.prisma.marketingTeam.findFirst({
      where: {
        subLeaderEmployeeId: employeeId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    if (subLeaderTeam) return true;

    const bigLeaderRoot = await this.prisma.marketingTeam.findFirst({
      where: {
        bigLeaderEmployeeId: employeeId,
        level: 'root',
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    return !!bigLeaderRoot;
  }

  private async isLeaderOfEmployee(
    leaderEmployeeId: string,
    targetEmployeeId: string,
    companyId: string,
    asOf: Date,
  ): Promise<boolean> {
    const leaderTeam = await this.prisma.marketingTeam.findFirst({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        OR: [
          { subLeaderEmployeeId: leaderEmployeeId },
          { bigLeaderEmployeeId: leaderEmployeeId, level: 'root' },
        ],
      },
      select: { id: true, level: true },
    });
    if (!leaderTeam) return false;

    const targetMembership = await this.marketingTeams.getEmployeeMarketingTeamAtDate(
      companyId,
      targetEmployeeId,
      asOf,
    );
    if (!targetMembership) return false;

    if (leaderTeam.level === 'root') {
      const rootId = await this.resolveRootTeamId(targetMembership.teamId);
      return rootId === leaderTeam.id;
    }

    return targetMembership.teamId === leaderTeam.id;
  }

  private async resolveRootTeamId(teamId: string): Promise<string | null> {
    let current = await this.marketingTeams.findById(teamId);
    while (current?.parentTeamId) {
      current = await this.marketingTeams.findById(current.parentTeamId);
    }
    return current?.id ?? null;
  }

  private async hasPermission(
    userId: string,
    permission: string,
    companyId?: string,
  ): Promise<boolean> {
    return this.permissions.can(userId, { permission, companyId });
  }
}
