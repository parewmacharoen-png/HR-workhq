// ============================================================================
// Back-office user HTTP API — standalone admin accounts.
// ============================================================================

import {
  Body, Controller, Get, Param, Patch, Post, Put, Req,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { BackofficeUserService } from '../../application/backoffice-user.service';
import { OperatorTelegramInviteService } from '../../application/operator-telegram-invite.service';
import { RequirePermission } from './permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { BACKOFFICE_STAFF_ROLES } from '../../domain/entities/backoffice-access-matrix';

class CreateBackofficeUserDto {
  @IsString() username!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsString() displayName?: string;
  @IsIn([...BACKOFFICE_STAFF_ROLES]) businessRole!: typeof BACKOFFICE_STAFF_ROLES[number];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) companyScopeIds?: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) teamScopeIds?: string[];
}

class UpdateBackofficeUserDto {
  @IsOptional() @IsString() @MinLength(6) password?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsIn([...BACKOFFICE_STAFF_ROLES]) businessRole?: typeof BACKOFFICE_STAFF_ROLES[number];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) companyScopeIds?: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) teamScopeIds?: string[];
}

class ReplaceModulePermissionsDto {
  @IsOptional() @IsIn([...BACKOFFICE_STAFF_ROLES]) businessRole?: typeof BACKOFFICE_STAFF_ROLES[number];
  @IsArray() @IsString({ each: true }) permissions!: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) companyScopeIds?: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) teamScopeIds?: string[];
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

@Controller({ path: 'backoffice-users', version: '1' })
export class BackofficeUserController {
  constructor(
    private readonly service: BackofficeUserService,
    private readonly operatorTelegram: OperatorTelegramInviteService,
  ) {}

  @Get('access-matrix')
  @RequirePermission('permission:read')
  getAccessMatrix() {
    return this.service.getAccessMatrix();
  }

  @Get()
  @RequirePermission('permission:read')
  listUsers() {
    return this.service.listUsers();
  }

  @Get(':userId')
  @RequirePermission('permission:read')
  getUser(@Param('userId') userId: string) {
    return this.service.getUserDetail(userId);
  }

  @Post()
  @RequirePermission('permission:write')
  createUser(@Req() req: AuthedRequest, @Body() dto: CreateBackofficeUserDto) {
    return this.service.createUser(actorFrom(req), dto);
  }

  @Patch(':userId')
  @RequirePermission('permission:write')
  updateUser(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Body() dto: UpdateBackofficeUserDto,
  ) {
    return this.service.updateUser(actorFrom(req), userId, dto);
  }

  @Put(':userId/permissions')
  @RequirePermission('permission:write')
  replacePermissions(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Body() dto: ReplaceModulePermissionsDto,
  ) {
    return this.service.replaceModulePermissions(actorFrom(req), userId, dto);
  }

  @Post(':userId/telegram-link')
  @RequirePermission('permission:write')
  createTelegramLink(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    return this.operatorTelegram.createLink(actorFrom(req), userId);
  }

  @Get(':userId/telegram-link')
  @RequirePermission('permission:read')
  getTelegramLink(@Param('userId') userId: string) {
    return this.operatorTelegram.getLinkStatus(userId);
  }

  @Post(':userId/telegram-link/revoke')
  @RequirePermission('permission:write')
  revokeTelegramLink(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    return this.operatorTelegram.revokeLink(actorFrom(req), userId);
  }
}
