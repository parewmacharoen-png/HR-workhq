import { WorkHQButton } from './WorkHQButton';
import { WorkHQEmptyState } from './WorkHQEmptyState';

interface WorkHQPermissionDeniedProps {
  title?: string;
  description?: string;
}

export function WorkHQPermissionDenied({
  title = 'ไม่มีสิทธิ์เข้าถึง',
  description = 'คุณไม่มีสิทธิ์ดูหน้านี้ หากต้องการสิทธิ์ กรุณาติดต่อ Owner หรือ HR',
}: WorkHQPermissionDeniedProps) {
  return (
    <WorkHQEmptyState
      icon="🔒"
      title={title}
      description={description}
      action={(
        <WorkHQButton to="/dashboard" variant="primary">
          กลับหน้าหลัก
        </WorkHQButton>
      )}
    />
  );
}
