import { Link } from 'react-router-dom';
import { WorkHQButton } from '../../ui/WorkHQButton';

export type WorkHQErrorStateProps = {
  title?: string;
  message?: string;
  referenceCode?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
  onReport?: () => void;
};

export function WorkHQErrorState({
  title = 'โหลดข้อมูลไม่สำเร็จ',
  message = 'ข้อมูลของคุณยังปลอดภัย กรุณาลองใหม่อีกครั้ง',
  referenceCode,
  onRetry,
  onGoHome,
  onReport,
}: WorkHQErrorStateProps) {
  return (
    <div className="whq-state-panel whq-error-panel">
      <div className="whq-empty-icon" aria-hidden>😵</div>
      <h3>{title}</h3>
      <p className="whq-muted">{message}</p>
      {referenceCode && (
        <p className="whq-muted whq-ref-code">
          รหัสอ้างอิง: <code>{referenceCode}</code>
        </p>
      )}
      <div className="whq-action-row">
        {onRetry && (
          <WorkHQButton type="button" variant="primary" onClick={onRetry}>
            ลองอีกครั้ง
          </WorkHQButton>
        )}
        {onGoHome ? (
          <WorkHQButton type="button" variant="secondary" onClick={onGoHome}>
            กลับหน้าหลัก
          </WorkHQButton>
        ) : (
          <WorkHQButton to="/dashboard" variant="secondary">
            กลับหน้าหลัก
          </WorkHQButton>
        )}
        {onReport ? (
          <WorkHQButton type="button" variant="ghost" onClick={onReport}>
            แจ้งผู้ดูแลระบบ
          </WorkHQButton>
        ) : (
          <Link to="/settings" className="whq-btn whq-btn-ghost">
            แจ้งผู้ดูแลระบบ
          </Link>
        )}
      </div>
    </div>
  );
}
