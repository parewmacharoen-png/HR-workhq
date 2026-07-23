// ============================================================================
// modules/payroll/interface/http/payroll-overview.controller.ts
// PAY-007
// ============================================================================

import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { PayrollOverviewService } from '../../application/payroll-overview.service';
import { PayrollOverviewQueryDto } from '../../application/dto/payroll-overview.dto';

@Controller('payroll')
export class PayrollOverviewController {
  constructor(private readonly service: PayrollOverviewService) {}

  @Get('cycles/:id/overview')
  @RequirePermission('payroll:read')
  getOverview(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Query() query: PayrollOverviewQueryDto,
  ) {
    return this.service.getOverview(actor, id, query);
  }

  @Get('cycles/:id/overview/employees/:employeeId')
  @RequirePermission('payroll:read')
  getEmployeeDetail(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.getEmployeeDetail(actor, id, employeeId);
  }

  @Post('cycles/:id/overview/log-export-initiated')
  @RequirePermission('payroll:read')
  logExportInitiated(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.logExportInitiated(actor, id);
  }
}
