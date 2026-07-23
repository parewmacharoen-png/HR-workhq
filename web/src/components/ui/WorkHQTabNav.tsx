import { Link, useLocation } from 'react-router-dom';

export interface WorkHQTabItem {
  id: string;
  label: string;
  path: string;
  badge?: number;
}

interface WorkHQTabNavProps {
  tabs: WorkHQTabItem[];
  /** When set, match tab by id instead of path */
  activeId?: string;
}

export function WorkHQTabNav({ tabs, activeId }: WorkHQTabNavProps) {
  const { pathname } = useLocation();

  return (
    <nav className="whq-tab-nav" aria-label="แท็บ">
      {tabs.map((tab) => {
        const active = activeId
          ? tab.id === activeId
          : pathname === tab.path
            || (tab.path !== '/requests' && pathname.startsWith(`${tab.path}/`));
        return (
          <Link
            key={tab.id}
            to={tab.path}
            className={`whq-tab-nav-item${active ? ' active' : ''}`}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span className="whq-tab-badge">{tab.badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
