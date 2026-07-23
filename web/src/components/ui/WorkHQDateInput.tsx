import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { WorkHQInput } from './WorkHQInput';
import { formatIsoDateAsDdMmYyyy, parseThaiDateInput, THAI_DATE_PLACEHOLDER } from '../../lib/thai-date-input';

interface WorkHQDateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onChange: (isoValue: string) => void;
}

export function WorkHQDateInput({ value, onChange, className = '', ...rest }: WorkHQDateInputProps) {
  const [display, setDisplay] = useState(() => formatIsoDateAsDdMmYyyy(value));

  useEffect(() => {
    setDisplay(formatIsoDateAsDdMmYyyy(value));
  }, [value]);

  return (
    <WorkHQInput
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={THAI_DATE_PLACEHOLDER}
      className={className}
      value={display}
      onChange={(e) => {
        const next = e.target.value;
        setDisplay(next);
        const parsed = parseThaiDateInput(next);
        if (parsed) onChange(parsed);
        else if (!next.trim()) onChange('');
      }}
      onBlur={() => {
        const parsed = parseThaiDateInput(display);
        if (parsed) {
          setDisplay(formatIsoDateAsDdMmYyyy(parsed));
          onChange(parsed);
          return;
        }
        setDisplay(formatIsoDateAsDdMmYyyy(value));
      }}
    />
  );
}
