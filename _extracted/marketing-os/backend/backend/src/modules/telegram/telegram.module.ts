// ============================================================================
// modules/telegram/telegram.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { LeaveModule } from '../leave/leave.module';
import { ReportingModule } from '../reporting/reporting.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { MarketingModule } from '../marketing/marketing.module';
import { CommissionModule } from '../commission/commission.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../../auth/auth.module';
import { TelegramController } from './interface/telegram.controller';
import { TelegramBotService } from './application/telegram-bot.service';
import { BriefService } from './application/brief.service';
import { CompanyCodeCacheService } from './application/company-code-cache.service';
import { TelegramMessageLogService } from './application/telegram-message-log.service';
import { TelegramOnboardingService } from './application/telegram-onboarding.service';
import { TelegramDeclarationCorrectionService } from './application/telegram-declaration-correction.service';
import { TelegramGatewayService } from './infrastructure/telegram-gateway.service';

@Module({
  imports: [AuthModule, AttendanceModule, EmployeeModule, LeaveModule, ReportingModule, WorkflowModule, MarketingModule, CommissionModule, AiModule],
  controllers: [TelegramController],
  providers: [
    TelegramBotService,
    BriefService,
    CompanyCodeCacheService,
    TelegramMessageLogService,
    TelegramOnboardingService,
    TelegramDeclarationCorrectionService,
    TelegramGatewayService,
  ],
  exports: [TelegramGatewayService, TelegramBotService],
})
export class TelegramModule {}
