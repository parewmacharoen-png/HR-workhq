// ============================================================================
// shared/audit/audit-explorer.controller.ts
// ============================================================================

import { Controller, Get, Header, Query } from '@nestjs/common';
import { AuditExplorerService } from './audit-explorer.service';
import { CurrentActor } from '../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../modules/permission/interface/http/permission.guard';
import { ActorContext } from '../kernel/actor-context';

@Controller('audit')
export class AuditExplorerController {
  constructor(private readonly explorer: AuditExplorerService) {}

  @Get('logs')
  @RequirePermission('settings:read')
  search(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('module') module?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.explorer.search(actor, {
      companyId,
      actorUserId,
      entityType,
      entityId,
      action,
      module,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('export')
  @RequirePermission('settings:read')
  @Header('Content-Type', 'text/csv')
  exportCsv(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.explorer.exportCsv(actor, { companyId, from, to });
  }
}
