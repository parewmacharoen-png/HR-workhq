import { useEffect, useState } from 'react';
import { fetchApprovalTimeline, type ApprovalTimelineEntry } from '../../api/approval';
import type { EmployeeLeaveHistoryItem } from '../../api/employee-leave';
import { formatThaiDate, NO_DATA } from '../../lib/employee-date-utils';
import {
  leaveStatusLabel,
  leaveStatusVariant,
  leaveUserReason,
} from '../../lib/employee-leave-utils';
import { ApprovalTimeline } from '../approvals/ApprovalTimeline';
import { WorkHQButton } from '../ui';

interface LeaveRequestDetailModalProps {
  item: EmployeeLeaveHistoryItem;
  onClose: () => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="whq-info-row">
      <span className="whq-info-label">{label}</span>
      <span className="whq-info-value">{value || NO_DATA}</span>
    </div>
  );
}

export function LeaveRequestDetailModal({ item, onClose }: LeaveRequestDetailModalProps) {
  const [timeline, setTimeline] = useState<ApprovalTimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    if (!item.workflowInstanceId) {
      setTimeline([]);
      return;
    }
    setTimelineLoading(true);
    void fetchApprovalTimeline(item.workflowInstanceId)
      .then((res) => setTimeline(res.timeline))
      .catch(() => setTimeline([]))
      .finally(() => setTimelineLoading(false));
  }, [item.workflowInstanceId]);

  const variant = leaveStatusVariant(item.status);

  return (
    <div className="whq-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="whq-modal whq-card whq-leave-detail-modal"
        onClick={(event) => event.stopPropagation()}
        data-testid="leave-request-detail-modal"
      >
        <div className="whq-modal-head">
          <h2>{item.previousDate ? 'รายละเอียดการเปลี่ยนวันหยุด' : 'รายละเอียดคำขอลา'}</h2>
          <span className={`whq-badge whq-badge-${variant}`}>{leaveStatusLabel(item.status)}</span>
        </div>

        <InfoRow label="ยื่นเมื่อ" value={formatThaiDate(item.requestDate.slice(0, 10))} />
        <InfoRow
          label="ประเภท"
          value={item.previousDate ? 'เปลี่ยนวันหยุด' : item.leaveTypeName}
        />
        {item.previousDate ? (
          <>
            <InfoRow label="วันเดิม" value={formatThaiDate(item.previousDate)} />
            <InfoRow label="วันใหม่" value={formatThaiDate(item.startDate)} />
          </>
        ) : item.startDate === item.endDate ? (
          <InfoRow label="วันที่" value={formatThaiDate(item.startDate)} />
        ) : (
          <>
            <InfoRow label="เริ่ม" value={formatThaiDate(item.startDate)} />
            <InfoRow label="สิ้นสุด" value={formatThaiDate(item.endDate)} />
            <InfoRow label="จำนวนวัน" value={String(item.days)} />
          </>
        )}
        <InfoRow label="ผู้อนุมัติ" value={item.approverName ?? NO_DATA} />
        <InfoRow label="เหตุผล" value={leaveUserReason(item) ?? NO_DATA} />
        {item.shortNotice ? (
          <InfoRow label="หมายเหตุ" value="แจ้งไม่ครบ 7 วัน — หักเงินเดือน" />
        ) : null}

        <div className="whq-leave-detail-timeline">
          <h3>ขั้นตอนอนุมัติ</h3>
          {timelineLoading ? <p className="whq-muted">กำลังโหลด...</p> : <ApprovalTimeline entries={timeline} />}
        </div>

        <div className="whq-modal-actions">
          <WorkHQButton type="button" variant="secondary" onClick={onClose}>
            ปิด
          </WorkHQButton>
        </div>
      </div>
    </div>
  );
}
