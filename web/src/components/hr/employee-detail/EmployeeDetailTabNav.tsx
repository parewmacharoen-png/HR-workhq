import type { EmployeeDetailTabId } from './employee-detail-tabs';
import { EMPLOYEE_DETAIL_TABS } from './employee-detail-tabs';

interface EmployeeDetailTabNavProps {
  activeTab: EmployeeDetailTabId;
  onTabChange: (tab: EmployeeDetailTabId) => void;
  canViewSalary?: boolean;
  canViewPerformance?: boolean;
  canViewCommission?: boolean;
}

export function EmployeeDetailTabNav({
  activeTab,
  onTabChange,
  canViewSalary = true,
  canViewPerformance = true,
  canViewCommission = true,
}: EmployeeDetailTabNavProps) {
  const tabs = EMPLOYEE_DETAIL_TABS.filter((tab) => {
    if (tab.id === 'payroll') return canViewSalary;
    if (tab.id === 'performance') return canViewPerformance;
    if (tab.id === 'commission') return canViewCommission;
    return true;
  });
  return (
    <nav className="whq-tab-nav whq-employee-detail-tabs" aria-label="แท็บพนักงาน">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`whq-tab-nav-item${activeTab === tab.id ? ' active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
