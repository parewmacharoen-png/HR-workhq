// ============================================================================
// modules/disciplinary/interface/http/disciplinary.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { DisciplinaryActionService } from '../../application/disciplinary-action.service';
import { CreateDisciplinaryActionDto } from '../../application/dto/disciplinary.dto';

@Controller()
export class DisciplinaryController {
  constructor(private readonly service: DisciplinaryActionService) {}

  @Get('employees/:id/disciplinary')
  @RequirePermission('employee:read')
  listForEmployee(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
  ) {
    return this.service.listEmployeeActions(actor, employeeId);
  }

  @Post('employees/:id/disciplinary')
  @RequirePermission('employee:write')
  create(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
    @Body() dto: CreateDisciplinaryActionDto,
  ) {
    return this.service.createAction(actor, employeeId, dto);
  }

  @Get('disciplinary-actions/:id')
  @RequirePermission('employee:read')
  getById(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getById(actor, id);
  }

  @Post('disciplinary-actions/:id/acknowledge')
  @RequirePermission('employee:read')
  acknowledge(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.acknowledgeAction(actor, id);
  }
}
