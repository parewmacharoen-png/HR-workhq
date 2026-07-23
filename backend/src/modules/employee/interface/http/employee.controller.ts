// ============================================================================
// modules/employee/interface/http/employee.controller.ts
// ============================================================================

import {
  Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query, Req, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AssetService } from '../../../asset/application/asset.service';
import { HierarchyService } from '../../../hierarchy/application/hierarchy.service';
import { UpdateReportingLineDto } from '../../../hierarchy/application/dto/hierarchy.dto';
import { EmployeePositionService } from '../../../position-framework/application/employee-position.service';
import {
  BulkPositionUpdateDto,
  UpdateEmployeePositionDto,
} from '../../../position-framework/application/dto/position-framework.dto';
import { EmployeeService } from '../../application/employee.service';
import { EmployeeEventsService } from '../../application/employee-events.service';
import { EmployeeAccessService } from '../../application/employee-access.service';
import { EmployeeRecognitionService } from '../../application/employee-recognition.service';
import { EmployeeHomeService } from '../../application/employee-home.service';
import { EmployeeOverviewService } from '../../application/employee-overview.service';
import { EmployeeAttendanceService } from '../../application/employee-attendance.service';
import { EmployeeEmploymentService } from '../../application/employee-employment.service';
import { EmployeeBusinessRoleService } from '../../application/employee-business-role.service';
import { UpdateEmployeeBusinessRoleDto } from '../../application/dto/employee-business-role.dto';
import { EmployeeTimelineService } from '../../application/employee-timeline.service';
import { EmployeeLeaveService } from '../../application/employee-leave.service';
import {
  DeleteEmployeeLeaveHistoryDto,
  UpdateEmployeeLeaveHistoryDto,
} from '../../application/dto/employee-leave-history.dto';
import { UpdateEmployeeLeaveBalancesDto } from '../../application/dto/employee-leave-balances.dto';
import { EmployeePayrollService } from '../../application/employee-payroll.service';
import { EmployeePerformanceService } from '../../application/employee-performance.service';
import { EmployeeCommissionService } from '../../application/employee-commission.service';
import { OrganizationService } from '../../../organization/application/organization.service';
import { TelegramIdentityService } from '../../../security/application/telegram-identity.service';
import {
  CreateEmployeeDto, RehireEmployeeDto, UpdateContactDto, CreateAssignmentDto,
  CreateEmployeeOnboardDto,
} from '../../application/dto/employee.dto';
import {
  CreateEmployeeRecognitionDto,
  MarkAnniversaryGiftDto,
  MarkBirthdayGiftDto,
} from '../../application/dto/employee-recognition.dto';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { RequirePermission, RequireAnyPermission } from '../../../permission/interface/http/permission.guard';

interface AuthedRequest {
  user?: { id: string; impersonatorUserId?: string | null; companyId?: string | null };
}

function actorFrom(req: AuthedRequest): ActorContext {
  return {
    userId: req.user?.id ?? '00000000-0000-0000-0000-000000000000',
    impersonatorUserId: req.user?.impersonatorUserId ?? null,
    companyId: req.user?.companyId ?? null,
  };
}

@Controller('employees')
export class EmployeeController {
  constructor(
    private readonly service: EmployeeService,
    private readonly events: EmployeeEventsService,
    private readonly recognitions: EmployeeRecognitionService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly assets: AssetService,
    private readonly telegramIdentities: TelegramIdentityService,
    private readonly hierarchy: HierarchyService,
    private readonly employeePositions: EmployeePositionService,
    private readonly employeeHome: EmployeeHomeService,
    private readonly overview: EmployeeOverviewService,
    private readonly attendance: EmployeeAttendanceService,
    private readonly employment: EmployeeEmploymentService,
    private readonly businessRole: EmployeeBusinessRoleService,
    private readonly timeline: EmployeeTimelineService,
    private readonly leave: EmployeeLeaveService,
    private readonly payroll: EmployeePayrollService,
    private readonly performance: EmployeePerformanceService,
    private readonly commission: EmployeeCommissionService,
    private readonly organization: OrganizationService,
  ) {}

  @Get()
  @RequirePermission('employee:read')
  @Header('Content-Type', 'application/json; charset=utf-8')
  async list(
    @Req() req: AuthedRequest,
    @Res({ passthrough: false }) res: Response,
    @Query('companyId') companyId: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('positionFamilyId') positionFamilyId?: string,
    @Query('positionLevelId') positionLevelId?: string,
    @Query('positionDefinitionId') positionDefinitionId?: string,
  ) {
    const result = await this.service.listEmployees(actorFrom(req), companyId ?? '', {
      search,
      status,
      positionFamilyId,
      positionLevelId,
      positionDefinitionId,
    });
    res.status(200).send(JSON.stringify(result ?? { items: [], total: 0 }));
  }

  @Get('dashboard/recognition-events')
  @RequirePermission('employee:read')
  @Header('Content-Type', 'application/json; charset=utf-8')
  getRecognitionDashboard(
    @Req() req: AuthedRequest,
    @Query('companyId') companyId: string,
  ) {
    return this.events.getRecognitionDashboard(actorFrom(req), companyId ?? '');
  }

  @Get('dashboard/awards')
  @RequirePermission('employee:read')
  @Header('Content-Type', 'application/json; charset=utf-8')
  getAwardsDashboard(
    @Req() req: AuthedRequest,
    @Query('companyId') companyId: string,
  ) {
    return this.recognitions.getAwardsDashboard(actorFrom(req), companyId ?? '');
  }

  @Get('dashboard/tenure-insights')
  @RequirePermission('employee:read')
  @Header('Content-Type', 'application/json; charset=utf-8')
  getTenureDashboard(
    @Req() req: AuthedRequest,
    @Query('companyId') companyId: string,
  ) {
    return this.events.getTenureDashboard(actorFrom(req), companyId ?? '');
  }

  @Get('assignment-teams')
  @RequirePermission('employee:read')
  listAssignmentTeams(
    @Query('companyId') companyId: string,
    @Query('department') department?: string,
  ) {
    return this.organization.listTeams(companyId, department);
  }

  @Get(':id/telegram-identity')
  @RequirePermission('employee:read')
  @Header('Content-Type', 'application/json; charset=utf-8')
  async getTelegramIdentity(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    await this.employeeAccess.assertEmployeeReadable(actorFrom(req), id);
    const identity = await this.telegramIdentities.getIdentityForEmployee(id);
    res.status(200).send(JSON.stringify(identity));
  }

  @Post(':id/telegram-identity/reset')
  @RequirePermission('security:write')
  async resetTelegram(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = actorFrom(req);
    const companyId = await this.employeeAccess.assertEmployeeReadable(actor, id);
    await this.employeeAccess.assertEmployeeWritable(actor, id, companyId);
    return this.telegramIdentities.resetBinding(actor, id);
  }

  @Post(':id/telegram-identity/revoke')
  @RequirePermission('security:write')
  async revokeTelegram(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = actorFrom(req);
    const companyId = await this.employeeAccess.assertEmployeeReadable(actor, id);
    await this.employeeAccess.assertEmployeeWritable(actor, id, companyId);
    return this.telegramIdentities.revokeAccess(actor, id);
  }

  @Post(':id/telegram-identity/reactivate')
  @RequirePermission('security:write')
  async reactivateTelegram(@Req() req: AuthedRequest, @Param('id') id: string) {
    const actor = actorFrom(req);
    const companyId = await this.employeeAccess.assertEmployeeReadable(actor, id);
    await this.employeeAccess.assertEmployeeWritable(actor, id, companyId);
    return this.telegramIdentities.reactivateAccess(actor, id);
  }

  @Get(':id/reporting-path')
  @RequirePermission('employee:read')
  getReportingPath(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hierarchy.getReportingPath(actorFrom(req), id);
  }

  @Get(':id/direct-reports')
  @RequirePermission('employee:read')
  getDirectReports(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hierarchy.getDirectReports(actorFrom(req), id);
  }

  @Get(':id/hierarchy-summary')
  @RequirePermission('employee:read')
  getHierarchySummary(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.hierarchy.getHierarchySummary(actorFrom(req), id, companyId);
  }

  @Patch(':id/reporting-line')
  @RequirePermission('employee:write')
  updateReportingLine(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateReportingLineDto,
    @Query('companyId') companyId?: string,
  ) {
    return this.hierarchy.updateReportingLine(actorFrom(req), id, dto, companyId);
  }

  @Get(':id/recognitions')
  @RequirePermission('employee:read')
  @Header('Content-Type', 'application/json; charset=utf-8')
  listRecognitions(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId?: string,
    @Query('type') type?: string,
  ) {
    return this.recognitions.listRecognitions(actorFrom(req), id, companyId, type as never);
  }

  @Post(':id/recognitions')
  @RequirePermission('employee:write')
  createRecognition(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeRecognitionDto,
  ) {
    return this.recognitions.createRecognition(actorFrom(req), id, dto);
  }

  @Post(':id/recognitions/birthday-gift')
  @RequirePermission('employee:write')
  markBirthdayGift(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: MarkBirthdayGiftDto,
  ) {
    return this.recognitions.markBirthdayGift(actorFrom(req), id, dto);
  }

  @Post(':id/recognitions/anniversary-gift')
  @RequirePermission('employee:write')
  markAnniversaryGift(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: MarkAnniversaryGiftDto,
  ) {
    return this.recognitions.markAnniversaryGift(actorFrom(req), id, dto);
  }

  @Get(':id/career-path')
  @RequirePermission('employee:read')
  getCareerPath(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.employeePositions.getEmployeeCareerPath(actorFrom(req), id, companyId);
  }

  @Patch(':id/position')
  @RequirePermission('employee:write')
  updatePosition(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeePositionDto,
  ) {
    return this.employeePositions.updateEmployeePosition(actorFrom(req), id, dto);
  }

  @Post('bulk-position-update')
  @RequirePermission('employee:write')
  bulkPositionUpdate(@Req() req: AuthedRequest, @Body() dto: BulkPositionUpdateDto) {
    return this.employeePositions.bulkPositionUpdate(actorFrom(req), dto);
  }

  @Get(':id/overview')
  @RequirePermission('employee:read')
  getOverview(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.overview.getOverview(actorFrom(req), id, companyId);
  }

  @Get(':id/attendance')
  @RequirePermission('attendance:read')
  getAttendance(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.attendance.getAttendance(actorFrom(req), id, companyId);
  }

  @Get(':id/employment')
  @RequirePermission('employee:read')
  getEmployment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.employment.getEmployment(actorFrom(req), id, companyId);
  }

  @Patch(':id/business-role')
  @RequirePermission('employee:write')
  async updateBusinessRole(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeBusinessRoleDto,
    @Query('companyId') companyId: string,
  ) {
    await this.businessRole.updateBusinessRole(actorFrom(req), id, dto, companyId);
    return this.employment.getEmployment(actorFrom(req), id, companyId);
  }

  @Get(':id/timeline')
  @RequirePermission('employee:read')
  getTimeline(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.timeline.getTimeline(actorFrom(req), id);
  }

  @Get(':id/leave')
  @RequirePermission('leave:read')
  getLeave(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.leave.getLeave(actorFrom(req), id, companyId);
  }

  @Put(':id/leave/balances')
  @RequirePermission('leave:write')
  setLeaveBalances(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() dto: UpdateEmployeeLeaveBalancesDto,
  ) {
    return this.leave.setPriorUsage(actorFrom(req), id, companyId, dto);
  }

  @Patch(':id/leave/items/:itemId')
  @RequirePermission('leave:write')
  updateLeaveHistoryItem(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Query('companyId') companyId: string,
    @Body() dto: UpdateEmployeeLeaveHistoryDto,
  ) {
    return this.leave.updateHistoryItem(actorFrom(req), id, companyId, itemId, dto);
  }

  @Delete(':id/leave/items/:itemId')
  @RequirePermission('leave:write')
  deleteLeaveHistoryItem(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Query('companyId') companyId: string,
    @Query('source') source: 'leave_request' | 'monthly_off',
    @Query('offDate') offDate?: string,
  ) {
    const dto: DeleteEmployeeLeaveHistoryDto = {
      source: source ?? 'leave_request',
      offDate,
    };
    return this.leave.deleteHistoryItem(actorFrom(req), id, companyId, itemId, dto);
  }

  @Get(':id/payroll')
  @RequirePermission('employee:read')
  getPayroll(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.payroll.getPayroll(actorFrom(req), id, companyId);
  }

  @Post(':id/payroll/sync-open-cycles')
  @RequirePermission('payroll:write')
  syncPayrollOpenCycles(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.payroll.syncOpenCycleItems(actorFrom(req), id, companyId);
  }

  @Get(':id/performance')
  @RequirePermission('performance:read')
  getPerformance(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.performance.getPerformance(actorFrom(req), id, companyId);
  }

  @Get(':id/commission')
  @RequirePermission('commission:read')
  getCommission(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.commission.getCommission(actorFrom(req), id, companyId);
  }

  @Get(':id/salary-history')
  @RequirePermission('employee:read')
  getSalaryHistory(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.getSalaryHistory(actorFrom(req), id, companyId);
  }

  @Get(':id/home-summary')
  @RequirePermission('employee:read')
  getHomeSummary(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.employeeHome.getSummary(actorFrom(req), id, companyId);
  }

  @Get(':id')
  @RequirePermission('employee:read')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.service.getEmployee(actorFrom(req), id);
  }

  @Post('onboard')
  @RequirePermission('employee:write')
  onboard(@Req() req: AuthedRequest, @Body() dto: CreateEmployeeOnboardDto) {
    return this.service.onboardEmployee(actorFrom(req), dto);
  }

  @Post()
  @RequirePermission('employee:write')
  create(@Req() req: AuthedRequest, @Body() dto: CreateEmployeeDto) {
    return this.service.createEmployee(actorFrom(req), dto);
  }

  @Post('rehire')
  @RequirePermission('employee:write')
  rehire(@Req() req: AuthedRequest, @Body() dto: RehireEmployeeDto) {
    return this.service.rehireEmployee(actorFrom(req), dto);
  }

  @Patch(':id/contact')
  @RequirePermission('employee:write')
  updateContact(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.service.updateContact(actorFrom(req), id, dto);
  }

  @Post(':id/terminate')
  @RequirePermission('employee:write')
  terminate(@Req() req: AuthedRequest, @Param('id') id: string, @Body('at') at?: string) {
    return this.service.terminate(actorFrom(req), id, at);
  }

  @Get(':id/assignments')
  @RequirePermission('employee:read')
  listAssignments(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.service.listAssignments(actorFrom(req), id);
  }

  @Get(':id/assets')
  @RequireAnyPermission('asset:read', 'employee:read')
  listAssets(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.assets.listEmployeeAssets(actorFrom(req), id, companyId);
  }

  @Post(':id/assignments')
  @RequirePermission('employee:write')
  assign(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: CreateAssignmentDto) {
    return this.service.assign(actorFrom(req), id, dto);
  }
}
