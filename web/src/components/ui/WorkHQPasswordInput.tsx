import { useState, type InputHTMLAttributes } from 'react';

export function generateRandomPassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M3 3l18 18" />
        <path d="M10.58 10.58A2 2 0 0 0 12 15a2 2 0 0 0 1.42-.58" />
        <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c7 0 10 7 10 7a14.2 14.2 0 0 1-2.12 3.17" />
        <path d="M6.61 6.61A14.2 14.2 0 0 0 2 12s3 7 10 7a10.94 10.94 0 0 0 2.12-.27" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

interface WorkHQPasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  showGenerate?: boolean;
  generateLabel?: string;
  onGenerate?: (password: string) => void;
}

export function WorkHQPasswordInput({
  className = '',
  showGenerate = false,
  generateLabel = 'สุ่มรหัสใหม่',
  onGenerate,
  value,
  ...rest
}: WorkHQPasswordInputProps) {
  const [visible, setVisible] = useState(false);

  function handleGenerate() {
    const next = generateRandomPassword();
    onGenerate?.(next);
    setVisible(true);
  }

  return (
    <div className="whq-password-field">
      <div className="whq-password-field__input-wrap">
        <input
          {...rest}
          value={value}
          type={visible ? 'text' : 'password'}
          className={`whq-input whq-password-field__input ${className}`.trim()}
        />
        <button
          type="button"
          className="whq-password-field__toggle"
          aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          aria-pressed={visible}
          title={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          onClick={() => setVisible((prev) => !prev)}
        >
          <EyeIcon open={visible} />
          <span className="whq-password-field__toggle-text">{visible ? 'ซ่อน' : 'ดู'}</span>
        </button>
      </div>
      {showGenerate && onGenerate && (
        <button type="button" className="whq-password-field__generate" onClick={handleGenerate}>
          {generateLabel}
        </button>
      )}
    </div>
  );
}
