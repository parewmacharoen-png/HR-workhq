import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchEmployeeList, type EmployeeListItem } from '../../api/employees';
import { ApiError } from '../../api/client';
import { isAllCompanies } from '../../constants/company';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { useCanAddEmployee } from '../../hooks/useEmployeePermissions';
import { useOnboardingInvitePermissions } from '../../hooks/useOnboardingInvitePermissions';
import { ExportDropdown } from '../../components/data-exchange/ExportDropdown';
import {
  AppPageLayout,
  WorkHQPageState,
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPermissionDenied,
} from '../../components/workhq';
import {
  WorkHQButton,
  WorkHQEmployeeCard,
  WorkHQField,
  WorkHQFilterToolbar,
  WorkHQInput,
  WorkHQSelect,
} from '../../components/ui';
import { employmentStatusLabel, th } from '../../i18n/th-labels';

const STATUS_OPTIONS = [
  { value: '', labelKey: 'workforceStatuses' as const },
  { value: 'active', label: 'active' },
  { value: 'probation', label: 'probation' },
  { value: 'suspended', label: 'suspended' },
  { value: 'terminated', label: 'terminated' },
  { value: 'active,probation,suspended,terminated', labelKey: 'allStatuses' as const },
];

export default function EmployeesPage() {
  const { companies, can } = useAuth();
  const { companyId, companyLabel, hasCompanyScope } = useCompanyScope();
  const canAdd = useCanAddEmployee();
  const invitePerms = useOnboardingInvitePermissions();
  const canRead = can('employee:read');

  const [rows, setRows] = useState<EmployeeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const activeCompanyId = companyId;

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      if (isAllCompanies(activeCompanyId)) {
        const results = await Promise.all(
          companies.map((c) => fetchEmployeeList({
            companyId: c.id,
            search: search.trim() || undefined,
            ...(status
              ? { status }
              : { workforceOnly: true }),
          }).catch(() => ({ items: [], total: 0 }))),
        );
        const items = results.flatMap((r) => r.items);
        setRows(items);
        setTotal(items.length);
      } else {
        const data = await fetchEmployeeList({
          companyId: activeCompanyId,
          search: search.trim() || undefined,
          ...(status
            ? { status }
            : { workforceOnly: true }),
        });
        setRows(data.items);
        setTotal(data.total);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, companies.map((c) => c.id).join(','), search, status]);

  useEffect(() => { void load(); }, [load]);

  const pageState = !canRead
    ? 'permissionDenied' as const
    : !activeCompanyId && !companies.length
      ? 'empty' as const
      : loading
        ? 'loading' as const
        : error
          ? 'error' as const
          : rows.length === 0
            ? 'empty' as const
            : 'success' as const;

  const referenceCode = error instanceof ApiError ? error.requestId : undefined;

  if (!hasCompanyScope) {
    return (
      <AppPageLayout
        breadcrumb={[
          { label: 'ภาพรวม', href: '/dashboard' },
          { label: 'พนักงาน' },
        ]}
        title={`👥 ${th.employees.title}`}
        description={th.employees.selectCompanyDesc}
      >
        <WorkHQEmptyState
          icon="🏢"
          title={th.employees.selectCompanyTitle}
          description={th.employees.selectCompanyDesc}
        />
      </AppPageLayout>
    );
  }

  return (
    <AppPageLayout
      breadcrumb={[
        { label: 'ภาพรวม', href: '/dashboard' },
        { label: 'พนักงาน' },
      ]}
      title={`👥 ${th.employees.title}`}
      description={`${th.employees.subtitle(total, companyLabel || th.nav.selectCompany)} · ${th.employees.teamCheer}`}
      primaryAction={canAdd ? (
        <WorkHQButton to="/hr/employees/new" variant="primary">{th.employees.add}</WorkHQButton>
      ) : undefined}
      secondaryActions={(
        <>
          {invitePerms.canShowInviteButton && (
            <WorkHQButton to="/hr/invitation" variant="secondary">🔗 เชิญพนักงาน</WorkHQButton>
          )}
          {activeCompanyId && !isAllCompanies(activeCompanyId) && (
            <ExportDropdown companyId={activeCompanyId} module="employees" filters={{ status: status || undefined }} />
          )}
          <WorkHQButton type="button" variant="secondary" onClick={() => void load()}>{th.employees.refresh}</WorkHQButton>
        </>
      )}
      quickActions={invitePerms.canShowInviteButton ? (
        <>
          {canAdd && (
            <WorkHQButton to="/hr/employees/new" variant="secondary">+ เพิ่มพนักงาน</WorkHQButton>
          )}
          <WorkHQButton to="/hr/invitation" variant="secondary">🔗 เชิญด้วยลิงก์</WorkHQButton>
        </>
      ) : (canAdd ? (
        <WorkHQButton to="/hr/employees/new" variant="secondary">+ เพิ่มพนักงาน</WorkHQButton>
      ) : undefined)}
    >
      <WorkHQPageState
        state={pageState}
        permissionDenied={<WorkHQPermissionDenied />}
        error={<WorkHQErrorState referenceCode={referenceCode} onRetry={() => void load()} />}
        empty={(
          <WorkHQEmptyState
            icon="👥"
            title="ยังไม่มีพนักงานในบริษัทนี้"
            description={activeCompanyId ? th.employees.emptyDesc : th.employees.selectCompanyDesc}
            action={(canAdd || invitePerms.canShowInviteButton) ? (
              <div className="whq-action-row">
                {invitePerms.canShowInviteButton && (
                  <WorkHQButton to="/hr/invitation" variant="primary">+ เชิญพนักงาน</WorkHQButton>
                )}
                {canAdd && (
                  <WorkHQButton to="/hr/employees/new" variant="secondary">{th.employees.add}</WorkHQButton>
                )}
              </div>
            ) : undefined}
          />
        )}
      >
        <WorkHQFilterToolbar>
          <WorkHQField label={th.employees.search}>
            <WorkHQInput
              type="search"
              placeholder={th.employees.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </WorkHQField>
          <WorkHQField label={th.employees.status}>
            <WorkHQSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'workforce'} value={opt.value}>
                  {'labelKey' in opt && opt.labelKey
                    ? th.employees[opt.labelKey]
                    : employmentStatusLabel('label' in opt ? opt.label! : 'active')}
                </option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
        </WorkHQFilterToolbar>

        <div className="whq-employee-grid">
          {rows.map((row) => (
            <Link key={row.id} to={`/hr/employees/${row.id}`} className="whq-employee-grid-link">
              <WorkHQEmployeeCard employee={row} />
            </Link>
          ))}
        </div>
      </WorkHQPageState>
    </AppPageLayout>
  );
}
