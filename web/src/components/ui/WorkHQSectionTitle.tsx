import type { ReactNode } from 'react';

interface WorkHQSectionTitleProps {
  emoji?: string;
  children: ReactNode;
}

export function WorkHQSectionTitle({ emoji, children }: WorkHQSectionTitleProps) {
  return (
    <h2 className="whq-section-title">
      {emoji && <span aria-hidden>{emoji}</span>}
      {children}
    </h2>
  );
}
