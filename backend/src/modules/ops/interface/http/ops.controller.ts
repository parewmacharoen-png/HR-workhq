// ============================================================================
// modules/ops/interface/http/ops.controller.ts
// ============================================================================

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { OpsService } from '../../application/ops.service';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('ops')
export class OpsController {
  constructor(private readonly service: OpsService) {}

  @Get('health')
  @RequirePermission('reporting:owner')
  health(@CurrentActor() actor: ActorContext) {
    return this.service.getHealth(actor);
  }

  @Post('actions/retry-outbox')
  @RequirePermission('settings:write')
  retryOutbox(@CurrentActor() actor: ActorContext) {
    return this.service.retryOutbox(actor);
  }

  @Post('actions/rerun-announcement-reminders')
  @RequirePermission('settings:write')
  rerunAnnouncements(@CurrentActor() actor: ActorContext) {
    return this.service.rerunAnnouncementReminders(actor);
  }

  @Post('actions/rerun-attendance-alerts')
  @RequirePermission('settings:write')
  rerunAttendance(
    @CurrentActor() actor: ActorContext,
    @Body('companyId') companyId: string,
  ) {
    return this.service.rerunAttendanceAlerts(actor, companyId);
  }
}
