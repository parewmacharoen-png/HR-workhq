// ============================================================================
// HR-13 access control HTTP API.
// ============================================================================

import {
  Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Req,
} from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { AccessControlService } from '../../application/access-control.service';
import { RequirePermission } from './permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { BUSINESS_ROLE_CODES, BusinessRoleCode } from '../../domain/entities/business-role.types';

class AssignBusinessRoleDto {
  @IsIn([...BUSINESS_ROLE_CODES])
  role!: BusinessRoleCode;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  companyScopeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  teamScopeIds?: string[];

  @IsOptional()
  @IsString()
  reason?: string;
}

class PreviewAccessDto {
  @IsIn([...BUSINESS_ROLE_CODES])
  role!: BusinessRoleCode;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  companyScopeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  teamScopeIds?: string[];
}

class AddOverrideDto {
  @IsString()
  permission!: string;

  @IsIn(['allow', 'deny'])
  effect!: 'allow' | 'deny';

  @IsOptional()
  @IsString()
  reason?: string;
}

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

@Controller({ path: 'access-control', version: '1' })
export class AccessControlController {
  constructor(private readonly service: AccessControlService) {}

  @Get('role-templates')
  @RequirePermission('permission:read')
  listRoleTemplates() {
    return this.service.listRoleTemplates();
  }

  @Get('employees/:employeeId/effective-access')
  @RequirePermission('permission:read')
  getEmployeeAccess(@Param('employeeId') employeeId: string) {
    return this.service.getEmployeeAccessContext(employeeId);
  }

  @Get('users/:userId/effective-access')
  @RequirePermission('permission:read')
  getEffectiveAccess(@Param('userId') userId: string) {
    return this.service.getEffectiveAccess(userId);
  }

  @Post('users/:userId/effective-access/preview')
  @RequirePermission('permission:read')
  previewAccess(@Param('userId') userId: string, @Body() dto: PreviewAccessDto) {
    return this.service.previewEffectiveAccess(userId, {
      role: dto.role,
      companyScopeIds: dto.companyScopeIds ?? [],
      teamScopeIds: dto.teamScopeIds ?? [],
    });
  }

  @Post('users/:userId/business-role')
  @RequirePermission('permission:write')
  assignRole(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Body() dto: AssignBusinessRoleDto,
  ) {
    return this.service.assignBusinessRole(actorFrom(req), userId, dto);
  }

  @Patch('users/:userId/business-role')
  @RequirePermission('permission:write')
  updateRole(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Body() dto: AssignBusinessRoleDto,
  ) {
    return this.service.assignBusinessRole(actorFrom(req), userId, dto);
  }

  @Post('users/:userId/overrides')
  @RequirePermission('permission:write')
  addOverride(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Body() dto: AddOverrideDto,
  ) {
    return this.service.addOverride(actorFrom(req), userId, dto);
  }

  @Delete('users/:userId/overrides/:overrideId')
  @RequirePermission('permission:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeOverride(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Param('overrideId') overrideId: string,
  ) {
    return this.service.removeOverride(actorFrom(req), userId, overrideId);
  }
}
