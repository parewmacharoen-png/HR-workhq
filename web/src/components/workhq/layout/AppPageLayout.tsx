import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageActions } from './PageActions';
import { PageHeader } from './PageHeader';
import { QuickActionGrid } from './QuickActionGrid';

export type BreadcrumbItem = { label: string; href?: string };

export type AppPageLayoutProps = {
  breadcrumb?: BreadcrumbItem[];
  title: string;
  description?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  quickActions?: ReactNode;
  stats?: ReactNode;
  rightPanel?: ReactNode;
  children: ReactNode;
};

export function AppPageLayout({
  breadcrumb,
  title,
  description,
  primaryAction,
  secondaryActions,
  quickActions,
  stats,
  rightPanel,
  children,
}: AppPageLayoutProps) {
  const hasActions = primaryAction || secondaryActions;

  return (
    <div className={`whq-page-shell${rightPanel ? ' whq-page-with-panel' : ''}`}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="whq-breadcrumb" aria-label="เส้นทาง">
          {breadcrumb.map((item, i) => (
            <span key={`${item.label}-${i}`} className="whq-breadcrumb-item">
              {i > 0 && <span className="whq-breadcrumb-sep" aria-hidden>›</span>}
              {item.href && i < breadcrumb.length - 1 ? (
                <Link to={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}>{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="whq-page-header-row">
        <PageHeader title={title} description={description} />
        {hasActions && (
          <PageActions primary={primaryAction} secondary={secondaryActions} />
        )}
      </div>

      {quickActions && <QuickActionGrid>{quickActions}</QuickActionGrid>}
      {stats && <div className="whq-page-stats-row">{stats}</div>}

      <div className="whq-page-main-grid">
        <div className="whq-page-main-content">{children}</div>
        {rightPanel && <aside className="whq-page-right-panel">{rightPanel}</aside>}
      </div>
    </div>
  );
}
