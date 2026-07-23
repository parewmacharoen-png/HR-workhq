// ============================================================================
// modules/ai/application/ai-tool-context.service.ts
// Resolves employee/company context and leader scope for AI tools.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { AiToolExecutionContext } from '../domain/tool.types';
import { MarketingTeamService } from '../../marketing/application/marketing-team.service';

@Injectable()
export class AiToolContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly marketingTeams: MarketingTeamService,
  ) {}

  async resolve(
    actor: ActorContext,
    input: Record<string, unknown>,
  ): Promise<AiToolExecutionContext> {
    const inputCompanyId = typeof input.companyId === 'string' ? input.companyId : null;
    let companyId = actor.companyId
      ?? inputCompanyId
      ?? await this.primaryCompanyIdForUser(actor.userId);

    if (!companyId) {
      if (await this.companyAccess.hasAllScope(actor.userId)) {
        return {
          employeeId: await this.employeeIdForUser(actor.userId),
          companyId: inputCompanyId ?? '',
        };
      }
      throw new Error('companyId could not be resolved for this user');
    }

    await this.companyAccess.assertCompanyAccess(actor, companyId);

    const employeeId = await this.employeeIdForUser(actor.userId);
    return { employeeId, companyId };
  }

  async employeeIdForUser(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    return user?.employeeId ?? null;
  }

  async primaryCompanyIdForUser(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) return null;

    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId: user.employeeId,
        isPrimaryCompany: true,
        effectiveTo: null,
        deletedAt: null,
      },
      select: { companyId: true },
    });
    return assignment?.companyId ?? null;
  }

  async isTeamLeader(employeeId: string): Promise<boolean> {
    return this.marketingTeams.isMarketingLeader(employeeId);
  }

  async leaderTeamId(employeeId: string): Promise<string | null> {
    return this.marketingTeams.leaderMarketingTeamId(employeeId);
  }
}
