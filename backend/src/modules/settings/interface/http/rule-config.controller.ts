// ============================================================================
// modules/settings/interface/http/rule-config.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { IsObject, IsString, MinLength } from 'class-validator';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { RuleConfigService } from '../../application/rule-config.service';

class UpdateRuleConfigDto {
  @IsObject() config!: Record<string, unknown>;
  @IsString() @MinLength(3) reason!: string;
}

@Controller('settings/commission')
export class RuleConfigController {
  constructor(private readonly service: RuleConfigService) {}

  @Get('marketing')
  @RequirePermission('reporting:owner')
  getMarketing(@Query('companyId') companyId: string) {
    return this.service.getConfig(companyId, 'marketing_commission');
  }

  @Put('marketing')
  @RequirePermission('reporting:owner')
  updateMarketing(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Body() dto: UpdateRuleConfigDto,
  ) {
    return this.service.updateConfig(
      actor,
      companyId,
      'marketing_commission',
      dto.config,
      dto.reason,
    );
  }

  @Get('admin')
  @RequirePermission('reporting:owner')
  getAdmin(@Query('companyId') companyId: string) {
    return this.service.getConfig(companyId, 'admin_commission');
  }

  @Put('admin')
  @RequirePermission('reporting:owner')
  updateAdmin(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Body() dto: UpdateRuleConfigDto,
  ) {
    return this.service.updateConfig(
      actor,
      companyId,
      'admin_commission',
      dto.config,
      dto.reason,
    );
  }
}
