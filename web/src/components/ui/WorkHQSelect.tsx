import type { SelectHTMLAttributes, ReactNode } from 'react';

interface WorkHQSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

export function WorkHQSelect({ className = '', children, ...rest }: WorkHQSelectProps) {
  return (
    <select className={`whq-select ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
}
