// ============================================================================
// modules/permission/interface/http/permission.controller.ts
// Admin endpoints for role/scope assignment and impersonation. Each route is
// itself permission-guarded (e.g. only Owner/HR may assign roles).
// ============================================================================

import {
  Body, Controller, Delete, Param, Post, Req,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PermissionService } from '../../application/permission.service';
import { RequirePermission } from './permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

class AssignRoleDto {
  @IsUUID() roleId!: string;
}

class GrantScopeDto {
  @IsEnum(['all', 'company', 'team', 'self'] as const)
  scopeType!: 'all' | 'company' | 'team' | 'self';
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() teamId?: string;
}

class ImpersonateDto {
  @IsUUID() targetUserId!: string;
  @IsOptional() @IsString() reason?: string;
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

@Controller('permission')
export class PermissionController {
  constructor(private readonly service: PermissionService) {}

  @Post('users/:userId/roles')
  @RequirePermission('role:assign')
  assignRole(@Req() req: AuthedRequest, @Param('userId') userId: string, @Body() dto: AssignRoleDto) {
    return this.service.assignRole(actorFrom(req), userId, dto.roleId);
  }

  @Delete('users/:userId/roles/:roleId')
  @RequirePermission('role:assign')
  revokeRole(@Req() req: AuthedRequest, @Param('userId') userId: string, @Param('roleId') roleId: string) {
    return this.service.revokeRole(actorFrom(req), userId, roleId);
  }

  @Post('users/:userId/scopes')
  @RequirePermission('scope:grant')
  grantScope(@Req() req: AuthedRequest, @Param('userId') userId: string, @Body() dto: GrantScopeDto) {
    return this.service.grantScope(actorFrom(req), { userId, ...dto });
  }

  @Post('impersonation/start')
  @RequirePermission('impersonation:use')
  startImpersonation(@Req() req: AuthedRequest, @Body() dto: ImpersonateDto) {
    return this.service.startImpersonation(actorFrom(req), dto.targetUserId, dto.reason);
  }

  @Post('impersonation/:id/end')
  @RequirePermission('impersonation:use')
  endImpersonation(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.service.endImpersonation(actorFrom(req), id);
  }
}
