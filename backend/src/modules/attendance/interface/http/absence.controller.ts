// ============================================================================
// modules/attendance/interface/http/absence.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AbsenceRecordService } from '../../application/absence-record.service';
import {
  ApproveAbsenceDto, DisputeAbsenceDto, ListAbsencesQueryDto, RunAbsenceFlagDto, WaiveAbsenceDto,
} from '../../application/dto/absence.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('attendance/absences')
export class AbsenceController {
  constructor(private readonly service: AbsenceRecordService) {}

  @Get()
  @RequirePermission('attendance:read')
  list(@CurrentActor() actor: ActorContext, @Query() query: ListAbsencesQueryDto) {
    return this.service.list(actor, query);
  }

  @Post('run-flag')
  @RequirePermission('attendance:write')
  runFlag(@CurrentActor() actor: ActorContext, @Body() dto: RunAbsenceFlagDto) {
    return this.service.runFlag(actor, dto.companyId, dto.workDate);
  }

  @Get(':id')
  @RequirePermission('attendance:read')
  getById(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getById(actor, id);
  }

  @Post(':id/approve')
  @RequirePermission('attendance:write')
  approve(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: ApproveAbsenceDto,
  ) {
    return this.service.approve(actor, id, dto);
  }

  @Post(':id/waive')
  @RequirePermission('attendance:write')
  waive(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: WaiveAbsenceDto,
  ) {
    return this.service.waive(actor, id, dto);
  }

  @Post(':id/dispute')
  @RequirePermission('attendance:write')
  dispute(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: DisputeAbsenceDto,
  ) {
    return this.service.dispute(actor, id, dto);
  }
}
