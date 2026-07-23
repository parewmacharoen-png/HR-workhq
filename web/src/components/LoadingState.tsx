import { th } from '../i18n/th-labels';

export function LoadingState({ label = th.common.loading }: { label?: string }) {
  return (
    <div className="whq-state-panel">
      <div className="whq-spinner" aria-hidden />
      <p>{label}</p>
    </div>
  );
}
