// ============================================================================
// EMP-015 — Employee profile HTTP endpoints
// ============================================================================

import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import { EmployeePersonalService } from '../../application/employee-personal.service';
import { EmployeeEducationService } from '../../application/employee-education.service';
import { EmployeeWorkExperienceService } from '../../application/employee-work-experience.service';
import { EmployeeEmploymentService } from '../../application/employee-employment.service';
import {
  CreateEmployeeEducationDto,
  CreateEmployeeWorkExperienceDto,
  UpdateEmployeeEducationDto,
  UpdateEmployeePersonalDto,
  UpdateEmployeeWorkExperienceDto,
} from '../../application/dto/employee-personal.dto';
import { EmployeeProfileService } from '../../application/employee-profile.service';
import {
  ArchiveEmployeeDto,
  CreateProfileChangeRequestDto,
  HardDeleteEmployeeDto,
  RestoreEmployeeDto,
  SalaryDirectEditDto,
  UpdateEmployeeAccessDto,
  UpdateEmployeePayrollInfoDto,
  UpdateEmployeeProfileDto,
} from '../../application/dto/employee-profile.dto';
import { UpdateEmployeeEmploymentDto } from '../../application/dto/employee-employment.dto';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

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
export class EmployeeProfileController {
  constructor(
    private readonly profile: EmployeeProfileService,
    private readonly personal: EmployeePersonalService,
    private readonly education: EmployeeEducationService,
    private readonly workExperience: EmployeeWorkExperienceService,
    private readonly employment: EmployeeEmploymentService,
  ) {}

  @Get(':id/profile-full')
  @RequirePermission('employee:read')
  getFullProfile(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.profile.getFullProfile(actorFrom(req), id);
  }

  @Get(':id/personal')
  @RequirePermission('employee:read')
  getPersonal(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.personal.getPersonal(actorFrom(req), id);
  }

  @Patch(':id/personal')
  @RequirePermission('employee:write')
  updatePersonal(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeePersonalDto,
  ) {
    return this.personal.updatePersonal(actorFrom(req), id, dto);
  }

  @Get(':id/education')
  @RequirePermission('employee:read')
  listEducation(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.education.list(actorFrom(req), id);
  }

  @Post(':id/education')
  @RequirePermission('employee:write')
  createEducation(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeEducationDto,
  ) {
    return this.education.create(actorFrom(req), id, dto);
  }

  @Patch(':id/education/:educationId')
  @RequirePermission('employee:write')
  updateEducation(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('educationId') educationId: string,
    @Body() dto: UpdateEmployeeEducationDto,
  ) {
    return this.education.update(actorFrom(req), id, educationId, dto);
  }

  @Delete(':id/education/:educationId')
  @RequirePermission('employee:write')
  deleteEducation(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('educationId') educationId: string,
  ) {
    return this.education.remove(actorFrom(req), id, educationId);
  }

  @Get(':id/work-experience')
  @RequirePermission('employee:read')
  listWorkExperience(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.workExperience.list(actorFrom(req), id);
  }

  @Post(':id/work-experience')
  @RequirePermission('employee:write')
  createWorkExperience(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: CreateEmployeeWorkExperienceDto,
  ) {
    return this.workExperience.create(actorFrom(req), id, dto);
  }

  @Patch(':id/work-experience/:experienceId')
  @RequirePermission('employee:write')
  updateWorkExperience(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('experienceId') experienceId: string,
    @Body() dto: UpdateEmployeeWorkExperienceDto,
  ) {
    return this.workExperience.update(actorFrom(req), id, experienceId, dto);
  }

  @Delete(':id/work-experience/:experienceId')
  @RequirePermission('employee:write')
  deleteWorkExperience(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Param('experienceId') experienceId: string,
  ) {
    return this.workExperience.remove(actorFrom(req), id, experienceId);
  }

  @Patch(':id/profile')
  @RequirePermission('employee:write')
  updateProfile(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UpdateEmployeeProfileDto) {
    return this.profile.updateProfile(actorFrom(req), id, dto);
  }

  @Patch(':id/employment')
  @RequirePermission('employee:write')
  updateEmployment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeEmploymentDto,
    @Query('companyId') companyId?: string,
  ) {
    return this.employment.updateEmployment(actorFrom(req), id, dto, companyId);
  }

  @Patch(':id/payroll-info')
  @RequirePermission('employee:write')
  updatePayrollInfo(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UpdateEmployeePayrollInfoDto) {
    return this.profile.updatePayrollInfo(actorFrom(req), id, dto);
  }

  @Patch(':id/salary-direct-edit')
  @RequirePermission('employee:write')
  salaryDirectEdit(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: SalaryDirectEditDto) {
    return this.profile.salaryDirectEdit(actorFrom(req), id, dto);
  }

  @Patch(':id/access')
  @RequirePermission('permission:write')
  updateAccess(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UpdateEmployeeAccessDto) {
    return this.profile.updateAccess(actorFrom(req), id, dto);
  }

  @Post(':id/archive')
  @RequirePermission('employee:write')
  archive(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: ArchiveEmployeeDto) {
    return this.profile.archive(actorFrom(req), id, dto);
  }

  @Post(':id/restore')
  @RequirePermission('employee:write')
  restore(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: RestoreEmployeeDto) {
    return this.profile.restore(actorFrom(req), id, dto);
  }

  @Delete(':id')
  @RequirePermission('employee:write')
  hardDelete(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: HardDeleteEmployeeDto) {
    return this.profile.hardDeleteDraft(actorFrom(req), id, dto);
  }

  @Get(':id/change-history')
  @RequirePermission('employee:read')
  changeHistory(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.profile.getChangeHistory(actorFrom(req), id);
  }

  @Get(':id/audit')
  @RequirePermission('employee:read')
  audit(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.profile.getAudit(actorFrom(req), id);
  }

  @Post(':id/profile-change-request')
  @RequirePermission('employee:read')
  profileChangeRequest(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: CreateProfileChangeRequestDto,
  ) {
    return this.profile.createProfileChangeRequest(actorFrom(req), id, dto);
  }

  @Post('profile-change-requests/:requestId/approve')
  @RequirePermission('employee:write')
  approveChangeRequest(@Req() req: AuthedRequest, @Param('requestId') requestId: string) {
    return this.profile.approveProfileChangeRequest(actorFrom(req), requestId);
  }
}
