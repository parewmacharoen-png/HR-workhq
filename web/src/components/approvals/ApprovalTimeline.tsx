import type { ApprovalTimelineEntry } from '../../api/approval';
import { th } from '../../i18n/th-labels';

interface Props {
  entries: ApprovalTimelineEntry[];
}

function channelLabel(channel: string | null): string {
  switch (channel) {
    case 'web': return th.approvals.channelWeb;
    case 'telegram': return th.approvals.channelTelegram;
    default: return th.approvals.channelSystem;
  }
}

function actionLabel(action: string | null): string {
  switch (action) {
    case 'approve': return th.approvals.actionApprove;
    case 'reject': return th.approvals.actionReject;
    case 'return': return th.approvals.actionReturn;
    case 'escalate': return th.approvals.actionEscalate;
    case 'override': return th.approvals.actionOverride;
    case 'cancel': return th.approvals.actionCancel;
    case 'submitted': return th.approvals.actionSubmitted;
    default: return action ?? th.common.dash;
  }
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function ApprovalTimeline({ entries }: Props) {
  if (!entries.length) {
    return <p className="whq-card-muted">{th.approvals.emptyHistoryDesc}</p>;
  }

  return (
    <ol className="whq-approval-timeline">
      {entries.map((entry) => (
        <li key={entry.id} className="whq-approval-timeline-item">
          <div className="whq-approval-timeline-dot" aria-hidden />
          <div className="whq-approval-timeline-body">
            <div className="whq-approval-timeline-head">
              <strong>{actionLabel(entry.action)}</strong>
              {entry.stepOrder != null && entry.kind === 'action' && (
                <span className="whq-badge whq-badge-neutral">{th.approvals.step(entry.stepOrder)}</span>
              )}
            </div>
            <p className="whq-card-muted">{entry.actorName}</p>
            <p className="whq-approval-timeline-meta">
              {formatWhen(entry.occurredAt)}
              {' · '}
              {th.approvals.channel}: {channelLabel(entry.channel)}
            </p>
            {entry.comment && <p className="whq-approval-timeline-comment">{entry.comment}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
