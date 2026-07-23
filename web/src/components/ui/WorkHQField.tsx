import type { ReactNode } from 'react';

interface WorkHQFieldProps {
  label: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}

export function WorkHQField({ label, children, htmlFor }: WorkHQFieldProps) {
  return (
    <label className="whq-field" htmlFor={htmlFor}>
      <span className="whq-label">{label}</span>
      {children}
    </label>
  );
}
