// ============================================================================
// RuleConfigService — versioned company commission settings
// ============================================================================

import { BadRequestException, Injectable } from '@nestjs/common';
import { RuleConfigDomain } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  AdminCommissionRuleConfig,
  DEFAULT_ADMIN_COMMISSION_CONFIG,
  DEFAULT_MARKETING_COMMISSION_CONFIG,
  MarketingCommissionRuleConfig,
  RuleConfigDomainKey,
} from '../domain/rule-config.defaults';

export interface RuleConfigVersionResponse {
  versionNumber: number;
  config: MarketingCommissionRuleConfig | AdminCommissionRuleConfig;
  reason: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface RuleConfigResponse {
  companyId: string;
  domain: RuleConfigDomainKey;
  activeVersion: number | null;
  config: MarketingCommissionRuleConfig | AdminCommissionRuleConfig;
  versions: RuleConfigVersionResponse[];
}

@Injectable()
export class RuleConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  async getMarketingConfig(companyId: string): Promise<MarketingCommissionRuleConfig> {
    const resolved = await this.getConfig(companyId, 'marketing_commission');
    return resolved.config as MarketingCommissionRuleConfig;
  }

  async getAdminConfig(companyId: string): Promise<AdminCommissionRuleConfig> {
    const resolved = await this.getConfig(companyId, 'admin_commission');
    return resolved.config as AdminCommissionRuleConfig;
  }

  async getConfig(companyId: string, domain: RuleConfigDomainKey): Promise<RuleConfigResponse> {
    const defaults = domain === 'marketing_commission'
      ? DEFAULT_MARKETING_COMMISSION_CONFIG
      : DEFAULT_ADMIN_COMMISSION_CONFIG;

    const profile = await this.prisma.ruleConfigProfile.findUnique({
      where: { companyId_domain: { companyId, domain: domain as RuleConfigDomain } },
      include: {
        versions: { orderBy: { versionNumber: 'desc' }, take: 20 },
      },
    });

    if (!profile) {
      return {
        companyId,
        domain,
        activeVersion: null,
        config: defaults,
        versions: [],
      };
    }

    const active = profile.versions.find((v) => v.isActive);
    const merged = active
      ? { ...defaults, ...(active.config as object) }
      : defaults;

    return {
      companyId,
      domain,
      activeVersion: active?.versionNumber ?? null,
      config: merged,
      versions: profile.versions.map((v) => ({
        versionNumber: v.versionNumber,
        config: { ...defaults, ...(v.config as object) },
        reason: v.reason,
        isActive: v.isActive,
        createdBy: v.createdBy,
        createdAt: v.createdAt.toISOString(),
      })),
    };
  }

  async updateConfig(
    actor: ActorContext,
    companyId: string,
    domain: RuleConfigDomainKey,
    config: Record<string, unknown>,
    reason: string,
  ): Promise<RuleConfigResponse> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    this.validateConfig(domain, config);

    const profile = await this.prisma.ruleConfigProfile.upsert({
      where: { companyId_domain: { companyId, domain: domain as RuleConfigDomain } },
      create: { companyId, domain: domain as RuleConfigDomain },
      update: {},
    });

    const latest = await this.prisma.ruleConfigVersion.findFirst({
      where: { profileId: profile.id },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    await this.prisma.$transaction([
      this.prisma.ruleConfigVersion.updateMany({
        where: { profileId: profile.id, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.ruleConfigVersion.create({
        data: {
          profileId: profile.id,
          versionNumber,
          config: config as object,
          reason,
          isActive: true,
          createdBy: actor.userId,
        },
      }),
    ]);

    await this.audit.record(actor, {
      entityType: 'RuleConfigProfile',
      entityId: profile.id,
      action: 'update_config',
      after: { companyId, domain, versionNumber, reason, config },
    });

    return this.getConfig(companyId, domain);
  }

  private validateConfig(domain: RuleConfigDomainKey, config: Record<string, unknown>): void {
    if (!config || typeof config !== 'object') {
      throw new BadRequestException('Config must be an object');
    }
    if (domain === 'marketing_commission') {
      const pctFields = ['teamPoolPercent', 'bigLeaderPercent', 'companyHeadDeductionPercent'] as const;
      for (const field of pctFields) {
        const val = config[field];
        if (val != null && (typeof val !== 'number' || val < 0 || val > 100)) {
          throw new BadRequestException(`${field} must be between 0 and 100`);
        }
      }
    }
    if (domain === 'admin_commission') {
      for (const field of ['poolAPercent', 'poolBPercent'] as const) {
        const val = config[field];
        if (val != null && (typeof val !== 'number' || val < 0 || val > 100)) {
          throw new BadRequestException(`${field} must be between 0 and 100`);
        }
      }
    }
  }
}
