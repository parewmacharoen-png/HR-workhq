import { forwardRef, type InputHTMLAttributes } from 'react';

export const WorkHQInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function WorkHQInput(props, ref) {
    const { className = '', ...rest } = props;
    return <input ref={ref} className={`whq-input ${className}`.trim()} {...rest} />;
  },
);
