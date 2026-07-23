// ============================================================================
// modules/commission/interface/http/commission-adjustment.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { CommissionAdjustmentService } from '../../application/commission-adjustment.service';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import {
  CommissionAdjustmentStatus,
} from '../../domain/repositories/commission-adjustment.repository';
import { CommissionCycleType } from '../../domain/repositories/commission-finalization.repository';

class CreateAdjustmentDto {
  @IsUUID() companyId!: string;
  @IsUUID() earnCycleId!: string;
  @IsEnum(['marketing', 'admin', 'referral', 'recruitment']) type!: CommissionCycleType;
  @IsOptional() @IsUUID() teamId?: string;
  @IsUUID() employeeId!: string;
  @IsOptional() @IsUUID() sourceResultId?: string;
  @IsString() reason!: string;
  @IsNumber() @Min(0.01) adjustmentAmount!: number;
  @IsEnum(['increase', 'decrease']) direction!: 'increase' | 'decrease';
}

class ListAdjustmentsQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
  @IsOptional() @IsEnum(['marketing', 'admin', 'referral', 'recruitment']) type?: CommissionCycleType;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsEnum(['draft', 'submitted', 'approved', 'rejected', 'applied']) status?: CommissionAdjustmentStatus;
}

class RejectDto {
  @IsOptional() @IsString() reason?: string;
}

@Controller('commission/adjustments')
export class CommissionAdjustmentController {
  constructor(private readonly service: CommissionAdjustmentService) {}

  @Post()
  @RequirePermission('commission:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateAdjustmentDto) {
    return this.service.createAdjustment(actor, dto);
  }

  @Get()
  @RequirePermission('commission:read')
  list(@CurrentActor() actor: ActorContext, @Query() q: ListAdjustmentsQuery) {
    return this.service.getAdjustments(actor, q);
  }

  @Get(':id')
  @RequirePermission('commission:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getAdjustment(actor, id);
  }

  @Post(':id/submit')
  @RequirePermission('commission:write')
  submit(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.submitAdjustment(actor, id);
  }

  @Post(':id/approve')
  @RequirePermission('commission:write')
  approve(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.approveAdjustment(actor, id);
  }

  @Post(':id/reject')
  @RequirePermission('commission:write')
  reject(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: RejectDto) {
    return this.service.rejectAdjustment(actor, id, dto.reason);
  }
}
