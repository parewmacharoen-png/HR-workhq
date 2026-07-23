import { Link } from 'react-router-dom';

interface WorkHQStatCardProps {
  icon: string;
  value: string | number;
  label: string;
  /** Secondary line under the label (plain, not cute fluff) */
  hint?: string;
  tone?: 'green' | 'cool' | 'warm' | 'lavender';
  /** When set, the whole card is a link to details */
  to?: string;
  /** @deprecated use hint */
  trend?: string;
}

export function WorkHQStatCard({
  icon,
  value,
  label,
  hint,
  tone = 'green',
  to,
  trend,
}: WorkHQStatCardProps) {
  const secondary = hint ?? trend;
  const body = (
    <>
      <div className={`whq-stat-icon whq-stat-icon-${tone}`} aria-hidden>{icon}</div>
      <div className="whq-stat-value">{value}</div>
      <div className="whq-stat-label">{label}</div>
      {secondary && <div className="whq-stat-trend">{secondary}</div>}
      {to && <div className="whq-stat-more">ดูรายละเอียด →</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className="whq-stat-link">
        <div className="whq-stat-card whq-stat-card--clickable">{body}</div>
      </Link>
    );
  }

  return <div className="whq-stat-card">{body}</div>;
}
