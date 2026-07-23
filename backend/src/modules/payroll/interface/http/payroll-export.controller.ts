// ============================================================================
// modules/payroll/interface/http/payroll-export.controller.ts
// PAY-006
// ============================================================================

import {
  Body, Controller, Get, Param, Post, Query, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { PayrollExportService } from '../../application/payroll-export.service';
import { CreatePayrollExportBatchDto } from '../../application/dto/payroll-export.dto';

@Controller('payroll')
export class PayrollExportController {
  constructor(private readonly service: PayrollExportService) {}

  @Get('cycles/:id/export-bank-transfer/preview')
  @RequirePermission('payroll:read')
  preview(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.preview(actor, id);
  }

  @Post('cycles/:id/export-bank-transfer')
  @RequirePermission('payroll:read')
  createExport(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: CreatePayrollExportBatchDto,
  ) {
    return this.service.createExport(actor, id, dto);
  }

  @Get('cycles/:id/export-batches')
  @RequirePermission('payroll:read')
  listForCycle(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.listBatchesForCycle(actor, id);
  }

  @Get('export-batches/:id')
  @RequirePermission('payroll:read')
  getBatch(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getBatch(actor, id);
  }

  @Get('export-batches/:id/download')
  @RequirePermission('payroll:read')
  async download(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Query('format') format: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const result = await this.service.downloadBatch(actor, id, format ?? 'xlsx');
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.status(200).send(result.buffer);
  }

  @Post('export-batches/:id/cancel')
  @RequirePermission('payroll:read')
  cancel(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.cancelBatch(actor, id);
  }
}
