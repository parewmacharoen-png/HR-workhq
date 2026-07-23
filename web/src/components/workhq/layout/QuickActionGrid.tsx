import type { ReactNode } from 'react';

interface QuickActionGridProps {
  children: ReactNode;
  title?: string;
}

export function QuickActionGrid({ children, title }: QuickActionGridProps) {
  return (
    <section className="whq-quick-action-section" aria-label={title ?? 'ทางลัด'}>
      {title && <h2 className="whq-section-title">{title}</h2>}
      <div className="whq-quick-actions">{children}</div>
    </section>
  );
}
