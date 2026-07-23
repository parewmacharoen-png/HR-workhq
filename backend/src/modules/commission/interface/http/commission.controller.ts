// ============================================================================
// modules/commission/interface/http/commission.controller.ts
// ============================================================================

import { Body, Controller, Post } from '@nestjs/common';
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CommissionService } from '../../application/commission.service';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

class AccrueDto {
  @IsUUID() employeeId!: string;
  @IsUUID() companyId!: string;
  @IsUUID() earnCycleId!: string;
  @IsNumber() achievedCandidates!: number;
  @IsNumber() grossAmount!: number;
  @IsOptional() @IsNumber() targetValue?: number;
}

class ProcessHoldDto {
  @IsUUID() commissionRecordId!: string;
  @IsUUID() currentCycleId!: string;
  @IsUUID() redistributeToTeamId!: string;
}

class FinalizeDto {
  @IsUUID() commissionRecordId!: string;
  @IsUUID() payCycleId!: string;
  @IsUUID() payrollItemId!: string;
}

class SplitEntryDto {
  @IsUUID() employeeId!: string;
  @IsNumber() @Min(0) @Max(1) shareRatio!: number;
}

class SplitDto {
  @IsUUID() commissionRecordId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SplitEntryDto) splits!: SplitEntryDto[];
}

class BigLeaderDto {
  @IsUUID() employeeId!: string;
  @IsUUID() companyId!: string;
  @IsUUID() cycleId!: string;
  @IsNumber() earned!: number;
}

@Controller('commission')
export class CommissionController {
  constructor(private readonly service: CommissionService) {}

  @Post('accrue')
  @RequirePermission('commission:write')
  accrue(@CurrentActor() actor: ActorContext, @Body() dto: AccrueDto) {
    return this.service.accrueForCycle(actor, dto);
  }

  @Post('process-hold')
  @RequirePermission('commission:write')
  processHold(@CurrentActor() actor: ActorContext, @Body() dto: ProcessHoldDto) {
    return this.service.processAfterCycle(actor, dto);
  }

  @Post('finalize')
  @RequirePermission('commission:write')
  finalize(@CurrentActor() actor: ActorContext, @Body() dto: FinalizeDto) {
    return this.service.finalizeForCycle(actor, dto);
  }

  @Post('split')
  @RequirePermission('commission:write')
  split(@CurrentActor() actor: ActorContext, @Body() dto: SplitDto) {
    return this.service.splitCommission(actor, dto);
  }

  @Post('big-leader')
  @RequirePermission('commission:write')
  bigLeader(@CurrentActor() actor: ActorContext, @Body() dto: BigLeaderDto) {
    return this.service.processBigLeader(actor, dto);
  }
}
