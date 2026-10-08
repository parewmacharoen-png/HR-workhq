import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { WorkHQInput } from './WorkHQInput';
import { formatIsoDateAsDdMmYyyy, THAI_DATE_PLACEHOLDER, validateThaiDateInput } from '../../lib/thai-date-input';

interface WorkHQDateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onChange: (isoValue: string) => void;
  /** Latest allowed ISO date, e.g. today for a birth date. */
  maxIso?: string;
  /** Told whenever the typed text turns valid/invalid, so a page can disable its save button. */
  onValidityChange?: (valid: boolean) => void;
}

/**
 * Text date field typed as dd/mm/yyyy with the พ.ศ. year. A wrong date shows a message under
 * the field and marks the input invalid, so a surrounding <form> will not submit.
 */
export function WorkHQDateInput({
  value,
  onChange,
  maxIso,
  onValidityChange,
  className = '',
  ...rest
}: WorkHQDateInputProps) {
  const [display, setDisplay] = useState(() => formatIsoDateAsDdMmYyyy(value));
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const validityCallback = useRef(onValidityChange);
  validityCallback.current = onValidityChange;

  useEffect(() => {
    // Don't reformat what the user is typing when the change came from this field.
    if (value === lastEmitted.current) return;
    setDisplay(formatIsoDateAsDdMmYyyy(value));
    setError('');
  }, [value]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(error);
    validityCallback.current?.(!error);
  }, [error]);

  useEffect(() => () => validityCallback.current?.(true), []);

  function check(text: string): string {
    if (!text.trim()) return '';
    const result = validateThaiDateInput(text, { maxIso });
    return result.ok ? '' : result.error;
  }

  function emit(iso: string) {
    lastEmitted.current = iso;
    onChange(iso);
  }

  const showError = touched && error;

  return (
    <>
      <WorkHQInput
        {...rest}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={THAI_DATE_PLACEHOLDER}
        className={className}
        aria-invalid={showError ? true : undefined}
        value={display}
        onChange={(e) => {
          const next = e.target.value;
          setDisplay(next);
          const result = validateThaiDateInput(next, { maxIso });
          if (result.ok) emit(result.iso);
          else if (!next.trim()) emit('');
          setError(check(next));
        }}
        onBlur={(e) => {
          setTouched(true);
          const result = validateThaiDateInput(display, { maxIso });
          if (result.ok) {
            setDisplay(formatIsoDateAsDdMmYyyy(result.iso));
            emit(result.iso);
          }
          setError(check(display));
          rest.onBlur?.(e);
        }}
      />
      {showError ? <span className="whq-field-error" role="alert">{error}</span> : null}
    </>
  );
}
