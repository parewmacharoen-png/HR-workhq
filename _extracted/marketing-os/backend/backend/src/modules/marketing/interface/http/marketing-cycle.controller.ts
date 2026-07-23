// ============================================================================
// modules/marketing/interface/http/marketing-cycle.controller.ts
// ============================================================================

import { Body, Controller, Param, Post } from '@nestjs/common';
import { MarketingCycleLockService } from '../../application/marketing-cycle-lock.service';
import {
  LockMarketingCycleDto,
  UnlockMarketingCycleDto,
} from '../../application/dto/marketing-backoffice.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('marketing/cycles')
export class MarketingCycleController {
  constructor(private readonly cycleLock: MarketingCycleLockService) {}

  @Post(':earnCycleId/lock')
  @RequirePermission('marketing:lock')
  lock(
    @CurrentActor() actor: ActorContext,
    @Param('earnCycleId') earnCycleId: string,
    @Body() dto: LockMarketingCycleDto,
  ) {
    return this.cycleLock.lockCycle(actor, earnCycleId, dto.reason, dto.companyId);
  }

  @Post(':earnCycleId/unlock')
  @RequirePermission('marketing:lock')
  unlock(
    @CurrentActor() actor: ActorContext,
    @Param('earnCycleId') earnCycleId: string,
    @Body() dto: UnlockMarketingCycleDto,
  ) {
    return this.cycleLock.unlockCycle(actor, earnCycleId, dto.reason, dto.companyId);
  }
}
