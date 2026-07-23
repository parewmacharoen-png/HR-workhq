// ============================================================================
// modules/marketing/interface/http/marketing-daily-report.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { MarketingDailyReportService } from '../../application/marketing-daily-report.service';
import {
  CreateMarketingDailyReportDto,
  RejectMarketingDailyReportDto,
  UpdateMarketingDailyReportDto,
  VoidMarketingDailyReportDto,
} from '../../application/dto/marketing-daily-report.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

class MyReportQuery {
  @IsUUID() companyId!: string;
  @IsDateString() date!: string;
}

@Controller('marketing/daily-reports')
export class MarketingDailyReportController {
  constructor(private readonly service: MarketingDailyReportService) {}

  @Post()
  @RequirePermission('marketing:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateMarketingDailyReportDto) {
    return this.service.createOrUpdateReport(actor, dto);
  }

  @Patch(':id')
  @RequirePermission('marketing:write')
  patch(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateMarketingDailyReportDto,
  ) {
    return this.service.patchReport(actor, id, dto);
  }

  @Post(':id/submit')
  @RequirePermission('marketing:write')
  submit(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.submitReport(actor, id);
  }

  @Post(':id/approve')
  @RequirePermission('marketing:approve')
  approve(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.approveReport(actor, id);
  }

  @Post(':id/reject')
  @RequirePermission('marketing:approve')
  reject(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: RejectMarketingDailyReportDto,
  ) {
    return this.service.rejectReport(actor, id, dto);
  }

  @Post(':id/void')
  @RequirePermission('marketing:audit')
  voidReport(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: VoidMarketingDailyReportDto,
  ) {
    return this.service.voidReport(actor, id, dto);
  }

  @Get('me')
  @RequirePermission('marketing:read')
  myReport(@CurrentActor() actor: ActorContext, @Query() q: MyReportQuery) {
    return this.service.getMyReportByDate(actor, q.companyId, q.date);
  }
}
