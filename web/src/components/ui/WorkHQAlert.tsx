import { useEffect } from 'react';
import { th } from '../../i18n/th-labels';

type AlertTone = 'success' | 'error' | 'warning';

interface WorkHQAlertProps {
  message: string;
  tone?: AlertTone;
  onDismiss?: () => void;
  autoDismissMs?: number;
}

export function WorkHQAlert({
  message,
  tone = 'success',
  onDismiss,
  autoDismissMs = 5000,
}: WorkHQAlertProps) {
  useEffect(() => {
    if (!onDismiss || autoDismissMs <= 0) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [message, onDismiss, autoDismissMs]);

  return (
    <div className={`whq-alert whq-alert-${tone}`} role="status">
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="whq-btn whq-btn-ghost"
          onClick={onDismiss}
          aria-label={th.common.dismiss}
          style={{ padding: '0 0.25rem', minWidth: 0 }}
        >
          ×
        </button>
      )}
    </div>
  );
}
