import type { ReactNode } from 'react';

interface PageActionsProps {
  primary?: ReactNode;
  secondary?: ReactNode;
}

export function PageActions({ primary, secondary }: PageActionsProps) {
  if (!primary && !secondary) return null;
  return (
    <div className="whq-page-actions-row">
      {primary && <div className="whq-page-actions-primary">{primary}</div>}
      {secondary && <div className="whq-page-actions-secondary">{secondary}</div>}
    </div>
  );
}
