import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { WorkHQEmptyState } from './ui/WorkHQEmptyState';
import { WorkHQButton } from './ui/WorkHQButton';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: string;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <WorkHQEmptyState icon={icon} title={title} description={description} action={action} />
  );
}

export function EmptyStateLink({ to, children }: { to: string; children: ReactNode }) {
  return <WorkHQButton to={to} variant="primary">{children}</WorkHQButton>;
}
