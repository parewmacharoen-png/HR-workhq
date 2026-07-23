// ============================================================================
// modules/ai/ai.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LeaveModule } from '../leave/leave.module';
import { ReportingModule } from '../reporting/reporting.module';
import { MarketingModule } from '../marketing/marketing.module';
import { CommissionModule } from '../commission/commission.module';
import { AiAssistantService } from './application/ai-assistant.service';
import { AiConversationService } from './application/ai-conversation.service';
import { AiToolContextService } from './application/ai-tool-context.service';
import { AiToolDataService } from './application/ai-tool-data.service';
import { EmployeeSelfServiceQueryService } from './application/employee-self-service-query.service';
import { ToolRegistry } from './application/tool-registry.service';
import { ToolRouter } from './application/tool-router.service';
import { ToolExecutor } from './application/tool-executor.service';
import { ClaudeProvider } from './infrastructure/claude.provider';
import { AiController } from './interface/http/ai.controller';

@Module({
  imports: [AppConfigModule, ReportingModule, KnowledgeModule, LeaveModule, MarketingModule, CommissionModule],
  controllers: [AiController],
  providers: [
    ClaudeProvider,
    AiConversationService,
    AiToolContextService,
    AiToolDataService,
    EmployeeSelfServiceQueryService,
    ToolRegistry,
    ToolRouter,
    ToolExecutor,
    AiAssistantService,
  ],
  exports: [AiAssistantService, AiConversationService, ToolExecutor, ToolRegistry],
})
export class AiModule {}
