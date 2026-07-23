import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  actOnWorkflow,
  createDelegation,
  fetchApprovalHistory,
  fetchApprovalHubPending,
  fetchApprovalHubSummary,
  fetchApprovalTimeline,
  fetchDelegations,
  revokeDelegation,
  type ApprovalDailySummary,
  type ApprovalDelegation,
  type ApprovalHistoryItem,
  type ApprovalInboxItem,
  type ApprovalTimelineEntry,
} from '../../api/approval';
import { listRequestApprovalHistory, approveRequest, rejectRequest, getRequest, type RequestListItem, type OnboardingRequestPreview } from '../../api/request-platform';
import { unifiedPendingToInboxRow } from '../../lib/approval-hub';
import { fetchEmployeeList } from '../../api/employees';
import { ApprovalTimeline } from '../../components/approvals/ApprovalTimeline';
import { ApprovalCategoryChips } from '../../components/approvals/ApprovalCategoryChips';
import { ApprovalDetailPanel, ApprovalInboxList, type InboxRow } from '../../components/approvals/ApprovalInboxList';
import {
  type ApprovalCategory,
  matchesApprovalCategory,
  resolveApprovalCategory,
} from '../../lib/request-type-meta';
import {
  AppPageLayout,
  WorkHQPageState,
  WorkHQErrorState,
  WorkHQPermissionDenied,
} from '../../components/workhq';
import { ApiError } from '../../api/client';
import {
  WorkHQBadge,
  WorkHQButton,
  WorkHQCard,
  WorkHQEmptyState,
  WorkHQField,
  WorkHQFilterToolbar,
  WorkHQInput,
  WorkHQSelect,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { fetchForEachCompany } from '../../utils/multi-company';
import { approveSalaryReview, rejectSalaryReview } from '../../api/compensation-review';
import { approveAbsence, waiveAbsence } from '../../api/absence';
import { th } from '../../i18n/th-labels';
import { formatThaiDate } from '../../lib/employee-date-utils';

type Tab = 'pending' | 'history' | 'delegation';
const PENDING_PAGE_SIZE = 25;

function formatSubmittedWhen(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDetailLine(line: string): string {
  const trimmed = line.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return formatThaiDate(trimmed);
  }
  return trimmed;
}

function pendingCardContent(item: ApprovalInboxItem): {
  who: string;
  company: string | null;
  team: string | null;
  position: string | null;
  what: string;
  when: string;
} {
  const when = formatSubmittedWhen(item.submittedAt);
  const who = item.summary.requesterName || '—';
  const company = item.summary.companyName ?? null;
  const team = item.summary.teamName ?? null;
  const position = item.summary.position ?? null;
  const detail = item.summary.detailLines
    .map(formatDetailLine)
    .filter(Boolean);
  const what = detail.length > 0
    ? detail.join(', ')
    : item.summary.subtitle.replace(/^[^:]+:\s*/, '').trim() || item.summary.subtitle;
  return { who, company, team, position, what, when };
}

const ONBOARDING_TYPE_LABEL = 'รับพนักงานใหม่';

function isOnboardingRequest(row: RequestListItem): boolean {
  const name = row.requestType?.nameTh ?? '';
  return name === ONBOARDING_TYPE_LABEL || name.includes('Telegram') || name.includes('รับพนักงาน');
}

function previewDetailLines(preview: OnboardingRequestPreview | null | undefined): string[] {
  if (!preview) return [];
  const lines: string[] = [];
  if (preview.fullName) lines.push(`ชื่อ: ${preview.fullName}`);
  if (preview.nickname) lines.push(`ชื่อเล่น: ${preview.nickname}`);
  if (preview.phone) lines.push(`โทร: ${preview.phone}`);
  if (preview.companyName) lines.push(`บริษัท: ${preview.companyName}`);
  if (preview.departmentName) lines.push(`แผนก: ${preview.departmentName}`);
  if (preview.teamName) lines.push(`ทีม: ${preview.teamName}`);
  if (preview.businessRole) lines.push(`บทบาท: ${preview.businessRole}`);
  if (preview.position) lines.push(`ตำแหน่ง: ${preview.position}`);
  if (preview.employmentType) lines.push(`ประเภทจ้าง: ${preview.employmentType}`);
  if (preview.startDate) lines.push(`วันเริ่มงาน: ${preview.startDate}`);
  if (preview.telegramUsername || preview.telegramUserId) {
    lines.push(`Telegram: ${preview.telegramUsername ? `@${preview.telegramUsername}` : preview.telegramUserId}`);
  }
  if (preview.submittedAt) {
    lines.push(`ส่งเมื่อ: ${new Date(preview.submittedAt).toLocaleString('th-TH')}`);
  }
  return lines;
}

function requestToInboxItem(row: RequestListItem): InboxRow {
  const requester = row.requesterEmployee;
  const requesterName = requester
    ? `${requester.firstName} ${requester.lastName}`.trim()
    : '—';
  const typeKey = row.requestType?.key ?? 'generic_request';
  const onboarding = isOnboardingRequest(row);
  const typeLabel = onboarding ? ONBOARDING_TYPE_LABEL : (row.requestType?.nameTh ?? 'คำร้อง');
  const previewLines = onboarding ? previewDetailLines(row.onboardingPreview) : [];
  const org = row.requesterContext;
  const detailLines = row.summaryLines?.length
    ? row.summaryLines
    : previewLines.length
      ? previewLines
      : [typeLabel];
  return {
    instanceId: row.id,
    entityType: 'request',
    entityId: row.id,
    companyId: null,
    status: row.status === 'in_review' ? 'pending' : row.status,
    currentStepOrder: 1,
    submittedAt: row.submittedAt ?? new Date().toISOString(),
    summary: {
      title: onboarding ? `รับพนักงานใหม่ — ${row.onboardingPreview?.fullName ?? requesterName}` : row.title,
      subtitle: requesterName,
      requesterName,
      requesterEmployeeId: null,
      companyName: org?.companyName ?? null,
      teamName: org?.teamName ?? null,
      position: org?.position ?? null,
      detailLines,
    },
    requestTypeKey: typeKey,
  };
}

function requestToHistoryItem(row: RequestListItem): InboxRow {
  const base = requestToInboxItem(row);
  return {
    ...base,
    lastActionAt: row.lastActionAt ?? row.submittedAt ?? null,
    lastAction: row.lastAction ?? null,
    lastChannel: row.lastChannel ?? 'telegram',
    resolvedAt: row.resolvedAt ?? null,
  };
}

function mapRequestHistoryStatus(status: string): string | undefined {
  if (!status) return undefined;
  if (status === 'pending') return 'in_review';
  return status;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending': return th.approvals.statusPending;
    case 'approved': return th.approvals.statusApproved;
    case 'rejected': return th.approvals.statusRejected;
    default: return status;
  }
}

function channelLabel(channel: string | null): string {
  if (channel === 'telegram') return th.approvals.channelTelegram;
  if (channel === 'web') return th.approvals.channelWeb;
  return th.approvals.channelSystem;
}

function mergeApprovalSummaries(rows: ApprovalDailySummary[]): ApprovalDailySummary {
  return rows.reduce(
    (acc, s) => ({
      pendingTotal: acc.pendingTotal + s.pendingTotal,
      submittedToday: acc.submittedToday + s.submittedToday,
      leavePending: acc.leavePending + s.leavePending,
      otPending: acc.otPending + s.otPending,
      monthlyOffPending: acc.monthlyOffPending + s.monthlyOffPending,
      attendancePending: acc.attendancePending + s.attendancePending,
      otherPending: acc.otherPending + s.otherPending,
      overdue48h: acc.overdue48h + s.overdue48h,
    }),
    {
      pendingTotal: 0,
      submittedToday: 0,
      leavePending: 0,
      otPending: 0,
      monthlyOffPending: 0,
      attendancePending: 0,
      otherPending: 0,
      overdue48h: 0,
    },
  );
}

export default function ApprovalsPage() {
  const { can } = useAuth();
  const { companyId, isAllCompanies: allCompanies, scopedCompanyIds } = useCompanyScope();
  const canAct = can('workflow:act');

  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<InboxRow[]>([]);
  const [history, setHistory] = useState<InboxRow[]>([]);
  const [delegations, setDelegations] = useState<ApprovalDelegation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<ApprovalTimelineEntry[]>([]);
  const [selectedItem, setSelectedItem] = useState<InboxRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actedIds, setActedIds] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [acting, setActing] = useState(false);
  const [historyStatus, setHistoryStatus] = useState('');
  const [category, setCategory] = useState<ApprovalCategory>('all');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [absenceModal, setAbsenceModal] = useState<'approve' | 'waive' | null>(null);
  const [absenceTargetId, setAbsenceTargetId] = useState<string | null>(null);
  const [contactNotes, setContactNotes] = useState('');
  const [contactAt, setContactAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [absenceSubmitError, setAbsenceSubmitError] = useState<string | null>(null);

  const [delegateUserId, setDelegateUserId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [delegReason, setDelegReason] = useState('');
  const [delegateOptions, setDelegateOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [savingDeleg, setSavingDeleg] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingOffset, setPendingOffset] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingHasMore, setPendingHasMore] = useState(false);
  const [dailySummary, setDailySummary] = useState<ApprovalDailySummary | null>(null);

  const loadPending = useCallback(async (offset = 0) => {
    const params = {
      search: search.trim() || undefined,
      category,
      limit: PENDING_PAGE_SIZE,
      offset,
    };

    if (allCompanies && scopedCompanyIds.length > 0) {
      const results = await fetchForEachCompany(scopedCompanyIds, async (cid) => {
        const [hub, summary] = await Promise.all([
          fetchApprovalHubPending({ ...params, companyId: cid, offset: 0, limit: 100 }),
          fetchApprovalHubSummary(cid),
        ]);
        return { hub, summary };
      });
      const mergedItems = results
        .flatMap((row) => row.result.hub.items)
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
      const page = mergedItems.slice(offset, offset + PENDING_PAGE_SIZE);
      setPending(page.map(unifiedPendingToInboxRow));
      setPendingTotal(mergedItems.length);
      setPendingOffset(offset);
      setPendingHasMore(offset + PENDING_PAGE_SIZE < mergedItems.length);
      setDailySummary(mergeApprovalSummaries(results.map((r) => r.result.summary)));
      return;
    }

    const [hub, summary] = await Promise.all([
      fetchApprovalHubPending({
        companyId: companyId || undefined,
        ...params,
      }),
      fetchApprovalHubSummary(companyId || undefined),
    ]);
    setPending(hub.items.map(unifiedPendingToInboxRow));
    setPendingTotal(hub.total);
    setPendingOffset(hub.offset);
    setPendingHasMore(hub.hasMore);
    setDailySummary(summary);
  }, [allCompanies, scopedCompanyIds, companyId, search, category]);

  const loadHistory = useCallback(async () => {
    const workflowCompanyIds = allCompanies && scopedCompanyIds.length > 0
      ? scopedCompanyIds
      : companyId
        ? [companyId]
        : [];

    const workflowRows = workflowCompanyIds.length > 0
      ? (await Promise.all(
          workflowCompanyIds.map((cid) => fetchApprovalHistory({
            companyId: cid,
            status: historyStatus || undefined,
            limit: 100,
          }).catch(() => [])),
        )).flat()
      : await fetchApprovalHistory({
          status: historyStatus || undefined,
          limit: 100,
        });

    const requestRows = workflowCompanyIds.length > 0
      ? (await Promise.all(
          workflowCompanyIds.map((cid) => listRequestApprovalHistory({
            companyId: cid,
            status: mapRequestHistoryStatus(historyStatus),
            limit: 100,
          }).catch(() => [] as RequestListItem[])),
        )).flat()
      : [];
    const seen = new Set<string>();
    const merged: InboxRow[] = [];
    for (const row of requestRows.map(requestToHistoryItem)) {
      if (seen.has(row.instanceId)) continue;
      seen.add(row.instanceId);
      merged.push(row);
    }
    for (const row of workflowRows) {
      if (seen.has(row.instanceId)) continue;
      seen.add(row.instanceId);
      merged.push({ ...row, requestTypeKey: row.entityType });
    }
    merged.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    setHistory(merged);
  }, [allCompanies, scopedCompanyIds, companyId, historyStatus]);

  const loadDelegations = useCallback(async () => {
    setDelegations(await fetchDelegations());
  }, []);

  const load = useCallback(async () => {
    if (!canAct) return;
    setLoading(true);
    try {
      if (tab === 'pending') await loadPending(0);
      else if (tab === 'history') await loadHistory();
      else await loadDelegations();
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [canAct, tab, loadPending, loadHistory, loadDelegations]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setCategory('all');
    setSelectedId(null);
    setPendingOffset(0);
  }, [tab]);

  useEffect(() => {
    if (tab !== 'pending' || !canAct) return;
    const t = window.setTimeout(() => {
      setPendingOffset(0);
      void loadPending(0);
    }, search ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [search, category, tab, canAct, companyId, loadPending]);

  useEffect(() => {
    if (tab !== 'pending' || loading || pending.length === 0) return;
    setSelectedId((current) => {
      if (current && pending.some((p) => p.instanceId === current)) return current;
      return pending[0].instanceId;
    });
  }, [pending, tab, loading]);

  useEffect(() => {
    if (!selectedId || tab === 'delegation') {
      setTimeline([]);
      setSelectedItem(null);
      return;
    }
    const cached = pending.find((p) => p.instanceId === selectedId);
    if (cached?.entityType === 'absence_record' || cached?.entityType === 'salary_review') {
      setTimeline([]);
      setSelectedItem(cached);
      return;
    }
    if (cached?.entityType === 'request') {
      setTimeline([]);
      setSelectedItem(cached);
      void getRequest(selectedId)
        .then((res) => {
          const preview = res.onboardingPreview as OnboardingRequestPreview | null | undefined;
          if (preview) {
            setSelectedItem({
              ...cached,
              summary: {
                ...cached.summary,
                detailLines: previewDetailLines(preview),
              },
            });
          }
        })
        .catch(() => undefined);
      return;
    }
    void fetchApprovalTimeline(selectedId)
      .then((res) => {
        setTimeline(res.timeline);
        setSelectedItem(res.instance);
      })
      .catch(() => {
        setTimeline([]);
        setSelectedItem(cached ?? null);
      });
  }, [selectedId, tab, pending]);

  useEffect(() => {
    if (tab !== 'delegation') return;
    const cid = allCompanies ? scopedCompanyIds[0] : companyId;
    if (!cid) return;
    void fetchEmployeeList({ companyId: cid })
      .then((data) => {
        setDelegateOptions(
          data.items
            .filter((e) => e.userId)
            .map((e) => ({
              value: e.userId!,
              label: `${e.firstName} ${e.lastName}`.trim(),
            })),
        );
      })
      .catch(() => setDelegateOptions([]));
  }, [tab, allCompanies, scopedCompanyIds, companyId]);

  async function handleApprove(instanceId: string) {
    const item = pending.find((p) => p.instanceId === instanceId);
    if (item?.entityType === 'absence_record') {
      setAbsenceTargetId(instanceId);
      setAbsenceModal('approve');
      setContactNotes('');
      setContactAt(new Date().toISOString().slice(0, 16));
      setAbsenceSubmitError(null);
      return;
    }
    setActing(true);
    try {
      if (item?.entityType === 'salary_review') {
        await approveSalaryReview(instanceId);
      } else if (item?.entityType === 'request') {
        await approveRequest(instanceId);
      } else {
        await actOnWorkflow(instanceId, { action: 'approve' });
      }
      setActedIds((prev) => ({ ...prev, [instanceId]: 'approved' }));
      setSelectedId(instanceId);
      await loadPending(pendingOffset);
    } finally {
      setActing(false);
    }
  }

  function openReject(instanceId: string) {
    const item = pending.find((p) => p.instanceId === instanceId);
    if (item?.entityType === 'absence_record') {
      setAbsenceTargetId(instanceId);
      setAbsenceModal('waive');
      setRejectReason('');
      setAbsenceSubmitError(null);
      return;
    }
    setRejectTargetId(instanceId);
    setSelectedId(instanceId);
    setRejectOpen(true);
  }

  async function submitAbsenceApprove() {
    const targetId = absenceTargetId;
    if (!targetId || contactNotes.trim().length < 10) {
      setAbsenceSubmitError('กรุณากรอกหมายเหตุการติดต่ออย่างน้อย 10 ตัวอักษร');
      return;
    }
    setActing(true);
    try {
      await approveAbsence(targetId, {
        contactAttemptedAt: new Date(contactAt).toISOString(),
        contactNotes: contactNotes.trim(),
      });
      setAbsenceModal(null);
      setAbsenceTargetId(null);
      setActedIds((prev) => ({ ...prev, [targetId]: 'approved' }));
      await loadPending(pendingOffset);
    } catch (err) {
      setAbsenceSubmitError(err instanceof Error ? err.message : 'อนุมัติไม่สำเร็จ');
    } finally {
      setActing(false);
    }
  }

  async function submitAbsenceWaive() {
    const targetId = absenceTargetId;
    if (!targetId || rejectReason.trim().length < 3) {
      setAbsenceSubmitError('กรุณากรอกเหตุผลอย่างน้อย 3 ตัวอักษร');
      return;
    }
    setActing(true);
    try {
      await waiveAbsence(targetId, { reason: rejectReason.trim() });
      setAbsenceModal(null);
      setAbsenceTargetId(null);
      setRejectReason('');
      setSelectedId(null);
      await loadPending(pendingOffset);
    } catch (err) {
      setAbsenceSubmitError(err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ');
    } finally {
      setActing(false);
    }
  }

  async function handleRejectConfirm() {
    const targetId = rejectTargetId ?? selectedId;
    if (!targetId || rejectReason.trim().length < 3) return;
    setActing(true);
    try {
      const item = pending.find((p) => p.instanceId === targetId);
      if (item?.entityType === 'salary_review') {
        await rejectSalaryReview(targetId, rejectReason.trim());
      } else if (item?.entityType === 'request') {
        await rejectRequest(targetId, rejectReason.trim());
      } else {
        await actOnWorkflow(targetId, { action: 'reject', comment: rejectReason.trim() });
      }
      setRejectOpen(false);
      setRejectReason('');
      setRejectTargetId(null);
      setSelectedId(null);
      await loadPending();
    } finally {
      setActing(false);
    }
  }

  async function handleCreateDelegation(e: FormEvent) {
    e.preventDefault();
    if (!delegateUserId || !validFrom || !validTo) return;
    setSavingDeleg(true);
    try {
      await createDelegation({
        delegateUserId,
        companyId: companyId || undefined,
        validFrom: new Date(validFrom).toISOString(),
        validTo: new Date(validTo).toISOString(),
        reason: delegReason.trim() || undefined,
      });
      setDelegateUserId('');
      setValidFrom('');
      setValidTo('');
      setDelegReason('');
      await loadDelegations();
    } finally {
      setSavingDeleg(false);
    }
  }

  if (!canAct) {
    return (
      <AppPageLayout
        breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'อนุมัติ' }]}
        title={th.approvals.title}
        description={th.approvals.subtitle}
      >
        <WorkHQPageState state="permissionDenied" permissionDenied={<WorkHQPermissionDenied />}>
          {null}
        </WorkHQPageState>
      </AppPageLayout>
    );
  }

  const list = tab === 'pending' ? pending : tab === 'history' ? history : [];
  const activeList = tab === 'pending' ? pending : history;
  const selectedFromList = activeList.find((p) => p.instanceId === selectedId) ?? selectedItem;

  const categoryCounts = dailySummary && tab === 'pending'
    ? {
        all: dailySummary.pendingTotal,
        leave: dailySummary.leavePending + dailySummary.monthlyOffPending,
        ot: dailySummary.otPending,
        attendance: dailySummary.attendancePending,
        other: dailySummary.otherPending,
      }
    : activeList.reduce<Partial<Record<ApprovalCategory, number>>>((acc, row) => {
        const cat = resolveApprovalCategory(row.requestTypeKey, row.entityType);
        acc[cat] = (acc[cat] ?? 0) + 1;
        acc.all = (acc.all ?? 0) + 1;
        return acc;
      }, {});
  const referenceCode = error instanceof ApiError ? error.requestId : undefined;
  const pageState = loading
    ? 'loading' as const
    : error
      ? 'error' as const
      : tab !== 'delegation' && list.length === 0
        ? 'empty' as const
        : 'success' as const;

  return (
    <AppPageLayout
      breadcrumb={[{ label: 'ภาพรวม', href: '/dashboard' }, { label: 'อนุมัติ' }]}
      title={th.approvals.title}
      description={th.approvals.subtitle}
      secondaryActions={(
        <WorkHQButton variant="ghost" onClick={() => void load()}>{th.common.refresh}</WorkHQButton>
      )}
    >
      <div className="whq-approval-tabs">
        {(['pending', 'history', 'delegation'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`whq-approval-tab ${tab === t ? 'whq-approval-tab-active' : ''}`}
            onClick={() => { setTab(t); setSelectedId(null); }}
          >
            {t === 'pending' ? th.approvals.tabPending : t === 'history' ? th.approvals.tabHistory : th.approvals.tabDelegation}
            {t === 'pending' && pending.length > 0 && (
              <span className="whq-approval-tab-count">{pending.length}</span>
            )}
          </button>
        ))}
      </div>

      <WorkHQPageState
        state={pageState}
        error={<WorkHQErrorState referenceCode={referenceCode} onRetry={() => void load()} />}
        empty={(
          <WorkHQEmptyState
            title={tab === 'pending' ? th.approvals.emptyPendingTitle : th.approvals.emptyHistoryTitle}
            description={tab === 'pending' ? th.approvals.emptyPendingDesc : th.approvals.emptyHistoryDesc}
          />
        )}
      >
      {tab === 'delegation' ? (
        <div className="whq-approval-layout whq-approval-layout-single">
          <WorkHQCard title={th.approvals.delegationTitle} description={th.approvals.delegationDesc}>
            <form className="whq-form-grid" onSubmit={(e) => void handleCreateDelegation(e)}>
              <WorkHQField label={th.approvals.delegateTo}>
                <WorkHQSelect
                  value={delegateUserId}
                  onChange={(e) => setDelegateUserId(e.target.value)}
                  required
                >
                  <option value="">—</option>
                  {delegateOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </WorkHQSelect>
              </WorkHQField>
              <WorkHQField label={th.approvals.validFrom}>
                <WorkHQInput type="datetime-local" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} required />
              </WorkHQField>
              <WorkHQField label={th.approvals.validTo}>
                <WorkHQInput type="datetime-local" value={validTo} onChange={(e) => setValidTo(e.target.value)} required />
              </WorkHQField>
              <WorkHQField label={th.approvals.reason}>
                <WorkHQInput value={delegReason} onChange={(e) => setDelegReason(e.target.value)} />
              </WorkHQField>
              <WorkHQButton type="submit" disabled={savingDeleg}>
                {savingDeleg ? th.common.saving : th.approvals.createDelegation}
              </WorkHQButton>
            </form>
          </WorkHQCard>

          <WorkHQCard title={th.approvals.tabDelegation}>
            {delegations.length === 0 ? (
              <WorkHQEmptyState title={th.approvals.noDelegations} />
            ) : (
              <ul className="whq-approval-delegation-list">
                {delegations.map((d) => (
                  <li key={d.id} className="whq-approval-delegation-row">
                    <div>
                      <strong>{d.delegatorName}</strong>
                      <span className="whq-card-muted"> → {d.delegateName}</span>
                      <p className="whq-card-muted">
                        {new Date(d.validFrom).toLocaleString('th-TH')} – {new Date(d.validTo).toLocaleString('th-TH')}
                      </p>
                    </div>
                    <div className="whq-approval-delegation-actions">
                      <WorkHQBadge status={d.isActive ? 'active' : 'voided'} label={d.isActive ? th.approvals.active : th.approvals.expired} />
                      {d.isActive && (
                        <WorkHQButton variant="ghost" onClick={() => void revokeDelegation(d.id).then(loadDelegations)}>
                          {th.approvals.revokeDelegation}
                        </WorkHQButton>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </WorkHQCard>
        </div>
      ) : tab === 'pending' ? (
        <>
          {dailySummary && (
            <div className="whq-approval-summary-grid">
              <div className="whq-approval-summary-card">
                <span>รออนุมัติทั้งหมด</span>
                <strong>{dailySummary.pendingTotal}</strong>
              </div>
              <div className="whq-approval-summary-card">
                <span>ส่งวันนี้</span>
                <strong>{dailySummary.submittedToday}</strong>
              </div>
              <div className="whq-approval-summary-card">
                <span>ลา / วันหยุด</span>
                <strong>{dailySummary.leavePending + dailySummary.monthlyOffPending}</strong>
              </div>
              <div className="whq-approval-summary-card">
                <span>OT</span>
                <strong>{dailySummary.otPending}</strong>
              </div>
              {dailySummary.overdue48h > 0 && (
                <div className="whq-approval-summary-card whq-approval-summary-card-warn">
                  <span>ค้าง &gt;48 ชม.</span>
                  <strong>{dailySummary.overdue48h}</strong>
                </div>
              )}
            </div>
          )}
          <WorkHQFilterToolbar>
            <WorkHQField label="ค้นหาพนักงาน">
              <WorkHQInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ชื่อพนักงาน / ทีม / รายละเอียด"
              />
            </WorkHQField>
          </WorkHQFilterToolbar>
          <ApprovalCategoryChips value={category} onChange={(c) => { setCategory(c); setPendingOffset(0); }} counts={categoryCounts} />
          <div className="whq-approval-layout">
            <div className="whq-approval-list-panel">
              <ApprovalInboxList
                rows={pending.map((row) => actedIds[row.instanceId]
                  ? { ...row, status: actedIds[row.instanceId] === 'approved' ? 'approved' : 'rejected' }
                  : row)}
                selectedId={selectedId}
                onSelect={setSelectedId}
                category="all"
                emptyTitle={th.approvals.emptyPendingTitle}
                emptyDescription={th.approvals.emptyPendingDesc}
              />
              <div className="whq-approval-pagination">
                <WorkHQButton
                  variant="ghost"
                  disabled={pendingOffset <= 0 || loading}
                  onClick={() => void loadPending(Math.max(0, pendingOffset - PENDING_PAGE_SIZE))}
                >
                  ← ก่อนหน้า
                </WorkHQButton>
                <span className="whq-card-muted">
                  {pendingTotal === 0
                    ? 'ไม่มีรายการ'
                    : `${pendingOffset + 1}–${Math.min(pendingOffset + PENDING_PAGE_SIZE, pendingTotal)} จาก ${pendingTotal}`}
                </span>
                <WorkHQButton
                  variant="ghost"
                  disabled={!pendingHasMore || loading}
                  onClick={() => void loadPending(pendingOffset + PENDING_PAGE_SIZE)}
                >
                  ถัดไป →
                </WorkHQButton>
              </div>
            </div>
            <WorkHQCard title="รายละเอียด" className="whq-approval-detail-panel">
              <ApprovalDetailPanel item={selectedFromList ?? null}>
                {selectedFromList && (
                  <div className="whq-approval-actions">
                    {actedIds[selectedFromList.instanceId] ? (
                      <p className="whq-approval-acted-banner">
                        {actedIds[selectedFromList.instanceId] === 'approved' ? '✅ อนุมัติแล้ว' : '❌ ไม่อนุมัติแล้ว'}
                      </p>
                    ) : (
                      <>
                        <WorkHQButton
                          variant="primary"
                          disabled={acting}
                          onClick={() => void handleApprove(selectedFromList.instanceId)}
                        >
                          {acting ? th.approvals.acting : th.approvals.approve}
                        </WorkHQButton>
                        <WorkHQButton
                          variant="danger"
                          disabled={acting}
                          onClick={() => openReject(selectedFromList.instanceId)}
                        >
                          {selectedFromList.entityType === 'absence_record' ? 'ยกเลิก' : th.approvals.reject}
                        </WorkHQButton>
                      </>
                    )}
                  </div>
                )}
              </ApprovalDetailPanel>
            </WorkHQCard>
          </div>
        </>
      ) : (
        <>
          <ApprovalCategoryChips value={category} onChange={setCategory} counts={categoryCounts} />
          <div className="whq-approval-layout">
            <div className="whq-approval-list-panel">
              <WorkHQFilterToolbar>
                <WorkHQField label={th.approvals.filterStatus}>
                  <WorkHQSelect value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)}>
                    <option value="">{th.approvals.allStatuses}</option>
                    <option value="pending">{th.approvals.statusPending}</option>
                    <option value="approved">{th.approvals.statusApproved}</option>
                    <option value="rejected">{th.approvals.statusRejected}</option>
                  </WorkHQSelect>
                </WorkHQField>
              </WorkHQFilterToolbar>

              <ApprovalInboxList
                rows={history}
                selectedId={selectedId}
                onSelect={setSelectedId}
                category={category}
                emptyTitle={th.approvals.emptyHistoryTitle}
                emptyDescription={th.approvals.emptyHistoryDesc}
              />
            </div>

            <WorkHQCard title={selectedFromList ? selectedFromList.summary.title : th.approvals.timeline} className="whq-approval-detail-panel">
              <ApprovalDetailPanel item={selectedFromList ?? null}>
                {selectedFromList && timeline.length > 0 && (
                  <>
                    <h3 className="whq-section-title">{th.approvals.timeline}</h3>
                    <ApprovalTimeline entries={timeline} />
                  </>
                )}
              </ApprovalDetailPanel>
            </WorkHQCard>
          </div>
        </>
      )}

      {absenceModal && (
        <div className="whq-modal-backdrop" role="dialog" aria-modal="true">
          <div className="whq-modal whq-card">
            <h3>{absenceModal === 'approve' ? 'อนุมัติขาดงาน' : 'ยกเลิกรายการขาดงาน'}</h3>
            {absenceModal === 'approve' ? (
              <>
                <WorkHQField label="เวลาที่ติดต่อ">
                  <WorkHQInput
                    type="datetime-local"
                    value={contactAt}
                    onChange={(e) => setContactAt(e.target.value)}
                  />
                </WorkHQField>
                <WorkHQField label="หมายเหตุการติดต่อ (อย่างน้อย 10 ตัวอักษร)">
                  <textarea
                    className="whq-input"
                    rows={3}
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                  />
                </WorkHQField>
              </>
            ) : (
              <WorkHQField label="เหตุผลที่ยกเลิก">
                <textarea
                  className="whq-input"
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </WorkHQField>
            )}
            {absenceSubmitError && <p className="whq-error-text">{absenceSubmitError}</p>}
            <div className="whq-modal-actions">
              <WorkHQButton
                variant="ghost"
                onClick={() => {
                  setAbsenceModal(null);
                  setAbsenceTargetId(null);
                  setAbsenceSubmitError(null);
                }}
              >
                {th.common.cancel}
              </WorkHQButton>
              <WorkHQButton
                variant={absenceModal === 'approve' ? 'primary' : 'danger'}
                disabled={acting}
                onClick={() => void (absenceModal === 'approve' ? submitAbsenceApprove() : submitAbsenceWaive())}
              >
                {acting ? th.approvals.acting : absenceModal === 'approve' ? th.approvals.approve : 'ยกเลิก'}
              </WorkHQButton>
            </div>
          </div>
        </div>
      )}
      {rejectOpen && (
        <div className="whq-modal-backdrop" role="dialog" aria-modal="true">
          <div className="whq-modal whq-card">
            <h3>{th.approvals.rejectTitle}</h3>
            <WorkHQField label={th.approvals.rejectReason}>
              <textarea
                className="whq-input"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </WorkHQField>
            <div className="whq-modal-actions">
              <WorkHQButton variant="ghost" onClick={() => { setRejectOpen(false); setRejectTargetId(null); }}>{th.common.cancel}</WorkHQButton>
              <WorkHQButton
                variant="danger"
                disabled={acting || rejectReason.trim().length < 3}
                onClick={() => void handleRejectConfirm()}
              >
                {th.approvals.rejectConfirm}
              </WorkHQButton>
            </div>
          </div>
        </div>
      )}
      </WorkHQPageState>
    </AppPageLayout>
  );
}
