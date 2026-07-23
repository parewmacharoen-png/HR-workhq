import { Link } from 'react-router-dom';
import type { ApprovalHistoryItem, ApprovalInboxItem } from '../../api/approval';
import { WorkHQBadge } from '../ui';
import { formatThaiDate } from '../../lib/employee-date-utils';
import { matchesApprovalCategory, requestTypeIcon } from '../../lib/request-type-meta';

export type InboxRow = (ApprovalInboxItem | ApprovalHistoryItem) & {
  requestTypeKey?: string;
};

interface Props {
  rows: InboxRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  category: Parameters<typeof matchesApprovalCategory>[0];
  emptyTitle: string;
  emptyDescription?: string;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string): string {
  if (status === 'pending' || status === 'in_review') return 'รออนุมัติ';
  if (status === 'approved') return 'อนุมัติแล้ว';
  if (status === 'rejected') return 'ไม่อนุมัติ';
  if (status === 'cancelled') return 'ยกเลิก';
  return status;
}

function formatDetailLine(line: string): string {
  const trimmed = line.trim();
  const iso = trimmed.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) {
    return trimmed.replace(iso[0], formatThaiDate(iso[0]));
  }
  return trimmed;
}

function pickPrimaryDetail(lines: string[]): { primary: string | null; extras: string[] } {
  if (!lines.length) return { primary: null, extras: [] };
  const dateIdx = lines.findIndex((l) => /วันที่|📅|\d{4}-\d{2}-\d{2}/.test(l));
  const idx = dateIdx >= 0 ? dateIdx : 0;
  const primary = formatDetailLine(lines[idx]);
  const extras = lines
    .filter((_, i) => i !== idx)
    .slice(0, 2)
    .map(formatDetailLine)
    .filter(Boolean);
  return { primary, extras };
}

export function ApprovalInboxList({
  rows,
  selectedId,
  onSelect,
  category,
  emptyTitle,
  emptyDescription,
}: Props) {
  const filtered = rows.filter((row) => matchesApprovalCategory(
    category,
    row.requestTypeKey ?? (row.entityType === 'request' ? null : null),
    row.entityType,
  ));

  if (filtered.length === 0) {
    return (
      <div className="whq-approval-inbox-empty">
        <p className="whq-approval-inbox-empty-title">{emptyTitle}</p>
        {emptyDescription && <p className="whq-card-muted">{emptyDescription}</p>}
      </div>
    );
  }

  return (
    <ul className="whq-approval-inbox-list whq-approval-inbox-list-dense">
      {filtered.map((item) => {
        const icon = requestTypeIcon(item.requestTypeKey, item.entityType);
        const { primary, extras } = pickPrimaryDetail(item.summary.detailLines);
        const isActive = selectedId === item.instanceId;

        return (
          <li key={item.instanceId}>
            <div
              role="button"
              tabIndex={0}
              className={`whq-approval-inbox-item ${isActive ? 'whq-approval-inbox-item-active' : ''}`}
              onClick={() => onSelect(item.instanceId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(item.instanceId);
                }
              }}
              aria-current={isActive ? 'true' : undefined}
            >
              <span className="whq-approval-inbox-item-accent" aria-hidden />
              <div className="whq-approval-inbox-item-inner">
                <div className="whq-approval-inbox-item-icon" aria-hidden>{icon}</div>
                <div className="whq-approval-inbox-item-body">
                  <div className="whq-approval-inbox-item-head">
                    <span className="whq-approval-inbox-type">{item.summary.title}</span>
                    <WorkHQBadge status={item.status} label={statusLabel(item.status)} />
                  </div>

                  <div className="whq-approval-inbox-facts">
                    <div className="whq-approval-inbox-fact">
                      <span className="whq-approval-inbox-fact-label">ผู้ขอ</span>
                      <span className="whq-approval-inbox-fact-value">{item.summary.requesterName}</span>
                    </div>
                    {item.summary.teamName && (
                      <div className="whq-approval-inbox-fact">
                        <span className="whq-approval-inbox-fact-label">ทีม</span>
                        <span className="whq-approval-inbox-fact-value">{item.summary.teamName}</span>
                      </div>
                    )}
                    {primary && (
                      <div className="whq-approval-inbox-fact">
                        <span className="whq-approval-inbox-fact-label">รายละเอียด</span>
                        <span className="whq-approval-inbox-fact-value whq-approval-inbox-fact-value--highlight">
                          {primary}
                        </span>
                      </div>
                    )}
                    {extras.map((line) => (
                      <div key={line} className="whq-approval-inbox-fact">
                        <span className="whq-approval-inbox-fact-label">เพิ่มเติม</span>
                        <span className="whq-approval-inbox-fact-value">{line}</span>
                      </div>
                    ))}
                  </div>

                  <div className="whq-approval-inbox-footer">
                    <span>ส่งเมื่อ {formatWhen(item.submittedAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ApprovalDetailPanel({
  item,
  children,
}: {
  item: InboxRow | null;
  children?: React.ReactNode;
}) {
  if (!item) {
    return <p className="whq-card-muted">เลือกรายการจากด้านซ้ายเพื่อดูรายละเอียด</p>;
  }

  const icon = requestTypeIcon(item.requestTypeKey, item.entityType);

  return (
    <div className="whq-approval-detail">
      <div className="whq-approval-detail-head">
        <span className="whq-approval-detail-icon" aria-hidden>{icon}</span>
        <div>
          <h3 className="whq-approval-detail-title">{item.summary.title}</h3>
          <p className="whq-card-muted">{item.summary.requesterName}</p>
        </div>
        <WorkHQBadge status={item.status} label={statusLabel(item.status)} />
      </div>
      {item.summary.companyName && (
        <p className="whq-approval-detail-row"><span>บริษัท</span> {item.summary.companyName}</p>
      )}
      {item.summary.teamName && (
        <p className="whq-approval-detail-row"><span>ทีม</span> {item.summary.teamName}</p>
      )}
      {item.summary.position && (
        <p className="whq-approval-detail-row"><span>ตำแหน่ง</span> {item.summary.position}</p>
      )}
      {item.summary.detailLines.length > 0 && (
        <ul className="whq-approval-detail-lines">
          {item.summary.detailLines.map((line) => (
            <li key={line} className={line.includes('⚠️') || line.includes('🚨') ? 'whq-approval-warn-line' : undefined}>
              {formatDetailLine(line)}
            </li>
          ))}
        </ul>
      )}
      {item.entityType === 'request' && (
        <p className="whq-approval-detail-link">
          <Link to={`/requests/${item.instanceId}`}>เปิดหน้าคำขอเต็ม →</Link>
        </p>
      )}
      {item.entityType === 'absence_record' && (
        <p className="whq-approval-detail-link">
          <Link to="/attendance/absences">ดูรายการขาดงานทั้งหมด →</Link>
        </p>
      )}
      {children}
    </div>
  );
}
