import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="whq-page-header-block">
      <h1 className="whq-page-title">{title}</h1>
      {description && <p className="whq-page-subtitle">{description}</p>}
    </header>
  );
}

export function PageHeaderActions({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="whq-page-header-actions">{children}</div>;
}
