// ============================================================================
// modules/marketing/interface/http/marketing-audit.controller.ts
// ============================================================================

import { Controller, Get, Query } from '@nestjs/common';
import { MarketingBackOfficeService } from '../../application/marketing-backoffice.service';
import { SearchMarketingAuditQuery } from '../../application/dto/marketing-backoffice.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('marketing/audit')
export class MarketingAuditController {
  constructor(private readonly backOffice: MarketingBackOfficeService) {}

  @Get()
  @RequirePermission('marketing:audit')
  search(@CurrentActor() actor: ActorContext, @Query() query: SearchMarketingAuditQuery) {
    return this.backOffice.searchAudit(actor, query);
  }
}
