// ============================================================================
// modules/marketing/interface/http/marketing-expense.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MarketingExpenseService } from '../../application/marketing-expense.service';
import {
  CreateMarketingExpenseDto,
  ListMarketingExpensesQuery,
  MarketingExpenseSummaryQuery,
  RejectMarketingExpenseDto,
  UpdateMarketingExpenseDto,
  VoidMarketingExpenseDto,
} from '../../application/dto/marketing-expense.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('marketing/expenses')
export class MarketingExpenseController {
  constructor(private readonly service: MarketingExpenseService) {}

  @Post()
  @RequirePermission('marketing:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateMarketingExpenseDto) {
    return this.service.createExpense(actor, dto);
  }

  @Get('summary')
  @RequirePermission('marketing:read')
  summary(@CurrentActor() actor: ActorContext, @Query() query: MarketingExpenseSummaryQuery) {
    if (query.teamId) {
      return this.service.getTeamExpenseSummary(actor, query as MarketingExpenseSummaryQuery & { teamId: string });
    }
    return this.service.getCompanyExpenseSummary(actor, query);
  }

  @Get()
  @RequirePermission('marketing:read')
  list(@CurrentActor() actor: ActorContext, @Query() query: ListMarketingExpensesQuery) {
    return this.service.listExpenses(actor, query);
  }

  @Get(':id')
  @RequirePermission('marketing:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getExpense(actor, id);
  }

  @Patch(':id')
  @RequirePermission('marketing:write')
  patch(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateMarketingExpenseDto,
  ) {
    return this.service.updateExpense(actor, id, dto);
  }

  @Post(':id/submit')
  @RequirePermission('marketing:write')
  submit(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.submitExpense(actor, id);
  }

  @Post(':id/approve')
  @RequirePermission('marketing:approve')
  approve(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.approveExpense(actor, id);
  }

  @Post(':id/reject')
  @RequirePermission('marketing:approve')
  reject(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: RejectMarketingExpenseDto,
  ) {
    return this.service.rejectExpense(actor, id, dto);
  }

  @Post(':id/void')
  @RequirePermission('marketing:audit')
  voidExpense(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: VoidMarketingExpenseDto,
  ) {
    return this.service.voidExpense(actor, id, dto);
  }
}
