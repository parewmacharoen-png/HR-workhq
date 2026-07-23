// ============================================================================
// Manual payroll item HTTP endpoints
// ============================================================================

import {
  Body, Controller, Delete, Get, Param, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { ManualPayrollItemService } from '../../application/manual-payroll-item.service';
import { CreateManualPayrollItemDto } from '../../application/dto/manual-payroll-item.dto';

@Controller('payroll/manual-items')
export class ManualPayrollItemController {
  constructor(private readonly service: ManualPayrollItemService) {}

  @Post()
  @RequirePermission('payroll:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateManualPayrollItemDto) {
    return this.service.create(actor, dto);
  }

  @Get()
  @RequirePermission('payroll:read')
  list(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.list(actor, companyId, employeeId);
  }

  @Delete(':id')
  @RequirePermission('payroll:write')
  cancel(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.cancel(actor, id);
  }
}
