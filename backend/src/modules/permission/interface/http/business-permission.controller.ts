// ============================================================================
// HR-12 business role permission APIs.
// ============================================================================

import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req,
} from '@nestjs/common';
import { IsArray, IsEnum, IsIn, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BusinessPermissionService } from '../../application/business-permission.service';
import { RequirePermission } from './permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { BUSINESS_ROLE_CODES, BusinessRoleCode } from '../../domain/entities/business-role.types';

class AssignBusinessRoleDto {
  @IsIn([...BUSINESS_ROLE_CODES])
  role!: BusinessRoleCode;
  @IsOptional() @IsString() reason?: string;
}

class ScopeItemDto {
  @IsEnum(['all', 'company', 'team', 'self'] as const)
  scopeType!: 'all' | 'company' | 'team' | 'self';
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() teamId?: string;
}

class ReplaceScopesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScopeItemDto)
  scopes!: ScopeItemDto[];
  @IsOptional() @IsString() reason?: string;
}

class AddOverrideDto {
  @IsString() permission!: string;
  @IsEnum(['allow', 'deny'] as const) effect!: 'allow' | 'deny';
  @IsOptional() @IsString() reason?: string;
}

class SalaryPreviewQuery {
  @IsUUID() viewerUserId!: string;
  @IsUUID() targetEmployeeId!: string;
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

@Controller({ path: 'permissions', version: '1' })
export class BusinessPermissionController {
  constructor(private readonly service: BusinessPermissionService) {}

  @Get('business-roles')
  @RequirePermission('permission:read')
  listBusinessRoles() {
    return this.service.listBusinessRoles();
  }

  @Get('users/search')
  @RequirePermission('permission:read')
  searchUsers(@Query('q') query: string) {
    return this.service.searchUsers(query ?? '');
  }

  @Get('users/:userId/access')
  @RequirePermission('permission:read')
  getUserAccess(@Param('userId') userId: string) {
    return this.service.getUserAccess(userId);
  }

  @Put('users/:userId/business-role')
  @RequirePermission('permission:write')
  assignBusinessRole(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Body() dto: AssignBusinessRoleDto,
  ) {
    return this.service.assignBusinessRole(actorFrom(req), userId, dto.role, dto.reason);
  }

  @Put('users/:userId/scopes')
  @RequirePermission('permission:write')
  replaceScopes(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Body() dto: ReplaceScopesDto,
  ) {
    return this.service.replaceScopes(actorFrom(req), userId, dto.scopes, dto.reason);
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

  @Get('users/:userId/audit')
  @RequirePermission('permission:read')
  listAudit(@Param('userId') userId: string) {
    return this.service.listAudit(userId);
  }

  @Get('me/effective')
  getMyEffective(@Req() req: AuthedRequest) {
    const userId = req.user?.id;
    if (!userId) return null;
    return this.service.getMyEffectiveAccess(userId);
  }

  @Get('salary-visibility/preview')
  @RequirePermission('permission:read')
  previewSalary(@Query() query: SalaryPreviewQuery) {
    return this.service.previewSalaryVisibility(query.viewerUserId, query.targetEmployeeId);
  }
}
