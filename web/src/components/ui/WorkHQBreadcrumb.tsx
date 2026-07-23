import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface WorkHQBreadcrumbProps {
  items: BreadcrumbItem[];
}

export function WorkHQBreadcrumb({ items }: WorkHQBreadcrumbProps) {
  return (
    <nav className="whq-breadcrumb" aria-label="เส้นทาง">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="whq-breadcrumb-item">
          {i > 0 && <span className="whq-breadcrumb-sep" aria-hidden>›</span>}
          {item.path && i < items.length - 1 ? (
            <Link to={item.path}>{item.label}</Link>
          ) : (
            <span aria-current={i === items.length - 1 ? 'page' : undefined}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
