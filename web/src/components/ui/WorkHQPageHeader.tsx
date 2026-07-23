import type { ReactNode } from 'react';

interface WorkHQPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function WorkHQPageHeader({ title, subtitle, actions }: WorkHQPageHeaderProps) {
  return (
    <div className="whq-page-header">
      <div>
        <h1 className="whq-page-title">{title}</h1>
        {subtitle && <p className="whq-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="whq-btn-group">{actions}</div>}
    </div>
  );
}
