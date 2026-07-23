import { Link } from 'react-router-dom';
import type { EmployeeListItem } from '../../api/employees';
import { th } from '../../i18n/th-labels';
import { formatTenureBadge } from '../../i18n/employee-dates';
import { WorkHQAvatar } from './WorkHQAvatar';
import { WorkHQBadge } from './WorkHQBadge';
import { avatarVariantForId, employeeDisplayMeta, initials } from './utils';

interface WorkHQEmployeeCardProps {
  employee: EmployeeListItem;
}

export function WorkHQEmployeeCard({ employee }: WorkHQEmployeeCardProps) {
  const role = employeeDisplayMeta(employee);
  const variant = avatarVariantForId(employee.id);
  const tenureBadge = formatTenureBadge(employee.tenureDisplay ?? employee.tenureText);

  return (
    <Link to={`/hr/employees/${employee.id}`} className="whq-employee-card">
      <div className="whq-employee-card-header">
        <WorkHQAvatar
          initials={initials(employee.firstName, employee.lastName)}
          variant={variant}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="whq-employee-card-top">
            <span className="whq-employee-id">{employee.globalId}</span>
            <WorkHQBadge status={employee.employmentStatus} />
          </div>
          <div className="whq-employee-name">
            {employee.firstName} {employee.lastName}
            {employee.nickname ? (
              <span className="whq-employee-nickname"> ({employee.nickname})</span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="whq-employee-role">
        {employee.teamName && <span>{employee.teamName}</span>}
        {employee.teamName && role ? ' · ' : null}
        {role ?? (employee.teamName ? null : th.employees.noPosition)}
      </div>
      {tenureBadge && (
        <span className="whq-tenure-badge whq-tenure-badge--compact">{tenureBadge}</span>
      )}
      <div className="whq-employee-meta">
        <span>
          {employee.username
            ? th.employees.hasLogin(employee.username)
            : th.employees.noLogin}
        </span>
        <span>
          {employee.telegramLinked
            ? th.employees.telegramLinked
            : th.employees.telegramNotLinked}
        </span>
      </div>
    </Link>
  );
}
