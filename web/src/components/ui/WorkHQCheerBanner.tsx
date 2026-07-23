import { th } from '../../i18n/th-labels';

interface WorkHQCheerBannerProps {
  approvedCount?: number;
  streakDays?: number;
}

export function WorkHQCheerBanner({ approvedCount = 0, streakDays = 5 }: WorkHQCheerBannerProps) {
  return (
    <div className="whq-cheer-banner">
      <span className="whq-cheer-icon" aria-hidden>🎉</span>
      <div>
        <strong>{th.dashboard.cheerTitle}</strong>
        <div className="whq-muted" style={{ fontSize: '0.85rem', marginTop: '0.15rem' }}>
          {th.dashboard.cheerSubtitle(approvedCount)}
        </div>
      </div>
      {streakDays > 0 && (
        <span className="whq-streak-pill">{th.dashboard.streak(streakDays)}</span>
      )}
    </div>
  );
}
