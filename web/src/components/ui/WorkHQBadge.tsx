import { absenceStatusLabel, employmentStatusLabel } from '../../i18n/th-labels';

type BadgeVariant = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const EMPLOYMENT_VARIANT: Record<string, BadgeVariant> = {
  active: 'success',
  probation: 'info',
  suspended: 'warning',
  terminated: 'danger',
};

const GENERIC_VARIANT: Record<string, BadgeVariant> = {
  draft: 'neutral',
  pending: 'warning',
  in_review: 'warning',
  submitted: 'info',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  voided: 'neutral',
  locked: 'neutral',
  finalized: 'success',
  paid: 'success',
  open: 'info',
  applied: 'success',
  carried_forward: 'warning',
  flagged: 'warning',
  waived: 'neutral',
  disputed: 'info',
  active_telegram: 'success',
  revoked: 'danger',
  REVOKED: 'danger',
};

interface WorkHQBadgeProps {
  status: string;
  label?: string;
}

export function WorkHQBadge({ status, label }: WorkHQBadgeProps) {
  const normalized = status.toLowerCase();
  const variant =
    EMPLOYMENT_VARIANT[normalized] ??
    GENERIC_VARIANT[status] ??
    GENERIC_VARIANT[normalized] ??
    'neutral';
  const text = label ?? absenceStatusLabel(normalized) ?? employmentStatusLabel(normalized) ?? status;
  return <span className={`whq-badge whq-badge-${variant}`}>{text}</span>;
}
