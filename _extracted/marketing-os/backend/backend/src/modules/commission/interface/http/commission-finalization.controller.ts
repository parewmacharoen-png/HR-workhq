// ============================================================================
// modules/commission/interface/http/commission-finalization.controller.ts
// ============================================================================

import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CommissionFinalizationService } from '../../application/commission-finalization.service';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import {
  CommissionCycleStatus,
  CommissionCycleType,
} from '../../domain/repositories/commission-finalization.repository';

class ListCyclesQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
  @IsOptional() @IsEnum(['marketing', 'admin', 'referral', 'recruitment']) type?: CommissionCycleType;
  @IsOptional() @IsEnum(['draft', 'approved', 'finalized', 'locked']) status?: CommissionCycleStatus;
}

@Controller('commission/cycles')
export class CommissionFinalizationController {
  constructor(private readonly service: CommissionFinalizationService) {}

  @Get()
  @RequirePermission('commission:read')
  list(@CurrentActor() actor: ActorContext, @Query() q: ListCyclesQuery) {
    return this.service.listCycles(actor, q);
  }

  @Get(':id')
  @RequirePermission('commission:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getCycle(actor, id);
  }

  @Get(':id/preview')
  @RequirePermission('commission:read')
  preview(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.previewCycle(actor, id);
  }

  @Post(':id/approve')
  @RequirePermission('commission:write')
  approve(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.approveCycle(actor, id);
  }

  @Post(':id/finalize')
  @RequirePermission('commission:write')
  finalize(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.finalizeCycle(actor, id);
  }

  @Post(':id/lock')
  @RequirePermission('commission:write')
  lock(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.lockCycle(actor, id);
  }
}
