// ============================================================================
// modules/leave/interface/http/leave.controller.ts
// ============================================================================

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { LeaveService } from '../../application/leave.service';
import {
  RequestLeaveDto, ConvertHolidayDto, RequestLeaveRescheduleDto, RequestLeaveShiftSwapDto,
  UpdateLeaveRequestDto,
} from '../../application/dto/leave.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('leave')
export class LeaveController {
  constructor(private readonly service: LeaveService) {}

  @Post('employees/:employeeId/requests')
  @RequirePermission('leave:write')
  request(@CurrentActor() actor: ActorContext, @Param('employeeId') employeeId: string, @Body() dto: RequestLeaveDto) {
    return this.service.requestLeave(actor, employeeId, dto);
  }

  @Get('requests')
  @RequirePermission('leave:read')
  listRequests(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('status') status?: string,
  ) {
    return this.service.listRequests(actor, companyId, status);
  }

  @Get('requests/:id')
  @RequirePermission('leave:read')
  getRequest(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getRequest(actor, id);
  }

  @Patch('requests/:id')
  @RequirePermission('leave:write')
  updateRequest(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestDto,
  ) {
    return this.service.updateLeaveRequest(actor, id, dto);
  }

  @Delete('requests/:id')
  @RequirePermission('leave:write')
  deleteRequest(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.deleteLeaveRequest(actor, id);
  }

  @Get('employees/:employeeId/balances')
  @RequirePermission('leave:read')
  listBalances(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Query('companyId') companyId: string,
  ) {
    return this.service.getEmployeeLeaveBalances(actor, employeeId, companyId);
  }

  @Post('employees/:employeeId/holiday-conversion')
  @RequirePermission('leave:write')
  convertHoliday(@CurrentActor() actor: ActorContext, @Param('employeeId') employeeId: string, @Body() dto: ConvertHolidayDto) {
    return this.service.convertHoliday(actor, employeeId, dto);
  }

  @Get('employees/:employeeId/approved-requests')
  @RequirePermission('leave:read')
  listApproved(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Query('companyId') companyId: string,
  ) {
    return this.service.listApprovedLeaveRequests(actor, employeeId, companyId);
  }

  @Post('employees/:employeeId/reschedule-requests')
  @RequirePermission('leave:write')
  requestReschedule(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Body() dto: RequestLeaveRescheduleDto,
  ) {
    return this.service.requestReschedule(actor, employeeId, dto);
  }

  @Get('reschedule-requests')
  @RequirePermission('leave:read')
  listReschedules(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.service.listRescheduleRequests(actor, companyId);
  }

  @Get('reschedule-requests/:id')
  @RequirePermission('leave:read')
  getReschedule(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getRescheduleRequest(actor, id);
  }

  @Post('employees/:employeeId/shift-swaps')
  @RequirePermission('leave:write')
  requestShiftSwap(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Body() dto: RequestLeaveShiftSwapDto,
  ) {
    return this.service.requestShiftSwap(actor, employeeId, dto);
  }

  @Post('shift-swaps/:id/partner-agree')
  @RequirePermission('leave:write')
  agreeShiftSwap(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.agreeShiftSwap(actor, id);
  }

  @Get('shift-swaps')
  @RequirePermission('leave:read')
  listShiftSwaps(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.service.listShiftSwaps(actor, companyId);
  }

  @Get('shift-swaps/:id')
  @RequirePermission('leave:read')
  getShiftSwap(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getShiftSwapRequest(actor, id);
  }
}
