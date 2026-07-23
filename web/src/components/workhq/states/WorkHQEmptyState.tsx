import type { ReactNode } from 'react';

interface WorkHQEmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function WorkHQEmptyState({
  icon = '🌸',
  title,
  description,
  action,
}: WorkHQEmptyStateProps) {
  return (
    <div className="whq-empty whq-state-panel">
      <div className="whq-empty-icon" aria-hidden>{icon}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
