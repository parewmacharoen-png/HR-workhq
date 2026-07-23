import { th } from '../../../i18n/th-labels';
import { WorkHQEmptyState } from './WorkHQEmptyState';

export function WorkHQSelectCompanyState() {
  return (
    <WorkHQEmptyState
      icon="🏢"
      title={th.employees.selectCompanyTitle}
      description={th.employees.selectCompanyDesc}
    />
  );
}
