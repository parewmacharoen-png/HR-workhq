// ============================================================================
// modules/payroll/interface/http/manual-commission.controller.ts
// ============================================================================

import { Body, Controller, Post } from '@nestjs/common';
import { ManualCommissionService } from '../../application/manual-commission.service';
import {
  BulkManualCommissionDto,
  CreateManualCommissionDto,
} from '../../application/dto/manual-commission.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('payroll/manual-commissions')
export class ManualCommissionController {
  constructor(private readonly service: ManualCommissionService) {}

  @Post()
  @RequirePermission('payroll:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateManualCommissionDto) {
    return this.service.create(actor, dto);
  }

  @Post('bulk')
  @RequirePermission('payroll:write')
  bulk(@CurrentActor() actor: ActorContext, @Body() dto: BulkManualCommissionDto) {
    return this.service.bulkImport(actor, dto);
  }
}
