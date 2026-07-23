import { WorkHQField, WorkHQSelect } from '../ui';
import { EMPLOYEE_DEPARTMENT_OPTIONS, EMPLOYEE_POSITION_OPTIONS } from '../../lib/employee-org-options';
import { NO_DATA } from '../../lib/employee-date-utils';

interface EmployeeOrgSelectFieldsProps {
  department: string;
  position: string;
  onDepartmentChange: (value: string) => void;
  onPositionChange: (value: string) => void;
  disabled?: boolean;
}

export function EmployeeOrgSelectFields({
  department,
  position,
  onDepartmentChange,
  onPositionChange,
  disabled = false,
}: EmployeeOrgSelectFieldsProps) {
  return (
    <>
      <WorkHQField label="แผนก">
        <WorkHQSelect
          value={department}
          disabled={disabled}
          onChange={(e) => onDepartmentChange(e.target.value)}
        >
          <option value="">{NO_DATA}</option>
          {EMPLOYEE_DEPARTMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </WorkHQSelect>
      </WorkHQField>
      <WorkHQField label="ตำแหน่ง">
        <WorkHQSelect
          value={position}
          disabled={disabled}
          onChange={(e) => onPositionChange(e.target.value)}
        >
          <option value="">{NO_DATA}</option>
          {EMPLOYEE_POSITION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </WorkHQSelect>
      </WorkHQField>
    </>
  );
}
