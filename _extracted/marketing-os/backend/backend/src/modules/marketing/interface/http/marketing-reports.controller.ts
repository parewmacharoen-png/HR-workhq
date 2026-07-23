// ============================================================================
// modules/marketing/interface/http/marketing-reports.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MarketingBackOfficeService } from '../../application/marketing-backoffice.service';
import {
  BackOfficePatchMarketingReportDto,
  BackOfficeRejectMarketingReportDto,
  BackOfficeVoidMarketingReportDto,
  ListMarketingReportsQuery,
} from '../../application/dto/marketing-backoffice.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('marketing/reports')
export class MarketingReportsController {
  constructor(private readonly backOffice: MarketingBackOfficeService) {}

  @Get()
  @RequirePermission('marketing:read')
  list(@CurrentActor() actor: ActorContext, @Query() query: ListMarketingReportsQuery) {
    return this.backOffice.listReports(actor, query);
  }

  @Get(':id')
  @RequirePermission('marketing:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.backOffice.getReport(actor, id);
  }

  @Patch(':id')
  @RequirePermission('marketing:write')
  patch(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: BackOfficePatchMarketingReportDto,
  ) {
    return this.backOffice.patchReport(actor, id, dto);
  }

  @Post(':id/approve')
  @RequirePermission('marketing:approve')
  approve(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.backOffice.approveReport(actor, id);
  }

  @Post(':id/reject')
  @RequirePermission('marketing:approve')
  reject(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: BackOfficeRejectMarketingReportDto,
  ) {
    return this.backOffice.rejectReport(actor, id, dto);
  }

  @Post(':id/void')
  @RequirePermission('marketing:audit')
  voidReport(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: BackOfficeVoidMarketingReportDto,
  ) {
    return this.backOffice.voidReport(actor, id, dto);
  }

  @Get(':id/audit')
  @RequirePermission('marketing:audit')
  audit(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.backOffice.listReportAudit(actor, id);
  }
}
