import type { ReactNode } from 'react';

interface WorkHQPageProps {
  children: ReactNode;
  shell?: boolean;
}

export function WorkHQPage({ children, shell = false }: WorkHQPageProps) {
  if (shell) {
    return <div className="whq-page-shell">{children}</div>;
  }
  return <>{children}</>;
}
