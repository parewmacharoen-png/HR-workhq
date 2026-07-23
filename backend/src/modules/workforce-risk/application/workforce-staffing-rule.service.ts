// ============================================================================
// modules/workforce-risk/application/workforce-staffing-rule.service.ts
// ============================================================================

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';
import type { StaffingRuleDto } from '../domain/workforce-risk.types';

export interface CreateStaffingRuleInput {
  companyId: string;
  teamId?: string | null;
  roleKey?: string | null;
  minimumRequired: number;
  targetRequired: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason?: string | null;
}

@Injectable()
export class WorkforceStaffingRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly time: BangkokTimeProvider,
  ) {}

  async list(actor: ActorContext, companyId: string): Promise<StaffingRuleDto[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.prisma.workforceStaffingRule.findMany({
      where: { companyId },
      orderBy: [{ effectiveFrom: 'desc' }, { teamId: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(actor: ActorContext, input: CreateStaffingRuleInput): Promise<StaffingRuleDto> {
    await this.companyAccess.assertCompanyAccess(actor, input.companyId);
    if (input.minimumRequired < 1) {
      throw new BadRequestException('minimumRequired must be at least 1');
    }
    if (input.targetRequired < input.minimumRequired) {
      throw new BadRequestException('targetRequired must be >= minimumRequired');
    }
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw new BadRequestException('effectiveTo must be on or after effectiveFrom');
    }
    const row = await this.prisma.workforceStaffingRule.create({
      data: {
        companyId: input.companyId,
        teamId: input.teamId ?? null,
        roleKey: input.roleKey?.trim() || null,
        minimumRequired: input.minimumRequired,
        targetRequired: input.targetRequired,
        effectiveFrom: this.time.parseWorkDate(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? this.time.parseWorkDate(input.effectiveTo) : null,
        createdById: actor.userId,
        reason: input.reason?.trim() || null,
      },
    });
    return this.toDto(row);
  }

  async findEffectiveRules(companyId: string, dateIso: string, teamId?: string | null) {
    const workDate = this.time.parseWorkDate(dateIso);
    return this.prisma.workforceStaffingRule.findMany({
      where: {
        companyId,
        effectiveFrom: { lte: workDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: workDate } }],
        ...(teamId !== undefined ? { teamId } : {}),
      },
      orderBy: [{ teamId: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  resolveRuleForTeam(
    rules: Awaited<ReturnType<WorkforceStaffingRuleService['findEffectiveRules']>>,
    teamId: string | null,
    memberCount: number,
  ): { minimumRequired: number; targetRequired: number } {
    const teamRule = rules.find((r) => r.teamId === teamId);
    const companyRule = rules.find((r) => r.teamId === null);
    const rule = teamRule ?? companyRule;
    if (rule) {
      return {
        minimumRequired: rule.minimumRequired,
        targetRequired: rule.targetRequired,
      };
    }
    return {
      minimumRequired: Math.max(1, Math.ceil(memberCount * 0.5)),
      targetRequired: memberCount,
    };
  }

  private toDto(row: {
    id: string;
    companyId: string;
    teamId: string | null;
    roleKey: string | null;
    minimumRequired: number;
    targetRequired: number;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    reason: string | null;
  }): StaffingRuleDto {
    return {
      id: row.id,
      companyId: row.companyId,
      teamId: row.teamId,
      roleKey: row.roleKey,
      minimumRequired: row.minimumRequired,
      targetRequired: row.targetRequired,
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
      reason: row.reason,
    };
  }
}
