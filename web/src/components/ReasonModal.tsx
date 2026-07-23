import { useState } from 'react';

interface ReasonModalProps {
  title: string;
  actionLabel: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function ReasonModal({ title, actionLabel, open, onClose, onConfirm }: ReasonModalProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit() {
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal card">
        <h3>{title}</h3>
        <label>
          Reason
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy || reason.trim().length < 3} onClick={submit}>{actionLabel}</button>
        </div>
      </div>
    </div>
  );
}
