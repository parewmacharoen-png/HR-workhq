// ============================================================================
// modules/ai/ai.module.ts
// ============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LeaveModule } from '../leave/leave.module';
import { ReportingModule } from '../reporting/reporting.module';
import { MarketingModule } from '../marketing/marketing.module';
import { CommissionModule } from '../commission/commission.module';
import { SecurityModule } from '../security/security.module';
import { EmployeeModule } from '../employee/employee.module';
import { PermissionModule } from '../permission/permission.module';
import { AiAssistantService } from './application/ai-assistant.service';
import { KnowledgeAssistantService } from './application/knowledge-assistant.service';
import { AiConversationService } from './application/ai-conversation.service';
import { AiToolContextService } from './application/ai-tool-context.service';
import { AiToolDataService } from './application/ai-tool-data.service';
import { EmployeeSelfServiceQueryService } from './application/employee-self-service-query.service';
import { ToolRegistry } from './application/tool-registry.service';
import { ToolRouter } from './application/tool-router.service';
import { ToolExecutor } from './application/tool-executor.service';
import {
  AiInsightDetectorService,
  AiManagerService,
  AiMorningBriefService,
  AiManagerSchedulerService,
} from './application/ai-manager.service';
import {
  GraphEntityResolverService,
  GraphPermissionFilterService,
  GraphQueryService,
  KnowledgeGraphService,
} from './application/knowledge-graph.service';
import { ClaudeProvider } from './infrastructure/claude.provider';
import { AiController } from './interface/http/ai.controller';
import { AiManagerController } from './interface/http/ai-manager.controller';
import { KnowledgeGraphController } from './interface/http/knowledge-graph.controller';

@Module({
  imports: [
    AppConfigModule,
    ReportingModule,
    KnowledgeModule,
    PermissionModule,
    forwardRef(() => EmployeeModule),
    forwardRef(() => LeaveModule),
    MarketingModule,
    CommissionModule,
    SecurityModule,
  ],
  controllers: [AiController, AiManagerController, KnowledgeGraphController],
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
    KnowledgeAssistantService,
    AiInsightDetectorService,
    AiMorningBriefService,
    AiManagerService,
    AiManagerSchedulerService,
    GraphEntityResolverService,
    GraphPermissionFilterService,
    GraphQueryService,
    KnowledgeGraphService,
  ],
  exports: [
    AiAssistantService,
    KnowledgeAssistantService,
    AiConversationService,
    ToolExecutor,
    ToolRegistry,
    AiManagerService,
    AiMorningBriefService,
    KnowledgeGraphService,
  ],
})
export class AiModule {}
