import { useState } from 'react';
import { WorkHQButton } from './ui';
import { th } from '../i18n/th-labels';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  open,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal card">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <WorkHQButton type="button" variant="secondary" onClick={onClose}>
            {th.common.cancel}
          </WorkHQButton>
          <WorkHQButton type="button" variant="primary" disabled={busy} onClick={() => void submit()}>
            {confirmLabel}
          </WorkHQButton>
        </div>
      </div>
    </div>
  );
}
