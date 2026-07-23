import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  borrowAsset,
  fetchAssetList,
  fetchBorrowSummary,
  returnAsset,
  type AssetCategory,
  type AssetListItem,
  type AssetStatus,
} from '../../../api/assets';
import { useAuth } from '../../../context/AuthContext';
import { EmployeeSearchSelect } from '../../../components/hr/EmployeeSearchSelect';
import { LoadingState } from '../../../components/LoadingState';
import { ErrorState } from '../../../components/ErrorState';
import {
  WorkHQBadge,
  WorkHQButton,
  WorkHQCard,
  WorkHQField,
  WorkHQInput,
  WorkHQPage,
  WorkHQPageHeader,
  WorkHQSelect,
} from '../../../components/ui';
import { CompanyScopePicker, WorkHQSelectCompanyState } from '../../../components/workhq';
import { useCompanyScope } from '../../../hooks/useCompanyScope';
import { useScopedCompanyId } from '../../../hooks/useScopedCompanyId';
import { formatThaiDate } from '../../../lib/employee-date-utils';
import { fetchForEachCompany, mergeAssetLists, mergeBorrowSummaries } from '../../../utils/multi-company';
import { th } from '../../../i18n/th-labels';

type TabId = 'summary' | 'registry' | 'borrow';

type SummaryEmployee = ReturnType<typeof mergeBorrowSummaries>['byEmployee'][number];
type RegistryAsset = AssetListItem & { companyName: string };

const CATEGORY_OPTIONS: Array<{ value: AssetCategory; label: string }> = [
  { value: 'notebook', label: th.assets.categoryNotebook },
  { value: 'equipment', label: th.assets.categoryEquipment },
  { value: 'phone', label: th.assets.categoryPhone },
  { value: 'tablet', label: th.assets.categoryTablet },
  { value: 'vehicle', label: th.assets.categoryVehicle },
];

function categoryLabel(category: AssetCategory | null | undefined): string {
  if (!category) return th.assets.categoryEquipment;
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;
}

function statusLabel(status: AssetStatus): string {
  return th.assets.statusLabels[status] ?? status;
}

export default function CompanyAssetsPage() {
  const {
    companies,
    scopedCompanyIds,
    hasCompanyScope,
    isAllCompanies,
    companyLabel,
  } = useCompanyScope();
  const {
    companyId: borrowCompanyId,
    setLocalCompanyId,
    needsLocalPicker,
  } = useScopedCompanyId();
  const { can, canAny } = useAuth();
  const canRead = canAny('asset:read', 'employee:read');
  const canWrite = canAny('asset:write', 'employee:write');

  const [tab, setTab] = useState<TabId>('summary');
  const [summaryEmployees, setSummaryEmployees] = useState<SummaryEmployee[]>([]);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [assets, setAssets] = useState<RegistryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
  const [search, setSearch] = useState('');
  const [returningId, setReturningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [borrowEmployeeId, setBorrowEmployeeId] = useState('');
  const [borrowName, setBorrowName] = useState('');
  const [borrowCategory, setBorrowCategory] = useState<AssetCategory>('equipment');
  const [borrowNotes, setBorrowNotes] = useState('');
  const [borrowSaving, setBorrowSaving] = useState(false);
  const [borrowSuccess, setBorrowSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasCompanyScope) return;
    setLoading(true);
    setActionError(null);
    try {
      const filterParams = {
        status: statusFilter || undefined,
        search: search.trim() || undefined,
      };
      const [summaryRows, assetRows] = await Promise.all([
        fetchForEachCompany(scopedCompanyIds, (id) => fetchBorrowSummary(id)),
        fetchForEachCompany(scopedCompanyIds, (id) => fetchAssetList(id, filterParams)),
      ]);
      const mergedSummary = mergeBorrowSummaries(summaryRows, companies);
      setSummaryEmployees(mergedSummary.byEmployee);
      setSummaryTotal(mergedSummary.totalActive);
      setAssets(mergeAssetLists(assetRows, companies));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [companies, hasCompanyScope, scopedCompanyIds, search, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const handleReturn = async (assetId: string) => {
    setReturningId(assetId);
    setActionError(null);
    try {
      await returnAsset(assetId);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : th.assets.returnFailed);
    } finally {
      setReturningId(null);
    }
  };

  const handleBorrow = async (e: FormEvent) => {
    e.preventDefault();
    if (!borrowCompanyId || !borrowEmployeeId || !borrowName.trim()) return;
    setBorrowSaving(true);
    setBorrowSuccess(null);
    setActionError(null);
    try {
      await borrowAsset(borrowCompanyId, {
        employeeId: borrowEmployeeId,
        name: borrowName.trim(),
        category: borrowCategory,
        notes: borrowNotes.trim() || undefined,
      });
      setBorrowSuccess(th.assets.borrowSuccess);
      setBorrowName('');
      setBorrowNotes('');
      setBorrowEmployeeId('');
      setTab('summary');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : th.assets.borrowFailed);
    } finally {
      setBorrowSaving(false);
    }
  };

  if (!canRead) {
    return (
      <WorkHQPage>
        <WorkHQCard title={th.assets.accessDeniedTitle}>
          <p>{th.assets.accessDeniedDesc}</p>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  if (!hasCompanyScope) {
    return (
      <WorkHQPage>
        <WorkHQSelectCompanyState />
      </WorkHQPage>
    );
  }

  const pageSubtitle = isAllCompanies
    ? `${th.assets.pageSubtitle} · ${companyLabel} (${scopedCompanyIds.length})`
    : th.assets.pageSubtitle;

  return (
    <WorkHQPage>
      <WorkHQPageHeader
        title={th.assets.pageTitle}
        subtitle={pageSubtitle}
        actions={canWrite ? (
          <WorkHQButton type="button" onClick={() => setTab('borrow')}>
            {th.assets.borrowNew}
          </WorkHQButton>
        ) : undefined}
      />

      <div className="whq-tab-nav" role="tablist" aria-label={th.assets.pageTitle}>
        {([
          ['summary', th.assets.tabSummary],
          ['registry', th.assets.tabRegistry],
          ['borrow', th.assets.tabBorrow],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`whq-tab-nav-item${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {actionError ? (
        <WorkHQCard title={th.common.errorGeneric}>
          <p>{actionError}</p>
        </WorkHQCard>
      ) : null}

      {loading ? <LoadingState /> : null}
      {!loading && error ? <ErrorState error={error} onRetry={() => void load()} /> : null}

      {!loading && !error && tab === 'summary' ? (
        <WorkHQCard
          title={th.assets.summaryTitle}
          description={th.assets.summarySubtitle.replace('{count}', String(summaryTotal))}
        >
          {!summaryEmployees.length ? (
            <p className="whq-muted">{th.assets.summaryEmpty}</p>
          ) : (
            <div className="whq-stack whq-stack--md">
              {summaryEmployees.map((emp) => (
                <div key={`${emp.companyId}-${emp.employeeId}`} className="whq-card whq-card--nested">
                  <div className="whq-flex whq-flex--between whq-flex--wrap whq-gap-sm">
                    <div>
                      <strong>
                        {emp.firstName} {emp.lastName}
                      </strong>
                      <span className="whq-muted"> · {emp.globalId}</span>
                      {isAllCompanies ? (
                        <span className="whq-muted"> · {emp.companyName}</span>
                      ) : null}
                    </div>
                    <Link to={`/hr/employees/${emp.employeeId}?tab=assets`} className="whq-link">
                      {th.assets.viewEmployee}
                    </Link>
                  </div>
                  <table className="whq-table whq-table--compact whq-mt-sm">
                    <thead>
                      <tr>
                        <th>{th.assets.colItem}</th>
                        <th>{th.assets.colCategory}</th>
                        <th>{th.assets.colBorrowedAt}</th>
                        <th>{th.assets.colNotes}</th>
                        {canWrite ? <th /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {emp.items.map((item) => (
                        <tr key={item.assignmentId}>
                          <td>
                            <div>{item.name}</div>
                            <div className="whq-muted whq-text-sm">{item.assetTag}</div>
                          </td>
                          <td>{categoryLabel(item.category)}</td>
                          <td>{formatThaiDate(item.assignedAt)}</td>
                          <td>{item.notes || '—'}</td>
                          {canWrite ? (
                            <td>
                              <WorkHQButton
                                type="button"
                                variant="secondary"
                                disabled={returningId === item.assetId}
                                onClick={() => void handleReturn(item.assetId)}
                              >
                                {returningId === item.assetId ? th.assets.returning : th.assets.returnItem}
                              </WorkHQButton>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </WorkHQCard>
      ) : null}

      {!loading && !error && tab === 'registry' ? (
        <WorkHQCard title={th.assets.registryTitle}>
          <div className="whq-form-grid whq-form-grid--filters whq-mb-md">
            <WorkHQField label={th.assets.filterStatus}>
              <WorkHQSelect
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AssetStatus | '')}
              >
                <option value="">{th.assets.filterAllStatuses}</option>
                <option value="assigned">{statusLabel('assigned')}</option>
                <option value="available">{statusLabel('available')}</option>
                <option value="maintenance">{statusLabel('maintenance')}</option>
                <option value="retired">{statusLabel('retired')}</option>
              </WorkHQSelect>
            </WorkHQField>
            <WorkHQField label="ค้นหา">
              <WorkHQInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={th.assets.searchPlaceholder}
              />
            </WorkHQField>
          </div>
          {!assets.length ? (
            <p className="whq-muted">{th.assets.registryEmpty}</p>
          ) : (
            <table className="whq-table">
              <thead>
                <tr>
                  {isAllCompanies ? <th>บริษัท</th> : null}
                  <th>{th.assets.colItem}</th>
                  <th>{th.assets.colCategory}</th>
                  <th>{th.payrollOverview.colStatus}</th>
                  <th>{th.assets.colHolder}</th>
                  {canWrite ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const holder = asset.activeAssignment?.employee;
                  return (
                    <tr key={asset.id}>
                      {isAllCompanies ? <td>{asset.companyName}</td> : null}
                      <td>
                        <div>{asset.name}</div>
                        <div className="whq-muted whq-text-sm">{asset.assetTag}</div>
                      </td>
                      <td>{categoryLabel(asset.category)}</td>
                      <td>
                        <WorkHQBadge status={asset.status} label={statusLabel(asset.status)} />
                      </td>
                      <td>
                        {holder ? (
                          <Link to={`/hr/employees/${holder.id}?tab=assets`} className="whq-link">
                            {holder.firstName} {holder.lastName}
                          </Link>
                        ) : '—'}
                      </td>
                      {canWrite && asset.status === 'assigned' ? (
                        <td>
                          <WorkHQButton
                            type="button"
                            variant="secondary"
                            disabled={returningId === asset.id}
                            onClick={() => void handleReturn(asset.id)}
                          >
                            {th.assets.returnItem}
                          </WorkHQButton>
                        </td>
                      ) : canWrite ? <td /> : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </WorkHQCard>
      ) : null}

      {!loading && !error && tab === 'borrow' ? (
        <WorkHQCard title={th.assets.borrowFormTitle}>
          {!canWrite ? (
            <p>{th.assets.accessDeniedDesc}</p>
          ) : (
            <form className="whq-form-grid whq-form-grid--page" onSubmit={(e) => void handleBorrow(e)}>
              {needsLocalPicker ? (
                <div className="whq-field whq-field--full">
                  <CompanyScopePicker
                    companies={companies}
                    companyIds={scopedCompanyIds}
                    value={borrowCompanyId}
                    onChange={setLocalCompanyId}
                    label="บริษัทที่บันทึกยืม"
                  />
                </div>
              ) : null}
              <WorkHQField label={<>{th.assets.borrowEmployee} <span aria-hidden>*</span></>}>
                <EmployeeSearchSelect
                  companyId={borrowCompanyId}
                  value={borrowEmployeeId}
                  onChange={setBorrowEmployeeId}
                />
              </WorkHQField>
              <WorkHQField label={<>{th.assets.borrowItemName} <span aria-hidden>*</span></>}>
                <WorkHQInput
                  value={borrowName}
                  onChange={(e) => setBorrowName(e.target.value)}
                  placeholder={th.assets.borrowItemPlaceholder}
                  required
                />
              </WorkHQField>
              <WorkHQField label={th.assets.colCategory}>
                <WorkHQSelect
                  value={borrowCategory}
                  onChange={(e) => setBorrowCategory(e.target.value as AssetCategory)}
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </WorkHQSelect>
              </WorkHQField>
              <div className="whq-field whq-field--full">
                <WorkHQField label={th.assets.borrowNotes}>
                  <textarea
                    className="whq-input"
                    value={borrowNotes}
                    onChange={(e) => setBorrowNotes(e.target.value)}
                    placeholder={th.assets.borrowNotesPlaceholder}
                    rows={3}
                  />
                </WorkHQField>
              </div>
              {borrowSuccess ? <p className="whq-text-success whq-field--full">{borrowSuccess}</p> : null}
              <div className="whq-field--full">
                <WorkHQButton type="submit" disabled={borrowSaving || !borrowCompanyId || !borrowEmployeeId || !borrowName.trim()}>
                  {borrowSaving ? th.assets.borrowSaving : th.assets.borrowSubmit}
                </WorkHQButton>
              </div>
            </form>
          )}
        </WorkHQCard>
      ) : null}
    </WorkHQPage>
  );
}
