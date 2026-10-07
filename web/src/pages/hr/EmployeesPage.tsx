import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchEmployeeList, mergeEmployeeLists, type EmployeeListItem } from '../../api/employees';
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

const WORKFORCE = '';
const ALL_STATUSES = 'active,probation,suspended,terminated';

const STATUS_CHIPS: { value: string; icon: string; label: () => string }[] = [
  { value: WORKFORCE, icon: '🟢', label: () => th.employees.workforceStatuses },
  { value: 'probation', icon: '🌱', label: () => employmentStatusLabel('probation') },
  { value: 'suspended', icon: '⏸️', label: () => employmentStatusLabel('suspended') },
  { value: 'terminated', icon: '👋', label: () => employmentStatusLabel('terminated') },
  { value: ALL_STATUSES, icon: '📋', label: () => th.employees.allStatuses },
];

type SortKey = 'name' | 'nameDesc' | 'code' | 'newest' | 'tenure';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'ชื่อ ก → ฮ' },
  { value: 'nameDesc', label: 'ชื่อ ฮ → ก' },
  { value: 'code', label: 'รหัสพนักงาน' },
  { value: 'newest', label: 'เข้างานล่าสุดก่อน' },
  { value: 'tenure', label: 'อายุงานมากสุดก่อน' },
];

const SORT_STORAGE_KEY = 'whq.employees.sort';

function readStoredSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY);
    if (v && SORT_OPTIONS.some((o) => o.value === v)) return v as SortKey;
  } catch { /* storage unavailable */ }
  return 'name';
}

const fullName = (e: EmployeeListItem) => `${e.firstName} ${e.lastName}`.trim();
const hireTime = (e: EmployeeListItem) => (e.hireDate ? Date.parse(e.hireDate) || 0 : 0);

function sortEmployees(items: EmployeeListItem[], key: SortKey): EmployeeListItem[] {
  const byName = (a: EmployeeListItem, b: EmployeeListItem) => fullName(a).localeCompare(fullName(b), 'th');
  const sorted = [...items];
  switch (key) {
    case 'nameDesc': return sorted.sort((a, b) => byName(b, a));
    case 'code': return sorted.sort((a, b) => a.globalId.localeCompare(b.globalId, undefined, { numeric: true }));
    case 'newest': return sorted.sort((a, b) => hireTime(b) - hireTime(a) || byName(a, b));
    // Missing hire dates go last rather than counting as the longest tenure.
    case 'tenure': return sorted.sort((a, b) => (hireTime(a) || Infinity) - (hireTime(b) || Infinity) || byName(a, b));
    case 'name':
    default: return sorted.sort(byName);
  }
}

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
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(WORKFORCE);
  const [sortKey, setSortKey] = useState<SortKey>(readStoredSort);

  // Debounce so typing doesn't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const changeSort = (key: SortKey) => {
    setSortKey(key);
    try { localStorage.setItem(SORT_STORAGE_KEY, key); } catch { /* storage unavailable */ }
  };

  const sortedRows = useMemo(() => sortEmployees(rows, sortKey), [rows, sortKey]);
  const hasFilters = searchInput.trim() !== '' || status !== WORKFORCE;
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatus(WORKFORCE);
  };

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
        const items = mergeEmployeeLists(results.map((r) => r.items));
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
    >
      {/* Rendered outside the page state so a no-match search doesn't hide the filters. */}
      {canRead && (
        <WorkHQFilterToolbar>
          <div className="whq-employee-filters">
            <div className="whq-employee-filters__row">
              <WorkHQField label={th.employees.search}>
                <WorkHQInput
                  type="search"
                  placeholder={th.employees.searchPlaceholder}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </WorkHQField>
              <WorkHQField label="เรียงตาม">
                <WorkHQSelect value={sortKey} onChange={(e) => changeSort(e.target.value as SortKey)}>
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </WorkHQSelect>
              </WorkHQField>
            </div>
            <div className="whq-employee-filters__status" role="radiogroup" aria-label={th.employees.status}>
              <span className="whq-employee-filters__label">{th.employees.status}</span>
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.value || 'workforce'}
                  type="button"
                  role="radio"
                  aria-checked={status === chip.value}
                  className={`whq-filter-chip${status === chip.value ? ' whq-filter-chip--active' : ''}`}
                  onClick={() => setStatus(chip.value)}
                >
                  <span aria-hidden="true">{chip.icon}</span> {chip.label()}
                </button>
              ))}
              {hasFilters && (
                <button type="button" className="whq-filter-clear" onClick={clearFilters}>
                  ✕ ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>
        </WorkHQFilterToolbar>
      )}
      <WorkHQPageState
        state={pageState}
        permissionDenied={<WorkHQPermissionDenied />}
        error={<WorkHQErrorState referenceCode={referenceCode} onRetry={() => void load()} />}
        empty={hasFilters ? (
          <WorkHQEmptyState
            icon="🔍"
            title={th.employees.noResults}
            description="ลองเปลี่ยนคำค้นหาหรือสถานะดูนะ"
            action={<WorkHQButton type="button" variant="secondary" onClick={clearFilters}>ล้างตัวกรอง</WorkHQButton>}
          />
        ) : (
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
        <div className="whq-employee-grid">
          {sortedRows.map((row) => (
            <Link key={row.id} to={`/hr/employees/${row.id}`} className="whq-employee-grid-link">
              <WorkHQEmployeeCard employee={row} />
            </Link>
          ))}
        </div>
      </WorkHQPageState>
    </AppPageLayout>
  );
}
