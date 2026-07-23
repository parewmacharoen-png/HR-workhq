// ============================================================================
// modules/reporting/interface/http/reporting.controller.ts
//
// Route layout:
//   GET  /reporting/owner/dashboard          — cross-company owner view
//   POST /reporting/owner/dashboard/generate
//   GET  /reporting/executive/dashboard
//   POST /reporting/executive/dashboard/generate
//   GET  /reporting/companies/:companyId/dashboard
//   POST /reporting/companies/:companyId/dashboard/generate
//   GET  /reporting/companies/:companyId/morning-brief
//   POST /reporting/companies/:companyId/morning-brief/generate
//   GET  /reporting/companies/:companyId/evening-brief
//   POST /reporting/companies/:companyId/evening-brief/generate
//   GET  /reporting/risk                     — cross-company or per-company
//   POST /reporting/risk/generate
//   GET  /reporting/pending-approvals
//   POST /reporting/pending-approvals/generate
//   GET  /reporting/kpi/trend/:metricKey
//   GET  /reporting/snapshots/:type/history
// ============================================================================

import {
  Body, Controller, Get, Param, Post, Query,
} from '@nestjs/common';
import { ReportingService } from '../../application/reporting.service';
import { CommissionExecutiveDashboardService } from '../../application/commission-executive-dashboard.service';
import {
  GenerateDashboardDto, GetTrendQuery, GetSnapshotHistoryQuery, GetCommissionDashboardQuery,
} from '../../application/dto/reporting.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../../shared/kernel/company-access.service';
import { IsOptional, IsUUID } from 'class-validator';

class OptionalCompanyQuery {
  @IsOptional() @IsUUID() companyId?: string;
}

@Controller('reporting')
export class ReportingController {
  constructor(
    private readonly service: ReportingService,
    private readonly commissionDashboard: CommissionExecutiveDashboardService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  // ── Owner Dashboard ────────────────────────────────────────────────────────
  @Get('owner/dashboard')
  @RequirePermission('reporting:owner')
  getOwnerDashboard() {
    return this.service.getOwnerDashboard();
  }

  @Post('owner/dashboard/generate')
  @RequirePermission('reporting:owner')
  generateOwnerDashboard(@Body() dto: GenerateDashboardDto) {
    return this.service.generateOwnerDashboard(dto.date ? new Date(dto.date) : undefined);
  }

  // ── Commission Executive Dashboard ─────────────────────────────────────────
  @Get('commission/dashboard')
  @RequirePermission('reporting:read')
  async getCommissionDashboard(
    @CurrentActor() actor: ActorContext,
    @Query() q: GetCommissionDashboardQuery,
  ) {
    return this.commissionDashboard.getDashboard(actor, {
      companyId: q.companyId,
      earnCycleId: q.earnCycleId,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      comparePreviousMonth: q.comparePreviousMonth === true || String(q.comparePreviousMonth) === 'true',
    });
  }

  // ── Executive Dashboard ────────────────────────────────────────────────────
  @Get('executive/dashboard')
  @RequirePermission('reporting:executive')
  getExecutiveDashboard() {
    return this.service.getExecutiveDashboard();
  }

  @Post('executive/dashboard/generate')
  @RequirePermission('reporting:executive')
  generateExecutiveDashboard(@Body() dto: GenerateDashboardDto) {
    return this.service.generateExecutiveDashboard(dto.date ? new Date(dto.date) : undefined);
  }

  // ── Company Dashboard ──────────────────────────────────────────────────────
  @Get('companies/:companyId/dashboard')
  @RequirePermission('reporting:read')
  getCompanyDashboard(@Param('companyId') companyId: string) {
    return this.service.getCompanyDashboard(companyId);
  }

  @Post('companies/:companyId/dashboard/generate')
  @RequirePermission('reporting:write')
  generateCompanyDashboard(@Param('companyId') companyId: string, @Body() dto: GenerateDashboardDto) {
    return this.service.generateCompanyDashboard(companyId, dto.date ? new Date(dto.date) : undefined);
  }

  // ── Morning Brief ──────────────────────────────────────────────────────────
  @Get('companies/:companyId/morning-brief')
  @RequirePermission('reporting:read')
  getMorningBrief(@Param('companyId') companyId: string) {
    return this.service.getMorningBrief(companyId);
  }

  @Post('companies/:companyId/morning-brief/generate')
  @RequirePermission('reporting:write')
  generateMorningBrief(@Param('companyId') companyId: string, @Body() dto: GenerateDashboardDto) {
    return this.service.generateMorningBrief(companyId, dto.date ? new Date(dto.date) : undefined);
  }

  // ── Evening Brief ──────────────────────────────────────────────────────────
  @Get('companies/:companyId/evening-brief')
  @RequirePermission('reporting:read')
  getEveningBrief(@Param('companyId') companyId: string) {
    return this.service.getEveningBrief(companyId);
  }

  @Post('companies/:companyId/evening-brief/generate')
  @RequirePermission('reporting:write')
  generateEveningBrief(@Param('companyId') companyId: string, @Body() dto: GenerateDashboardDto) {
    return this.service.generateEveningBrief(companyId, dto.date ? new Date(dto.date) : undefined);
  }

  // ── Risk Dashboard ─────────────────────────────────────────────────────────
  @Get('risk')
  @RequirePermission('reporting:owner')
  getRiskDashboard(@Query() q: OptionalCompanyQuery) {
    return this.service.getRiskDashboard(q.companyId ?? null);
  }

  @Post('risk/generate')
  @RequirePermission('reporting:owner')
  generateRiskDashboard(@Body() dto: GenerateDashboardDto) {
    return this.service.generateRiskDashboard(dto.companyId ?? null, dto.date ? new Date(dto.date) : undefined);
  }

  // ── Pending Approvals Dashboard ───────────────────────────────────────────
  @Get('pending-approvals')
  @RequirePermission('reporting:read')
  async getPendingApprovals(@CurrentActor() actor: ActorContext, @Query() q: OptionalCompanyQuery) {
    const companyId = await this.companyAccess.requireCompanyId(actor, q.companyId ?? null);
    return this.service.getPendingApprovalDashboard(companyId);
  }

  @Post('pending-approvals/generate')
  @RequirePermission('reporting:write')
  async generatePendingApprovals(@CurrentActor() actor: ActorContext, @Body() dto: GenerateDashboardDto) {
    const companyId = await this.companyAccess.requireCompanyId(actor, dto.companyId ?? null);
    return this.service.generatePendingApprovalDashboard(companyId, dto.date ? new Date(dto.date) : undefined);
  }

  // ── KPI Trend ─────────────────────────────────────────────────────────────
  @Get('kpi/trend/:metricKey')
  @RequirePermission('reporting:read')
  async getKpiTrend(
    @CurrentActor() actor: ActorContext,
    @Param('metricKey') metricKey: string,
    @Query() q: GetTrendQuery,
  ) {
    const companyId = await this.companyAccess.requireCompanyId(actor, q.companyId ?? null);
    return this.service.getKpiTrend(metricKey, { ...q, companyId });
  }

  // ── Snapshot History ───────────────────────────────────────────────────────
  @Get('snapshots/:type/history')
  @RequirePermission('reporting:read')
  async getSnapshotHistory(
    @CurrentActor() actor: ActorContext,
    @Param('type') type: string,
    @Query('companyId') companyId: string | undefined,
    @Query() q: GetSnapshotHistoryQuery,
  ) {
    const resolvedCompanyId = await this.companyAccess.requireCompanyId(actor, companyId ?? null);
    return this.service.getSnapshotHistory(resolvedCompanyId, type, q.limit);
  }
}
