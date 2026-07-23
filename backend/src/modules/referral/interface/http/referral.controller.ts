// ============================================================================
// modules/referral/interface/http/referral.controller.ts
//
// Route layout:
//   POST   /referrals                           register new referral
//   GET    /referrals/:id                       get single referral
//   GET    /referrals                           list with filters
//   POST   /referrals/:id/qualify              run checks + qualify
//   POST   /referrals/:id/pay                  create payroll item + mark paid
//   POST   /referrals/:id/reject               reject with reason
//   GET    /referrals/:id/eligibility          non-mutating eligibility check
//   GET    /referrals/:id/duplicate-checks     audit log of dup checks
//   GET    /referrals/dashboard                company dashboard
// ============================================================================

import {
  Body, Controller, Get, Param, Post, Query,
} from '@nestjs/common';
import { ReferralService } from '../../application/referral.service';
import {
  RegisterReferralDto, QualifyReferralDto, RejectReferralDto,
  ListReferralsQuery, DashboardQuery,
} from '../../application/dto/referral.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('referrals')
export class ReferralController {
  constructor(private readonly service: ReferralService) {}

  // ── Registration ───────────────────────────────────────────────────────────

  @Post()
  @RequirePermission('referral:write')
  register(@CurrentActor() actor: ActorContext, @Body() dto: RegisterReferralDto) {
    return this.service.register(actor, dto);
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  @Get('dashboard')
  @RequirePermission('referral:read')
  getDashboard(@CurrentActor() actor: ActorContext, @Query() query: DashboardQuery) {
    return this.service.getDashboard(actor, query);
  }

  @Get()
  @RequirePermission('referral:read')
  list(@CurrentActor() actor: ActorContext, @Query() query: ListReferralsQuery) {
    return this.service.list(actor, query);
  }

  @Get(':id')
  @RequirePermission('referral:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.get(actor, id);
  }

  // ── Eligibility & duplicate check audit ────────────────────────────────────

  @Get(':id/eligibility')
  @RequirePermission('referral:read')
  checkEligibility(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.checkEligibility(actor, id);
  }

  @Get(':id/duplicate-checks')
  @RequirePermission('referral:read')
  getDuplicateChecks(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getDuplicateChecks(actor, id);
  }

  // ── Lifecycle mutations ────────────────────────────────────────────────────

  /**
   * Runs eligibility check + all three duplicate signals, appends immutable
   * audit log for each, then qualifies (or throws if blocked).
   * HR/Owner may pass overrideDuplicateBlock=true to qualify despite a match.
   */
  @Post(':id/qualify')
  @RequirePermission('referral:qualify')
  qualify(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: QualifyReferralDto,
  ) {
    return this.service.qualify(actor, id, dto);
  }

  /**
   * Creates a payroll item (item_type='referral', source_ref_type='referral')
   * on the referrer's open cycle, then marks the referral as paid.
   */
  @Post(':id/pay')
  @RequirePermission('referral:pay')
  pay(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.pay(actor, id);
  }

  @Post(':id/reject')
  @RequirePermission('referral:qualify')
  reject(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: RejectReferralDto,
  ) {
    return this.service.reject(actor, id, dto);
  }
}
