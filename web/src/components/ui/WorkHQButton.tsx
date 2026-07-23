import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface BaseProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined };
type LinkProps = BaseProps & { to: string; onClick?: never; type?: never; disabled?: never };

export function WorkHQButton(props: ButtonProps | LinkProps) {
  const { variant = 'primary', children, className = '' } = props;
  const cls = `whq-btn whq-btn-${variant} ${className}`.trim();

  if ('to' in props && props.to) {
    return <Link to={props.to} className={cls}>{children}</Link>;
  }

  const { type = 'button', ...buttonRest } = props as ButtonProps;
  return (
    <button type={type} className={cls} {...buttonRest}>
      {children}
    </button>
  );
}
