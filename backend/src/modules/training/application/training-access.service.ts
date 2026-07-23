// ============================================================================
// modules/training/application/training-access.service.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';

@Injectable()
export class TrainingAccessService {
  constructor(private readonly companyAccess: CompanyAccessService) {}

  async assertCanManage(actor: ActorContext, companyId: string | null): Promise<void> {
    if (!companyId) throw new Error('Company required');
    await this.companyAccess.assertCompanyAccess(actor, companyId);
  }

  async assertCanView(actor: ActorContext, companyId: string | null): Promise<void> {
    if (companyId) {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
    }
  }
}
