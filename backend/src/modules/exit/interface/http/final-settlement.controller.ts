// ============================================================================
// modules/exit/interface/http/final-settlement.controller.ts
// PAY-005
// ============================================================================

import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { FinalSettlementService } from '../../application/final-settlement.service';
import { UpdateFinalSettlementDto } from '../../application/dto/final-settlement.dto';

@Controller('final-settlements')
export class FinalSettlementController {
  constructor(private readonly service: FinalSettlementService) {}

  @Get(':id')
  @RequirePermission('employee:read')
  getById(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getById(actor, id);
  }

  @Patch(':id')
  @RequirePermission('employee:write')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateFinalSettlementDto,
  ) {
    return this.service.update(actor, id, dto);
  }

  @Post(':id/submit')
  @RequirePermission('employee:write')
  submit(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.submit(actor, id);
  }

  @Post(':id/approve')
  @RequirePermission('employee:write')
  approve(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.approve(actor, id);
  }

  @Post(':id/mark-paid')
  @RequirePermission('employee:write')
  markPaid(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.markPaid(actor, id);
  }

  @Post(':id/recalculate')
  @RequirePermission('employee:write')
  recalculate(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.recalculate(actor, id);
  }

  @Post(':id/cancel')
  @RequirePermission('employee:write')
  cancel(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.cancel(actor, id);
  }
}
