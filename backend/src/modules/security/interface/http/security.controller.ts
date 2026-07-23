// ============================================================================
// modules/security/interface/http/security.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { RegistrationRequestStatus, TelegramIdentityStatus } from '@prisma/client';
import { TelegramIdentityService } from '../../application/telegram-identity.service';
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

@Controller('security')
export class SecurityController {
  constructor(private readonly identities: TelegramIdentityService) {}

  @Get('registrations')
  @RequirePermission('security:read')
  listRegistrations(@Query('status') status?: RegistrationRequestStatus) {
    return this.identities.listRegistrationRequests(status);
  }

  @Post('registrations/:id/approve')
  @RequirePermission('security:write')
  approve(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body('employeeId') employeeId?: string,
  ) {
    return this.identities.approveRegistration(actorFrom(req), id, employeeId);
  }

  @Post('registrations/:id/reject')
  @RequirePermission('security:write')
  reject(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.identities.rejectRegistration(actorFrom(req), id, reason ?? 'Rejected by HR');
  }

  @Get('telegram-identities')
  @RequirePermission('security:read')
  listIdentities(
    @Query('status') status?: TelegramIdentityStatus,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.identities.listIdentities({
      status,
      search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
