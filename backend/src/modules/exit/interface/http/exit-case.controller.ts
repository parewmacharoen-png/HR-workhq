// ============================================================================
// modules/exit/interface/http/exit-case.controller.ts
// ============================================================================

import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { ExitCaseService } from '../../application/exit-case.service';
import { FinalSettlementService } from '../../application/final-settlement.service';
import { DepositReadService } from '../../application/deposit-read.service';
import { EmployeeDepositSettingsService } from '../../application/employee-deposit-settings.service';
import { DepositLossClaimService } from '../../application/deposit-loss-claim.service';
import { ExitAssetGateService } from '../../application/exit-asset-gate.service';
import {
  CloseExitCaseDto,
  CancelExitCaseDto,
  CreateExitCaseDto,
  LeaderReviewDto,
  OwnerReviewDto,
  UpdateExitChecklistDto,
  UpdateExitChecklistItemDto,
  UpdateEmployeeDepositSettingsDto,
  AddLegacyDepositDto,
  UpdateDepositLedgerEntryDto,
  DeleteDepositLedgerEntryDto,
} from '../../application/dto/exit.dto';
import {
  CreateLossClaimDto,
  UpdateLossClaimDto,
} from '../../application/dto/loss-claim.dto';
import {
  CreateClaimFromAssetDto,
  UpdateExitAssetReviewDto,
} from '../../application/dto/exit-asset.dto';

@Controller('exit-cases')
export class ExitCaseController {
  constructor(
    private readonly service: ExitCaseService,
    private readonly finalSettlement: FinalSettlementService,
    private readonly lossClaims: DepositLossClaimService,
    private readonly assetGate: ExitAssetGateService,
  ) {}

  @Get('dashboard')
  @RequirePermission('employee:read')
  dashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.service.getDashboard(actor, companyId);
  }

  @Get(':id/checklist-items')
  @RequirePermission('employee:read')
  listChecklistItems(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.listChecklistItems(actor, id);
  }

  @Patch(':id/checklist-items/:itemId')
  @RequirePermission('employee:write')
  updateChecklistItem(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateExitChecklistItemDto,
  ) {
    return this.service.updateChecklistItem(actor, id, itemId, dto.completed);
  }

  @Get(':id')
  @RequirePermission('employee:read')
  getById(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getById(actor, id);
  }

  @Get(':id/assets')
  @RequirePermission('employee:read')
  listAssets(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.assetGate.listAssets(actor, id);
  }

  @Patch(':id/assets/:assignmentId')
  @RequirePermission('employee:write')
  updateAssetReview(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateExitAssetReviewDto,
  ) {
    return this.assetGate.updateAssetReview(actor, id, assignmentId, dto);
  }

  @Post(':id/assets/:assignmentId/create-claim')
  @RequirePermission('employee:write')
  createClaimFromAsset(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: CreateClaimFromAssetDto,
  ) {
    return this.assetGate.createClaimFromAsset(actor, id, assignmentId, dto);
  }

  @Get(':id/loss-claims')
  @RequirePermission('employee:read')
  listLossClaims(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.lossClaims.list(actor, id);
  }

  @Post(':id/loss-claims')
  @RequirePermission('employee:write')
  createLossClaim(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: CreateLossClaimDto,
  ) {
    return this.lossClaims.create(actor, id, dto);
  }

  @Patch(':id/loss-claims/:claimId')
  @RequirePermission('employee:write')
  updateLossClaim(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('claimId') claimId: string,
    @Body() dto: UpdateLossClaimDto,
  ) {
    return this.lossClaims.update(actor, id, claimId, dto);
  }

  @Post(':id/loss-claims/:claimId/approve')
  @RequirePermission('employee:write')
  approveLossClaim(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('claimId') claimId: string,
  ) {
    return this.lossClaims.approve(actor, id, claimId);
  }

  @Delete(':id/loss-claims/:claimId')
  @RequirePermission('employee:write')
  deleteLossClaim(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('claimId') claimId: string,
  ) {
    return this.lossClaims.remove(actor, id, claimId);
  }

  @Post(':id/leader-review')
  @RequirePermission('employee:write')
  leaderReview(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: LeaderReviewDto,
  ) {
    return this.service.leaderReview(actor, id, dto);
  }

  @Post(':id/owner-review')
  @RequirePermission('employee:write')
  ownerReview(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: OwnerReviewDto,
  ) {
    return this.service.ownerReview(actor, id, dto);
  }

  @Patch(':id/checklist')
  @RequirePermission('employee:write')
  updateChecklist(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateExitChecklistDto,
  ) {
    return this.service.updateChecklist(actor, id, dto);
  }

  @Post(':id/final-settlement/draft')
  @RequirePermission('employee:write')
  createFinalSettlementDraft(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.finalSettlement.createDraft(actor, id);
  }

  @Get(':id/final-settlement')
  @RequirePermission('employee:read')
  getFinalSettlement(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.finalSettlement.getByExitCase(actor, id);
  }

  @Post(':id/settlement/preview')
  @RequirePermission('employee:read')
  settlementPreview(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.settlementPreview(actor, id);
  }

  @Post(':id/settle')
  @RequirePermission('employee:write')
  settle(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.settle(actor, id);
  }

  @Post(':id/close')
  @RequirePermission('employee:write')
  close(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: CloseExitCaseDto,
  ) {
    return this.service.close(actor, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission('employee:write')
  cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: CancelExitCaseDto,
  ) {
    return this.service.cancel(actor, id, dto);
  }
}

@Controller('employees')
export class EmployeeExitController {
  constructor(
    private readonly exitCases: ExitCaseService,
    private readonly depositRead: DepositReadService,
    private readonly depositSettings: EmployeeDepositSettingsService,
    private readonly finalSettlement: FinalSettlementService,
  ) {}

  @Post(':id/exit')
  @RequirePermission('employee:write')
  createExit(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: CreateExitCaseDto,
  ) {
    return this.exitCases.create(actor, id, dto);
  }

  @Get(':id/exit-cases')
  @RequirePermission('employee:read')
  listExitCases(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.exitCases.listForEmployee(actor, id, companyId);
  }

  @Get(':id/deposit/balance')
  @RequirePermission('employee:read')
  depositBalance(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.depositRead.getBalance(actor, id);
  }

  @Get(':id/deposit/ledger')
  @RequirePermission('employee:read')
  depositLedger(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.depositRead.getLedger(actor, id);
  }

  @Patch(':id/deposit/settings')
  @RequirePermission('employee:write')
  updateDepositSettings(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDepositSettingsDto,
  ) {
    return this.depositSettings.update(actor, id, dto);
  }

  @Post(':id/deposit/legacy')
  @RequirePermission('employee:write')
  addLegacyDeposit(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: AddLegacyDepositDto,
  ) {
    return this.depositSettings.addLegacyDeposit(actor, id, dto);
  }

  @Patch(':id/deposit/ledger/:depositId')
  @RequirePermission('employee:write')
  updateDepositLedgerEntry(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('depositId') depositId: string,
    @Body() dto: UpdateDepositLedgerEntryDto,
  ) {
    return this.depositSettings.updateLedgerEntry(
      actor,
      id,
      depositId,
      dto.amount,
      dto.reason,
    );
  }

  @Delete(':id/deposit/ledger/:depositId')
  @RequirePermission('employee:write')
  deleteDepositLedgerEntry(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('depositId') depositId: string,
    @Body() dto: DeleteDepositLedgerEntryDto,
  ) {
    return this.depositSettings.deleteLedgerEntry(actor, id, depositId, dto.reason);
  }

  @Get(':id/final-settlement/paid-summary')
  @RequirePermission('employee:read')
  finalSettlementPaidSummary(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.finalSettlement.getEmployeePaidSummary(actor, id);
  }
}
