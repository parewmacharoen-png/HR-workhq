import type { UnifiedPendingItem } from '../api/approval';
import type { InboxRow } from '../components/approvals/ApprovalInboxList';

export function unifiedPendingToInboxRow(item: UnifiedPendingItem): InboxRow {
  return {
    instanceId: item.instanceId,
    entityType: item.source === 'request' ? 'request' : item.entityType,
    entityId: item.instanceId,
    companyId: null,
    status: item.status === 'in_review' ? 'pending' : item.status,
    currentStepOrder: 1,
    submittedAt: item.submittedAt,
    summary: item.summary,
    requestTypeKey: item.requestTypeKey ?? item.entityType,
  };
}
