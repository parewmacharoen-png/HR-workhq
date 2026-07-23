// ============================================================================
// modules/commission/interface/http/commission-declaration.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { CommissionDeclarationService } from '../../application/commission-declaration.service';

class RejectDeclarationDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

@Controller('commission/declarations')
export class CommissionDeclarationController {
  constructor(private readonly service: CommissionDeclarationService) {}

  @Get()
  @RequirePermission('commission:read')
  list(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('status') status?: string,
  ) {
    return this.service.list(actor, companyId, status);
  }

  @Get('summary')
  @RequirePermission('commission:read')
  summary(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.service.getSummary(actor, companyId);
  }

  @Post(':id/hr-review')
  @RequirePermission('commission:declaration:review')
  hrReview(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.hrReview(actor, id);
  }

  @Post(':id/approve')
  @RequirePermission('commission:declaration:approve')
  approve(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.approve(actor, id);
  }

  @Post(':id/reject')
  @RequirePermission('commission:declaration:reject')
  reject(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: RejectDeclarationDto,
  ) {
    return this.service.reject(actor, id, dto.reason);
  }
}
