import type { HTMLAttributes, ReactNode } from 'react';

interface WorkHQCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  as?: 'section' | 'div';
}

export function WorkHQCard({
  title,
  description,
  children,
  className = '',
  as: Tag = 'section',
  ...rest
}: WorkHQCardProps) {
  return (
    <Tag className={`whq-card ${className}`.trim()} {...rest}>
      {title && <h2 className="whq-card-title">{title}</h2>}
      {description && <p className="whq-card-muted">{description}</p>}
      {children}
    </Tag>
  );
}
