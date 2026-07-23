// ============================================================================
// modules/workflow/workflow.module.ts
// ============================================================================

import { Module, OnModuleInit } from '@nestjs/common';
import { HierarchyModule } from '../hierarchy/hierarchy.module';
import { WorkflowController } from './interface/http/workflow.controller';
import { WorkflowService } from './application/workflow.service';
import { WorkflowApproverService } from './application/workflow-approver.service';
import { ApprovalResolverService } from './application/approval-resolver.service';
import { ApprovalMatrixService } from './application/approval-matrix.service';
import { ApprovalNotificationService } from './application/approval-notification.service';
import { WorkflowInboxService } from './application/workflow-inbox.service';
import { ApprovalHubService } from './application/approval-hub.service';
import { ApprovalDelegationService } from './application/approval-delegation.service';
import {
  WORKFLOW_REPOSITORY, WORKFLOW_EVENT_PUBLISHER,
} from './domain/repositories/workflow.repository';
import {
  PrismaWorkflowRepository, OutboxWorkflowEventPublisher,
} from './infrastructure/persistence/workflow.prisma.repository';

@Module({
  imports: [HierarchyModule],
  controllers: [WorkflowController],
  providers: [
    WorkflowService,
    WorkflowApproverService,
    ApprovalResolverService,
    ApprovalMatrixService,
    ApprovalNotificationService,
    WorkflowInboxService,
    ApprovalHubService,
    ApprovalDelegationService,
    { provide: WORKFLOW_REPOSITORY, useClass: PrismaWorkflowRepository },
    { provide: WORKFLOW_EVENT_PUBLISHER, useClass: OutboxWorkflowEventPublisher },
  ],
  exports: [
    WorkflowService,
    WorkflowApproverService,
    ApprovalResolverService,
    ApprovalMatrixService,
    WorkflowInboxService,
    ApprovalHubService,
    ApprovalDelegationService,
    ApprovalNotificationService,
  ],
})
export class WorkflowModule implements OnModuleInit {
  constructor(private readonly approvalMatrix: ApprovalMatrixService) {}

  async onModuleInit(): Promise<void> {
    await this.approvalMatrix.ensureDefaults();
  }
}
