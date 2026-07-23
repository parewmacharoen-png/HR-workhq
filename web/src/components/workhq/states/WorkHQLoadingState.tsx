interface WorkHQLoadingStateProps {
  label?: string;
}

export function WorkHQLoadingState({ label = 'กำลังโหลดข้อมูล…' }: WorkHQLoadingStateProps) {
  return (
    <div className="whq-state-panel whq-loading-panel" role="status" aria-live="polite">
      <div className="whq-loading-spinner" aria-hidden />
      <p>{label}</p>
    </div>
  );
}
