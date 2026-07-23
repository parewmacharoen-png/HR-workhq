import type { EmployeeOverviewResponse } from '../../../api/employee-overview';
import { NO_DATA } from '../../../lib/employee-date-utils';
import {
  formatAnniversaryCountdown,
  formatBirthdayCountdown,
  telegramStatusLabel,
} from '../../../lib/employee-overview-display';
import { WorkHQAvatar, WorkHQBadge } from '../../ui';
import { avatarVariantForId, initials } from '../../ui/utils';
import { employmentStatusLabel, roleLabel } from '../../../i18n/th-labels';

interface EmployeeDetailHeaderProps {
  firstName: string;
  lastName: string;
  employeeId: string;
  overview: EmployeeOverviewResponse | null;
  /** Fallback when overview aggregate is stale but identity is active. */
  forceLinked?: boolean;
}

export function EmployeeDetailHeader({
  firstName,
  lastName,
  employeeId,
  overview,
  forceLinked = false,
}: EmployeeDetailHeaderProps) {
  const summary = overview?.summary;
  const nickname = summary?.nickname;
  const businessRole = summary?.businessRole;
  const telegramLinked = forceLinked || summary?.telegramStatus === 'linked';
  const telegramLabel = telegramLinked
    ? telegramStatusLabel('linked')
    : summary
      ? telegramStatusLabel(summary.telegramStatus)
      : 'ยังไม่เชื่อม Telegram';

  return (
    <div className="whq-employee-detail-header">
      <WorkHQAvatar
        initials={initials(firstName, lastName)}
        variant={avatarVariantForId(employeeId)}
        size="lg"
      />
      <div className="whq-employee-detail-header-body">
        <div className="whq-employee-detail-header-badges">
          <WorkHQBadge
            status={summary?.employmentStatus ?? 'inactive'}
            label={summary ? employmentStatusLabel(summary.employmentStatus) : undefined}
          />
          <WorkHQBadge
            status={telegramLinked ? 'active' : 'pending'}
            label={telegramLabel}
          />
        </div>
        <dl className="whq-employee-detail-header-meta-grid">
          <div>
            <dt>ชื่อเล่น</dt>
            <dd>{nickname ?? NO_DATA}</dd>
          </div>
          <div>
            <dt>บทบาท</dt>
            <dd>{businessRole ? roleLabel(businessRole) : NO_DATA}</dd>
          </div>
          <div>
            <dt>วันเกิด</dt>
            <dd>{summary ? formatBirthdayCountdown(summary) : NO_DATA}</dd>
          </div>
          <div>
            <dt>ครบรอบงาน</dt>
            <dd>{summary ? formatAnniversaryCountdown(summary) : NO_DATA}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
