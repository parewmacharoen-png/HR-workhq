// ============================================================================
// modules/salary-review/interface/http/compensation-review.controller.ts
// SAL-001
// ============================================================================

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { SalaryReviewService } from '../../application/salary-review.service';
import { PromotionReviewService } from '../../application/promotion-review.service';
import { CompensationDashboardService } from '../../application/compensation-dashboard.service';
import { CompensationListService } from '../../application/compensation-list.service';
import {
  CreatePromotionReviewDto,
  CreateSalaryReviewDto,
  RejectCompensationReviewDto,
  UpdatePromotionReviewDto,
  UpdateSalaryReviewDto,
} from '../../application/dto/salary-review.dto';

@Controller()
export class CompensationReviewController {
  constructor(
    private readonly salaryReviews: SalaryReviewService,
    private readonly promotionReviews: PromotionReviewService,
    private readonly dashboard: CompensationDashboardService,
    private readonly listService: CompensationListService,
  ) {}

  @Get('compensation-reviews/list')
  @RequirePermission('payroll:read')
  listReviews(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('type') type?: 'salary' | 'promotion' | 'all',
    @Query('status') status?: string,
    @Query('effectiveFrom') effectiveFrom?: string,
    @Query('effectiveTo') effectiveTo?: string,
    @Query('search') search?: string,
  ) {
    return this.listService.list(actor, {
      companyId,
      type: type ?? 'all',
      status: status as never,
      effectiveFrom,
      effectiveTo,
      search,
    });
  }

  @Get('compensation-reviews/dashboard')
  @RequirePermission('payroll:read')
  getDashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.dashboard.getDashboard(actor, companyId);
  }

  @Get('employees/:employeeId/compensation-timeline')
  @RequirePermission('payroll:read')
  getTimeline(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.dashboard.getTimeline(actor, employeeId, companyId);
  }

  @Post('salary-reviews')
  @RequirePermission('payroll:read')
  createSalary(@CurrentActor() actor: ActorContext, @Body() dto: CreateSalaryReviewDto) {
    return this.salaryReviews.create(actor, dto);
  }

  @Get('salary-reviews')
  @RequirePermission('payroll:read')
  listSalary(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('status') status?: string,
  ) {
    return this.salaryReviews.list(actor, companyId, status);
  }

  @Get('salary-reviews/:id')
  @RequirePermission('payroll:read')
  getSalary(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.salaryReviews.get(actor, id);
  }

  @Patch('salary-reviews/:id')
  @RequirePermission('payroll:read')
  updateSalary(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateSalaryReviewDto,
  ) {
    return this.salaryReviews.update(actor, id, dto);
  }

  @Post('salary-reviews/:id/submit')
  @RequirePermission('payroll:read')
  submitSalary(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.salaryReviews.submit(actor, id);
  }

  @Post('salary-reviews/:id/approve')
  @RequirePermission('payroll:read')
  approveSalary(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.salaryReviews.approve(actor, id);
  }

  @Post('salary-reviews/:id/reject')
  @RequirePermission('payroll:read')
  rejectSalary(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: RejectCompensationReviewDto,
  ) {
    return this.salaryReviews.reject(actor, id, dto);
  }

  @Post('salary-reviews/:id/apply')
  @RequirePermission('payroll:read')
  applySalary(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.salaryReviews.apply(actor, id);
  }

  @Post('promotion-reviews')
  @RequirePermission('payroll:read')
  createPromotion(@CurrentActor() actor: ActorContext, @Body() dto: CreatePromotionReviewDto) {
    return this.promotionReviews.create(actor, dto);
  }

  @Get('promotion-reviews')
  @RequirePermission('payroll:read')
  listPromotion(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('status') status?: string,
  ) {
    return this.promotionReviews.list(actor, companyId, status);
  }

  @Get('promotion-reviews/:id')
  @RequirePermission('payroll:read')
  getPromotion(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.promotionReviews.get(actor, id);
  }

  @Patch('promotion-reviews/:id')
  @RequirePermission('payroll:read')
  updatePromotion(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdatePromotionReviewDto,
  ) {
    return this.promotionReviews.update(actor, id, dto);
  }

  @Post('promotion-reviews/:id/submit')
  @RequirePermission('payroll:read')
  submitPromotion(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.promotionReviews.submit(actor, id);
  }

  @Post('promotion-reviews/:id/approve')
  @RequirePermission('payroll:read')
  approvePromotion(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.promotionReviews.approve(actor, id);
  }

  @Post('promotion-reviews/:id/reject')
  @RequirePermission('payroll:read')
  rejectPromotion(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: RejectCompensationReviewDto,
  ) {
    return this.promotionReviews.reject(actor, id, dto);
  }

  @Post('promotion-reviews/:id/apply')
  @RequirePermission('payroll:read')
  applyPromotion(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.promotionReviews.apply(actor, id);
  }
}
