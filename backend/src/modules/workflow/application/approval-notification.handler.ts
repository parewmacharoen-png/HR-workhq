// ============================================================================
// modules/workflow/application/approval-notification.handler.ts
// REQ-005 — pluggable hooks for approval notification delivery channels.
// ============================================================================

export type ApprovalRequestedPayload = {
  workflowInstanceId: string;
  workflowType: string;
  entityType: string;
  entityId: string;
  companyId: string | null;
  approverUserIds: string[];
  submitterUserId: string;
};

export type ApprovalActionPayload = {
  event: 'approval_approved' | 'approval_rejected' | 'approval_escalated' | 'approval_reassigned';
  workflowInstanceId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  companyId: string | null;
  submitterUserId?: string | null;
  comment?: string | null;
  /** Set when approve advances to next step (not terminal). */
  nextApproverUserIds?: string[];
  workflowType?: string | null;
  terminalStatus?: 'approved' | 'rejected' | null;
};

export interface ApprovalNotificationHandler {
  onApprovalRequested(payload: ApprovalRequestedPayload): Promise<void>;
  onApprovalAction(payload: ApprovalActionPayload): Promise<void>;
}

export const APPROVAL_NOTIFICATION_HANDLERS = Symbol('APPROVAL_NOTIFICATION_HANDLERS');
