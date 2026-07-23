// ============================================================================
// Payroll PDF download endpoints
// ============================================================================

import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { PayrollPdfService } from '../../application/payroll-pdf.service';

@Controller('payroll')
export class PayrollPdfController {
  constructor(private readonly pdf: PayrollPdfService) {}

  @Get('cycles/:id/export-summary.pdf')
  @RequirePermission('payroll:read')
  async downloadSummary(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const result = await this.pdf.generateSummaryPdf(actor, id);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.status(200).send(result.buffer);
  }

  @Get('cycles/:id/payslips/:employeeId.pdf')
  @RequirePermission('payroll:read')
  async downloadPayslip(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const result = await this.pdf.generatePayslipPdf(actor, id, employeeId);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.status(200).send(result.buffer);
  }

  @Get('employees/:employeeId/consolidated-payslip.pdf')
  @RequirePermission('payroll:read')
  async downloadConsolidatedPayslip(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Query('cycleId') cycleId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const result = await this.pdf.generateConsolidatedPayslipPdf(actor, employeeId, cycleId);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.status(200).send(result.buffer);
  }
}
