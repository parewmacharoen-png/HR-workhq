import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  cancelRequest,
  getRequestDashboard,
  listMyRequests,
  listRequestTypes,
  listRequests,
  type RequestListItem,
} from '../../api/request-platform';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { fetchForEachCompany } from '../../utils/multi-company';
import { StatusBadge } from '../../components/StatusBadge';
import {
  AppPageLayout,
  WorkHQPageState,
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPermissionDenied,
  WorkHQSelectCompanyState,
} from '../../components/workhq';
import {
  WorkHQButton,
  WorkHQCard,
  WorkHQField,
  WorkHQFilterToolbar,
  WorkHQSelect,
  WorkHQStatCard,
  WorkHQTabNav,
} from '../../components/ui';
import {
  REQUEST_CATEGORY_OPTIONS,
  categoryLabel,
  requestTypeIcon,
} from '../../lib/request-type-meta';

function resolveTab(pathname: string): 'all' | 'mine' | 'templates' {
  if (pathname.startsWith('/requests/mine')) return 'mine';
  if (pathname.startsWith('/requests/templates')) return 'templates';
  return 'all';
}

const CANCELLABLE = new Set(['draft', 'submitted', 'in_review', 'approved']);
const NON_CANCELLABLE_TYPE_KEYS = new Set(['employee_onboarding', 'telegram_registration_review']);

function canCancelRequest(
  r: RequestListItem,
  tab: 'all' | 'mine' | 'templates',
  employeeId: string | null | undefined,
  businessRole: string | null | undefined,
): boolean {
  if (NON_CANCELLABLE_TYPE_KEYS.has(r.requestType?.key ?? '')) return false;
  if (!CANCELLABLE.has(r.status)) return false;
  if (tab === 'mine') return true;
  if (!employeeId) return true;
  if (r.requesterEmployeeId === employeeId) return true;
  return businessRole === 'owner'
    || businessRole === 'secretary'
    || businessRole === 'big_leader'
    || businessRole === 'sub_leader';
}

export default function RequestsHubPage() {
  const { can, user } = useAuth();
  const { companyId, isAllCompanies: allCompanies, scopedCompanyIds, hasCompanyScope } = useCompanyScope();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveTab(pathname);
  const statusFilter = searchParams.get('status') ?? '';
  const categoryFilter = searchParams.get('category') ?? '';
  const typeKeyFilter = searchParams.get('typeKey') ?? '';

  const [rows, setRows] = useState<RequestListItem[]>([]);
  const [types, setTypes] = useState<Array<{ id: string; nameTh: string; key?: string; category?: string }>>([]);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof getRequestDashboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const canRead = can('workflow:read');

  async function load() {
    if (!hasCompanyScope || !canRead) return;
    setLoading(true);
    setError(null);
    try {
      const companyIds = allCompanies ? scopedCompanyIds : companyId ? [companyId] : [];
      if (!companyIds.length) return;

      const dashboards = await Promise.all(
        companyIds.map((cid) => getRequestDashboard(cid).catch(() => null)),
      );
      const mergedDashboard = dashboards.reduce(
        (acc, dash) => {
          if (!dash) return acc;
          if (!acc) return dash;
          const byTypeMap = new Map(acc.byType.map((row) => [row.requestTypeId, { ...row }]));
          for (const row of dash.byType) {
            const existing = byTypeMap.get(row.requestTypeId);
            if (existing) existing.count += row.count;
            else byTypeMap.set(row.requestTypeId, { ...row });
          }
          return {
            submittedToday: acc.submittedToday + dash.submittedToday,
            pendingApproval: acc.pendingApproval + dash.pendingApproval,
            overdue: acc.overdue + dash.overdue,
            myPendingApprovals: acc.myPendingApprovals + dash.myPendingApprovals,
            byType: [...byTypeMap.values()],
          };
        },
        null as Awaited<ReturnType<typeof getRequestDashboard>> | null,
      );
      setDashboard(mergedDashboard);

      const typeResults = await fetchForEachCompany(companyIds, listRequestTypes);
      const typeMap = new Map<string, { id: string; nameTh: string; key?: string; category?: string }>();
      for (const { result } of typeResults) {
        for (const t of result) {
          const key = typeof t.key === 'string' ? t.key : String(t.id);
          if (!typeMap.has(key)) {
            typeMap.set(key, {
              id: String(t.id),
              nameTh: String(t.nameTh ?? t.name ?? '—'),
              key: typeof t.key === 'string' ? t.key : undefined,
              category: typeof t.category === 'string' ? t.category : undefined,
            });
          }
        }
      }
      setTypes([...typeMap.values()]);

      let list: RequestListItem[] = [];
      if (tab === 'mine') {
        list = await listMyRequests();
      } else if (tab !== 'templates') {
        const listResults = await fetchForEachCompany(companyIds, (cid) => listRequests({
          companyId: cid,
          status: statusFilter || undefined,
          category: categoryFilter || undefined,
          requestTypeKey: typeKeyFilter || undefined,
        }));
        list = listResults.flatMap((row) => row.result);
        list.sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''));
      }
      setRows(list);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [hasCompanyScope, allCompanies, scopedCompanyIds, companyId, tab, statusFilter, categoryFilter, typeKeyFilter, canRead]);

  function setFilter(key: 'status' | 'category' | 'typeKey', value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'category') next.delete('typeKey');
    setSearchParams(next);
  }

  async function handleCancelRequest(r: RequestListItem) {
    const label = r.status === 'draft'
      ? 'ลบแบบร่างนี้?'
      : r.status === 'approved'
        ? 'ยกเลิกคำขอที่อนุมัติแล้ว? ระบบจะคืนวันลา/ยกเลิก OT ที่เกี่ยวข้อง'
        : 'ยกเลิกคำขอนี้?';
    if (!window.confirm(`${label} การดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setActingId(r.id);
    try {
      const reason = r.status === 'approved'
        ? 'ยกเลิกหลังอนุมัติ — แผนเปลี่ยน'
        : r.status === 'draft'
          ? 'ยกเลิกแบบร่าง'
          : 'ยกเลิกคำขอ';
      await cancelRequest(r.id, reason);
      await load();
    } finally {
      setActingId(null);
    }
  }

  const pageState = !canRead
    ? 'permissionDenied' as const
    : !hasCompanyScope
      ? 'empty' as const
      : loading
        ? 'loading' as const
        : error
          ? 'error' as const
          : tab !== 'templates' && rows.length === 0
            ? 'empty' as const
            : 'success' as const;

  const tabs = [
    { id: 'create', label: 'สร้างคำขอ', path: '/requests/create' },
    { id: 'all', label: 'คำขอทั้งหมด', path: '/requests', badge: dashboard?.pendingApproval },
    { id: 'mine', label: 'คำขอของฉัน', path: '/requests/mine' },
    { id: 'templates', label: 'Template คำขอ', path: '/requests/templates' },
  ];

  const referenceCode = error instanceof ApiError ? error.requestId : undefined;

  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'คำขอ' }]}
      title="📋 คำขอ"
      description="สร้าง ติดตาม และจัดการคำขอของพนักงาน — ดูประวัติและสถานะทุกประเภท"
      primaryAction={<WorkHQButton to="/requests/create" variant="primary">+ สร้างคำขอ</WorkHQButton>}
      secondaryActions={(
        <WorkHQButton to="/approvals" variant="secondary">ไปหน้ารออนุมัติ</WorkHQButton>
      )}
      stats={dashboard && tab === 'all' ? (
        <div className="whq-stat-row">
          <WorkHQStatCard icon="📤" value={dashboard.submittedToday} label="ส่งวันนี้" tone="green" />
          <WorkHQStatCard icon="⏳" value={dashboard.pendingApproval} label="รออนุมัติ" tone="warm" />
          <WorkHQStatCard icon="⚠️" value={dashboard.overdue} label="เกินกำหนด" tone="lavender" />
          <WorkHQStatCard icon="👤" value={dashboard.myPendingApprovals} label="รอฉันอนุมัติ" tone="cool" />
        </div>
      ) : undefined}
    >
      <WorkHQTabNav tabs={tabs} activeId={tab} />

      <WorkHQPageState
        state={pageState}
        permissionDenied={<WorkHQPermissionDenied />}
        error={<WorkHQErrorState referenceCode={referenceCode} onRetry={() => void load()} />}
        empty={!hasCompanyScope ? <WorkHQSelectCompanyState /> : (
          <WorkHQEmptyState
            icon="📭"
            title="ยังไม่มีคำขอ"
            description="เมื่อพนักงานส่งคำขอผ่าน Telegram จะแสดงที่นี่ (ไม่รวมแบบร่างที่ยังไม่กดส่ง)"
            action={<WorkHQButton to="/approvals" variant="secondary">ดูหน้ารออนุมัติ</WorkHQButton>}
          />
        )}
      >
        {tab === 'templates' ? (
          <WorkHQCard title="Template คำขอที่เปิดใช้งาน">
            {types.length === 0 ? (
              <WorkHQEmptyState
                icon="📋"
                title="ยังไม่มีประเภทคำขอ"
                description="ตั้งค่าได้ที่ ตั้งค่า → ประเภทคำขอ"
                action={<WorkHQButton to="/admin/request-types" variant="primary">ไปตั้งค่า</WorkHQButton>}
              />
            ) : (
              <table className="data-table">
                <thead><tr><th>ประเภท</th><th>การดำเนินการ</th></tr></thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.id}>
                      <td>{requestTypeIcon(t.key)} {t.nameTh}</td>
                      <td>
                        <WorkHQButton to={`/requests/create?typeId=${t.id}`} variant="secondary">
                          ใช้ Template นี้
                        </WorkHQButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </WorkHQCard>
        ) : (
          <>
            {tab === 'all' && (
              <WorkHQFilterToolbar>
                <WorkHQField label="กลุ่ม">
                  <WorkHQSelect
                    value={categoryFilter}
                    onChange={(e) => setFilter('category', e.target.value)}
                  >
                    {REQUEST_CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value || 'all'} value={o.value}>{o.label}</option>
                    ))}
                  </WorkHQSelect>
                </WorkHQField>
                <WorkHQField label="ประเภท">
                  <WorkHQSelect
                    value={typeKeyFilter}
                    onChange={(e) => setFilter('typeKey', e.target.value)}
                  >
                    <option value="">ทุกประเภท</option>
                    {types
                      .filter((t) => !categoryFilter || t.category === categoryFilter)
                      .map((t) => (
                        <option key={t.id} value={t.key ?? ''}>
                          {requestTypeIcon(t.key)} {t.nameTh}
                        </option>
                      ))}
                  </WorkHQSelect>
                </WorkHQField>
                <WorkHQField label="สถานะ">
                  <WorkHQSelect
                    value={statusFilter}
                    onChange={(e) => setFilter('status', e.target.value)}
                  >
                    <option value="">ส่งแล้ว (ไม่รวมแบบร่าง/ยกเลิก)</option>
                    <option value="in_review">รออนุมัติ</option>
                    <option value="approved">อนุมัติแล้ว</option>
                    <option value="rejected">ไม่อนุมัติ</option>
                    <option value="draft">แบบร่าง (ยังไม่ส่ง)</option>
                    <option value="cancelled">ยกเลิก</option>
                  </WorkHQSelect>
                </WorkHQField>
              </WorkHQFilterToolbar>
            )}
            <WorkHQCard>
              <table className="data-table whq-request-table">
                <thead>
                  <tr>
                    <th>ประเภท</th>
                    <th>หัวข้อ / รายละเอียด</th>
                    <th>ผู้ขอ</th>
                    <th>สถานะ</th>
                    <th>ส่งเมื่อ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const typeKey = r.requestType?.key;
                    const icon = requestTypeIcon(typeKey);
                    const detail = r.summaryLines?.[0] ?? '';
                    const isDraft = r.status === 'draft';
                    const showCancel = canCancelRequest(r, tab, user?.employeeId, user?.businessRole);
                    const busy = actingId === r.id;
                    return (
                      <tr key={r.id}>
                        <td className="whq-request-type-cell">
                          <span className="whq-request-type-icon" aria-hidden>{icon}</span>
                          <span className="whq-request-type-label">
                            {categoryLabel(r.requestType?.category)}
                          </span>
                        </td>
                        <td>
                          <Link to={`/requests/${r.id}`} className="whq-request-title-link">{r.title}</Link>
                          {detail && <div className="whq-card-muted whq-request-detail-line">{detail}</div>}
                        </td>
                        <td>
                          {r.requesterEmployee
                            ? `${r.requesterEmployee.firstName} ${r.requesterEmployee.lastName}`
                            : '—'}
                          {r.requesterContext?.teamName && (
                            <div className="whq-card-muted">{r.requesterContext.teamName}</div>
                          )}
                        </td>
                        <td><StatusBadge status={r.status} /></td>
                        <td>{r.submittedAt ? new Date(r.submittedAt).toLocaleString('th-TH') : '—'}</td>
                        <td className="whq-table-actions">
                          <div className="whq-action-row" style={{ justifyContent: 'flex-start', gap: '0.35rem' }}>
                            {isDraft && (
                              <WorkHQButton to={`/requests/${r.id}`} variant="secondary">
                                แก้ไข
                              </WorkHQButton>
                            )}
                            {showCancel && (
                              <WorkHQButton
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void handleCancelRequest(r)}
                              >
                                {isDraft ? 'ลบ' : 'ยกเลิก'}
                              </WorkHQButton>
                            )}
                            {!isDraft && !showCancel && (
                              <WorkHQButton to={`/requests/${r.id}`} variant="secondary">
                                ดู
                              </WorkHQButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </WorkHQCard>
          </>
        )}
      </WorkHQPageState>
    </AppPageLayout>
  );
}
