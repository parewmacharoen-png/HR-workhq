// ============================================================================
// modules/commission/application/admin-commission-query.service.ts
// Read-only admin commission summaries for reporting / AI / Telegram
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_COMMISSION_REPOSITORY,
  AdminCommissionRepository,
} from '../domain/repositories/admin-commission.repository';
import { AdminCommissionSummaryResponse } from './dto/admin-commission.dto';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { ActorContext } from '../../../shared/kernel/actor-context';

@Injectable()
export class AdminCommissionQueryService {
  constructor(
    @Inject(ADMIN_COMMISSION_REPOSITORY) private readonly repo: AdminCommissionRepository,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  async getCompanySummary(
    actor: ActorContext,
    companyId: string,
    earnCycleId?: string,
  ): Promise<AdminCommissionSummaryResponse> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const summary = await this.repo.companySummary(companyId, earnCycleId);
    return {
      companyId,
      earnCycleId: earnCycleId ?? null,
      ...summary,
    };
  }
}
