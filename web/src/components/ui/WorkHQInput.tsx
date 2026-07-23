import type { InputHTMLAttributes } from 'react';

export function WorkHQInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input className={`whq-input ${className}`.trim()} {...rest} />;
}
