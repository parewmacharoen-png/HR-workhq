// ============================================================================
// modules/commission/application/marketing-commission-query.service.ts
// Read-only marketing commission summaries for reporting / AI / Telegram
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  MARKETING_COMMISSION_REPOSITORY,
  MarketingCommissionRepository,
} from '../domain/repositories/marketing-commission.repository';
import { MarketingCommissionSummaryResponse } from './dto/marketing-commission.dto';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { ActorContext } from '../../../shared/kernel/actor-context';

@Injectable()
export class MarketingCommissionQueryService {
  constructor(
    @Inject(MARKETING_COMMISSION_REPOSITORY) private readonly repo: MarketingCommissionRepository,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  async getCompanySummary(
    actor: ActorContext,
    companyId: string,
    earnCycleId?: string,
  ): Promise<MarketingCommissionSummaryResponse> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const summary = await this.repo.companySummary(companyId, earnCycleId);
    return {
      companyId,
      earnCycleId: earnCycleId ?? null,
      ...summary,
    };
  }
}
