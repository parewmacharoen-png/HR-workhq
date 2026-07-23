// ============================================================================
// modules/organization/interface/http/organization.controller.ts
// Thin HTTP boundary. Builds ActorContext from the request, delegates to the
// application service. (RequirePermission guard is wired in the Permission
// module; decorators shown here document the intended scope.)
// ============================================================================

import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import { HierarchyService } from '../../../hierarchy/application/hierarchy.service';
import { OrganizationService } from '../../application/organization.service';
import {
  CreateCompanyDto, UpdateCompanyDto, CreateTeamDto,
} from '../../application/dto/organization.dto';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

// Minimal shape of the authenticated request (populated by auth middleware).
interface AuthedRequest {
  user?: { id: string; impersonatorUserId?: string | null; companyId?: string | null };
  ip?: string;
}

function actorFrom(req: AuthedRequest): ActorContext {
  return {
    userId: req.user?.id ?? '00000000-0000-0000-0000-000000000000',
    impersonatorUserId: req.user?.impersonatorUserId ?? null,
    companyId: req.user?.companyId ?? null,
  };
}

@Controller('organization')
export class OrganizationController {
  constructor(
    private readonly service: OrganizationService,
    private readonly hierarchy: HierarchyService,
  ) {}

  @Get('tree')
  @RequirePermission('organization:read')
  getTree(
    @Req() req: AuthedRequest,
    @Query('companyId') companyId: string,
  ) {
    return this.hierarchy.getOrganizationTree(actorFrom(req), companyId);
  }

  @Get('companies')
  @RequirePermission('organization:read')
  listCompanies() {
    return this.service.listCompanies();
  }

  @Get('companies/:id')
  @RequirePermission('organization:read')
  getCompany(@Param('id') id: string) {
    return this.service.getCompany(id);
  }

  @Post('companies')
  @RequirePermission('organization:write')
  createCompany(@Req() req: AuthedRequest, @Body() dto: CreateCompanyDto) {
    return this.service.createCompany(actorFrom(req), dto);
  }

  @Patch('companies/:id')
  @RequirePermission('organization:write')
  updateCompany(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.service.updateCompany(actorFrom(req), id, dto);
  }

  @Delete('companies/:id')
  @RequirePermission('organization:write')
  deleteCompany(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.service.deleteCompany(actorFrom(req), id);
  }

  @Get('companies/:companyId/teams')
  @RequirePermission('organization:read')
  listTeams(
    @Param('companyId') companyId: string,
    @Query('department') department?: string,
  ) {
    return this.service.listTeams(companyId, department);
  }

  @Post('teams')
  @RequirePermission('organization:write')
  createTeam(@Req() req: AuthedRequest, @Body() dto: CreateTeamDto) {
    return this.service.createTeam(actorFrom(req), dto);
  }
}
