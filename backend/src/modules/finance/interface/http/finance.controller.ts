// ============================================================================
// modules/finance/interface/http/finance.controller.ts
// All finance endpoints. Each route is permission-guarded; reads use
// finance:read, writes use finance:write, approvals/posting use finance:approve.
// ============================================================================

import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { FinanceService } from '../../application/finance.service';
import {
  CreateCostCenterDto, UpdateCostCenterDto, CreateBudgetDto, AdjustBudgetDto,
  CreateTransactionDto, CreateAdvanceDto, CreateDepositRefundDto,
} from '../../application/dto/finance.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('finance')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  // ── Cost Centers ──────────────────────────────────────────────────────────
  @Get('companies/:companyId/cost-centers')
  @RequirePermission('finance:read')
  listCostCenters(@CurrentActor() actor: ActorContext, @Param('companyId') companyId: string) {
    return this.service.listCostCenters(actor, companyId);
  }

  @Post('cost-centers')
  @RequirePermission('finance:write')
  createCostCenter(@CurrentActor() actor: ActorContext, @Body() dto: CreateCostCenterDto) {
    return this.service.createCostCenter(actor, dto);
  }

  @Patch('cost-centers/:id')
  @RequirePermission('finance:write')
  updateCostCenter(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: UpdateCostCenterDto) {
    return this.service.updateCostCenter(actor, id, dto);
  }

  @Delete('cost-centers/:id')
  @RequirePermission('finance:write')
  deleteCostCenter(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.deleteCostCenter(actor, id);
  }

  // ── Budgets ───────────────────────────────────────────────────────────────
  @Get('companies/:companyId/budgets')
  @RequirePermission('finance:read')
  listBudgets(@CurrentActor() actor: ActorContext, @Param('companyId') companyId: string) {
    return this.service.listBudgets(actor, companyId);
  }

  @Post('budgets')
  @RequirePermission('finance:write')
  createBudget(@CurrentActor() actor: ActorContext, @Body() dto: CreateBudgetDto) {
    return this.service.createBudget(actor, dto);
  }

  @Patch('budgets/:id')
  @RequirePermission('finance:write')
  adjustBudget(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: AdjustBudgetDto) {
    return this.service.adjustBudget(actor, id, dto);
  }

  // ── Revenue / Expense transactions ─────────────────────────────────────────
  @Post('transactions')
  @RequirePermission('finance:write')
  createTransaction(@CurrentActor() actor: ActorContext, @Body() dto: CreateTransactionDto) {
    return this.service.createTransaction(actor, dto);
  }

  @Post('transactions/:id/submit')
  @RequirePermission('finance:write')
  submitTransaction(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.submitTransaction(actor, id);
  }

  @Post('transactions/:id/post')
  @RequirePermission('finance:approve')
  postTransaction(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.postTransaction(actor, id);
  }

  @Get('companies/:companyId/summary')
  @RequirePermission('finance:read')
  summary(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.financialSummary(actor, companyId, from, to);
  }

  // ── Advance Requests ────────────────────────────────────────────────────────
  @Post('advances')
  @RequirePermission('finance:write')
  createAdvance(@CurrentActor() actor: ActorContext, @Body() dto: CreateAdvanceDto) {
    return this.service.createAdvance(actor, dto);
  }

  @Get('advances/:id')
  @RequirePermission('finance:read')
  getAdvance(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getAdvance(actor, id);
  }

  // ── Deposit Refunds ──────────────────────────────────────────────────────────
  @Post('deposit-refunds')
  @RequirePermission('finance:write')
  createDepositRefund(@CurrentActor() actor: ActorContext, @Body() dto: CreateDepositRefundDto) {
    return this.service.createDepositRefund(actor, dto);
  }

  @Get('deposit-refunds/:id')
  @RequirePermission('finance:read')
  getDepositRefund(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getDepositRefund(actor, id);
  }
}
