// ============================================================================
// modules/attendance/interface/http/attendance.controller.ts
// Telegram-first actions exposed over HTTP (the bot calls these).
// ============================================================================

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AttendanceService } from '../../application/attendance.service';
import { AttendanceAlertService } from '../../application/attendance-alert.service';
import { AttendanceCorrectionService } from '../../application/attendance-correction.service';
import { CreateAttendanceCorrectionDto } from '../../application/dto/attendance-correction.dto';
import { UpdateAttendanceRecordDto } from '../../application/dto/update-attendance-record.dto';
import { DeleteAdminOvertimeDto } from '../../application/dto/admin-overtime.dto';
import { CheckInDto, CheckOutDto } from '../../application/dto/attendance.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly alertService: AttendanceAlertService,
    private readonly correctionService: AttendanceCorrectionService,
  ) {}

  @Post('employees/:employeeId/check-in')
  @RequirePermission('attendance:write')
  checkIn(@CurrentActor() actor: ActorContext, @Param('employeeId') employeeId: string, @Body() dto: CheckInDto) {
    return this.service.checkIn(actor, employeeId, dto);
  }

  @Post('employees/:employeeId/check-out')
  @RequirePermission('attendance:write')
  checkOut(@CurrentActor() actor: ActorContext, @Param('employeeId') employeeId: string, @Body() dto: CheckOutDto) {
    return this.service.checkOut(actor, employeeId, dto);
  }

  @Post('employees/:employeeId/break/start')
  @RequirePermission('attendance:write')
  startBreak(@CurrentActor() actor: ActorContext, @Param('employeeId') employeeId: string) {
    return this.service.startBreak(actor, employeeId);
  }

  @Post('employees/:employeeId/break/end')
  @RequirePermission('attendance:write')
  endBreak(@CurrentActor() actor: ActorContext, @Param('employeeId') employeeId: string) {
    return this.service.endBreak(actor, employeeId);
  }

  @Get('daily')
  @RequirePermission('attendance:read')
  listDaily(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('workDate') workDate?: string,
  ) {
    return this.service.listDaily(actor, companyId, workDate);
  }

  @Get('overtime/pending')
  @RequirePermission('attendance:read')
  listPendingOvertime(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.service.listPendingOvertime(actor, companyId);
  }

  /** REQ-006b — submit time correction request. */
  @Post('employees/:employeeId/corrections')
  @RequirePermission('attendance:write')
  submitCorrection(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Body() dto: CreateAttendanceCorrectionDto,
  ) {
    return this.correctionService.submit(actor, employeeId, dto);
  }

  /** Direct attendance record update for HR / leadership (no approval workflow). */
  @Patch('employees/:employeeId/records/:recordId')
  @RequirePermission('attendance:read')
  updateRecord(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateAttendanceRecordDto,
  ) {
    return this.service.adminUpdateRecord(actor, employeeId, recordId, dto);
  }

  @Delete('employees/:employeeId/overtime/:overtimeId')
  @RequirePermission('attendance:write')
  deleteOvertime(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Param('overtimeId') overtimeId: string,
    @Body() dto: DeleteAdminOvertimeDto,
  ) {
    return this.service.adminDeleteOvertime(
      actor,
      employeeId,
      overtimeId,
      dto.companyId,
      dto.reason,
    );
  }

  /** ATT-010 — Attendance alerts dashboard widget data. */
  @Get('alerts/today')
  @RequirePermission('attendance:read')
  getAlertsToday(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.alertService.getAlertsToday(companyId);
  }
}
