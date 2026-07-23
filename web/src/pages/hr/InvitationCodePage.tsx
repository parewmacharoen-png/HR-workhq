import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchEmployeeList } from '../../api/employees';
import {
  cancelTelegramInvite,
  createNewEmployeeTelegramInvite,
  createQuickEmployeeTelegramInvite,
  createTelegramInvite,
  getTelegramInviteDetail,
  listCompanyTelegramInvites,
  listEmployeeTelegramInvites,
  regenerateTelegramInvite,
  approveSelfOnboarding,
  rejectSelfOnboarding,
} from '../../api/employee-onboarding';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { fetchForEachCompany } from '../../utils/multi-company';
import { useOnboardingInvitePermissions } from '../../hooks/useOnboardingInvitePermissions';
import { qualifiesForSharedPayroll, perCompanyShare } from '../../lib/shared-payroll';
import { th } from '../../i18n/th-labels';
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
  WorkHQSelect,
  WorkHQBadge,
  WorkHQDateInput,
} from '../../components/ui';
import {
  EmployeePerCompanyOrgFields,
  type CompanyOrgSelection,
} from '../../components/hr/EmployeePerCompanyOrgFields';

interface InviteRow {
  id: string;
  status: string;
  expiresAt?: string;
  tokenPreview?: string;
  createdAt?: string;
}

interface CompanyInviteRow {
  id: string;
  inviteType: string;
  inviteTypeLabel: string;
  submittedName: string | null;
  companyName: string | null;
  departmentName: string | null;
  teamName: string | null;
  businessRole: string | null;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string;
  createdAt: string;
  createdByName: string | null;
  employeeId: string | null;
  employeeLabel: string | null;
  usedTelegramUsername: string | null;
  canCopyLink: boolean;
  copyLinkHint: string | null;
  tokenPreview: string;
  submissionId?: string | null;
  submissionStatus?: string | null;
  canApprove?: boolean;
  canRegenerate?: boolean;
}

const SUBMISSION_FIELD_TH: Record<string, string> = {
  fullName: 'ชื่อ-นามสกุล',
  firstName: 'ชื่อ',
  lastName: 'นามสกุล',
  nickname: 'ชื่อเล่น',
  phone: 'โทรศัพท์',
  email: 'อีเมล',
  dateOfBirth: 'วันเกิด',
  address: 'ที่อยู่',
  emergencyContactName: 'ผู้ติดต่อฉุกเฉิน',
  emergencyContactPhone: 'เบอร์ฉุกเฉิน',
  emergencyContactRelationship: 'ความสัมพันธ์',
};

function formatEmploymentValue(key: string, value: unknown): string {
  if (key === 'hasAdditionalTeam') return value === 'yes' ? 'ใช่' : value === 'no' ? 'ไม่มี' : String(value ?? '—');
  if (key === 'declaredWorkLocation') return value === 'wfh' ? 'WFH' : value === 'office' ? 'Office' : String(value ?? '—');
  if (key === 'declaredOfficeType') {
    return value === 'back_office' ? 'Back Office' : value === 'front_office' ? 'Front Office' : String(value ?? '—');
  }
  if (key === 'declaredTeamName' || key === 'declaredAdditionalTeamName') {
    return String(value ?? '—').replace(/^Team /, 'ทีม ');
  }
  return String(value ?? '—');
}

const INVITE_FLOW_STEPS = [
  { key: 'pending', label: 'สร้างลิงก์เชิญ' },
  { key: 'started', label: 'เริ่มลงทะเบียนผ่าน Telegram' },
  { key: 'submitted', label: 'ส่งข้อมูลให้ HR ตรวจสอบ' },
  { key: 'used', label: 'HR อนุมัติ / เชื่อม Telegram สำเร็จ' },
  { key: 'cancelled', label: 'ยกเลิก / ปฏิเสธ' },
  { key: 'expired', label: 'หมดอายุ' },
];

const INVITE_STATUS_TH: Record<string, string> = {
  pending: 'รอใช้งาน',
  started: 'เริ่มลงทะเบียน',
  used: 'อนุมัติแล้ว',
  expired: 'หมดอายุ',
  cancelled: 'ยกเลิก',
};

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleString('th-TH');
}

function fmtDateShort(v: string | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function inviteSubjectLine(row: CompanyInviteRow) {
  return row.submittedName ?? row.employeeLabel ?? row.usedTelegramUsername ?? '—';
}

function inviteMetaLine(row: CompanyInviteRow) {
  const parts = [row.inviteTypeLabel];
  if (row.businessRole) parts.push(row.businessRole);
  if (row.departmentName) parts.push(row.departmentName);
  if (row.teamName) parts.push(row.teamName);
  if (row.createdByName) parts.push(`โดย ${row.createdByName}`);
  return parts.join(' · ');
}


export default function InvitationCodePage() {
  const { companies, loading: authLoading } = useAuth();
  const {
    companyId,
    isAllCompanies: allCompanies,
    scopedCompanyIds,
    hasCompanyScope,
    companyLabel,
  } = useCompanyScope();
  const invitePerms = useOnboardingInvitePermissions();
  const [inviteMode, setInviteMode] = useState<'new' | 'existing'>('new');
  const [businessRole, setBusinessRole] = useState('employee');
  const [employmentType, setEmploymentType] = useState('full_time');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [position, setPosition] = useState('');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [depositCollectionCompanyId, setDepositCollectionCompanyId] = useState('');
  const [companyOrgById, setCompanyOrgById] = useState<Record<string, CompanyOrgSelection>>({});
  const [inviteCompanyIds, setInviteCompanyIds] = useState<string[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; label: string; hasTelegram?: boolean }>>([]);
  const [selectedId, setSelectedId] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [history, setHistory] = useState<InviteRow[]>([]);
  const [companyInvites, setCompanyInvites] = useState<CompanyInviteRow[]>([]);
  const [freshLinks, setFreshLinks] = useState<Record<string, string>>({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [actingInviteId, setActingInviteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState(false);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState(
    import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.replace(/^@/, '') ?? '',
  );

  const canInvite = invitePerms.canShowPage;
  const canCreateInvite = invitePerms.showNewMode || invitePerms.showExistingMode;
  const companyIds = useMemo(
    () => (allCompanies ? scopedCompanyIds : companyId ? [companyId] : []),
    [allCompanies, scopedCompanyIds, companyId],
  );
  const selectableCompanyIds = useMemo(
    () => (allCompanies ? scopedCompanyIds : (companyId ? [companyId] : scopedCompanyIds)),
    [allCompanies, scopedCompanyIds, companyId],
  );
  const showCompanyPicker = selectableCompanyIds.length > 1;
  const primaryInviteCompanyId = inviteCompanyIds[0] ?? selectableCompanyIds[0] ?? companyId ?? '';
  const primaryDepartment = companyOrgById[primaryInviteCompanyId]?.department ?? '';
  const isSharedPayroll = useMemo(
    () => qualifiesForSharedPayroll({
      department: primaryDepartment,
      position: position.trim() || null,
      businessRole,
    }),
    [primaryDepartment, position, businessRole],
  );
  const sharedSalaryPreview = useMemo(() => {
    const amount = Math.round(Number(monthlySalary));
    if (!isSharedPayroll || !Number.isFinite(amount) || amount < 1 || companies.length < 2) return null;
    return {
      master: amount,
      perCompany: perCompanyShare(amount, companies.length),
      companyCount: companies.length,
    };
  }, [companies.length, isSharedPayroll, monthlySalary]);

  useEffect(() => {
    if (primaryInviteCompanyId && isSharedPayroll && !depositCollectionCompanyId) {
      setDepositCollectionCompanyId(primaryInviteCompanyId);
    }
  }, [depositCollectionCompanyId, isSharedPayroll, primaryInviteCompanyId]);
  const companyIdsKey = companyIds.join(',');
  const defaultInviteCompanyId = selectableCompanyIds[0] ?? '';
  const inviteCompanyIdsKey = inviteCompanyIds.join(',');

  function updateCompanyOrg(cid: string, patch: Partial<CompanyOrgSelection>) {
    setCompanyOrgById((prev) => ({
      ...prev,
      [cid]: {
        department: patch.department ?? prev[cid]?.department ?? '',
        teamId: patch.department !== undefined ? '' : (patch.teamId ?? prev[cid]?.teamId ?? ''),
      },
    }));
  }

  useEffect(() => {
    if (invitePerms.showNewMode && !invitePerms.showExistingMode) {
      setInviteMode('new');
    } else if (!invitePerms.showNewMode && invitePerms.showExistingMode) {
      setInviteMode('existing');
    }
  }, [invitePerms.showNewMode, invitePerms.showExistingMode]);

  useEffect(() => {
    if (!defaultInviteCompanyId) return;
    setInviteCompanyIds((prev) => (prev.length > 0 ? prev : [defaultInviteCompanyId]));
  }, [defaultInviteCompanyId]);

  const companyNameById = useMemo(
    () => new Map(companies.map((c) => [c.id, c.name])),
    [companies],
  );

  const loadCompanyInvites = useCallback(async (ids: string[]) => {
    if (!ids.length) {
      setCompanyInvites([]);
      return;
    }
    const results = await fetchForEachCompany(ids, listCompanyTelegramInvites);
    const merged = results.flatMap((row) => (row.result.items as unknown as CompanyInviteRow[]).map((item) => ({
      ...item,
      companyName: item.companyName ?? companyNameById.get(row.companyId) ?? null,
    })));
    merged.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    setCompanyInvites(merged);
  }, [companyNameById]);

  const load = useCallback(async () => {
    const ids = companyIdsKey ? companyIdsKey.split(',') : [];
    if (authLoading || !hasCompanyScope || !ids.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const employeeResults = await fetchForEachCompany(ids, async (cid) => {
        const res = await fetchEmployeeList({ companyId: cid });
        const label = companyNameById.get(cid) ?? cid;
        return res.items.map((e) => ({
          id: e.id,
          label: `${e.globalId} — ${e.firstName} ${e.lastName}${allCompanies ? ` (${label})` : ''}`,
          hasTelegram: Boolean(e.telegramLinked),
        }));
      });
      setEmployees(employeeResults.flatMap((row) => row.result));
      try {
        await loadCompanyInvites(ids);
      } catch (inviteErr) {
        console.warn('Failed to load company invites', inviteErr);
        setCompanyInvites([]);
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [authLoading, hasCompanyScope, companyIdsKey, companyNameById, allCompanies, loadCompanyInvites]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void fetch('/api/v1/health')
      .then((res) => res.json())
      .then((data: { telegram?: { botUsername?: string | null } }) => {
        const username = data.telegram?.botUsername?.trim();
        if (username) setBotUsername(username.replace(/^@/, ''));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setHistory([]);
      return;
    }
    void listEmployeeTelegramInvites(selectedId)
      .then((rows) => setHistory(rows as unknown as InviteRow[]))
      .catch(() => setHistory([]));
  }, [selectedId]);

  async function applyInviteResult(res: { inviteId: string; inviteLink: string; expiresAt: string }, effectiveMode: 'new' | 'existing') {
    setInviteLink(res.inviteLink);
    setExpiresAt(res.expiresAt);
    if (res.inviteId) {
      setFreshLinks((prev) => ({ ...prev, [res.inviteId]: res.inviteLink }));
    }
    void navigator.clipboard.writeText(res.inviteLink).then(() => setCopied(true)).catch(() => {});
    await loadCompanyInvites(companyIdsKey ? companyIdsKey.split(',') : []);
    if (effectiveMode === 'existing' && selectedId) {
      const rows = await listEmployeeTelegramInvites(selectedId);
      setHistory(rows as unknown as InviteRow[]);
    }
  }

  async function generateQuickInvite() {
    if (!primaryInviteCompanyId || inviteCompanyIds.length === 0) return;
    const additionalCompanyIds = inviteCompanyIds.slice(1);
    setGenerating(true);
    setCopied(false);
    setError(null);
    try {
      const res = await createQuickEmployeeTelegramInvite({
        companyId: primaryInviteCompanyId,
        additionalCompanyIds: additionalCompanyIds.length > 0 ? additionalCompanyIds : undefined,
      });
      await applyInviteResult(res, 'new');
    } catch (e) {
      setError(e);
    } finally {
      setGenerating(false);
    }
  }

  async function generateInvite() {
    if (!primaryInviteCompanyId || inviteCompanyIds.length === 0) return;
    const effectiveMode = invitePerms.showNewMode && (inviteMode === 'new' || !invitePerms.showExistingMode)
      ? 'new'
      : 'existing';
    if (effectiveMode === 'existing' && !selectedId) return;
    const additionalCompanyIds = inviteCompanyIds.slice(1);
    const companyAssignments = inviteCompanyIds.map((cid) => ({
      companyId: cid,
      department: companyOrgById[cid]?.department || undefined,
      teamId: companyOrgById[cid]?.teamId || undefined,
    }));
    const primaryOrg = companyOrgById[primaryInviteCompanyId];
    setGenerating(true);
    setCopied(false);
    setError(null);
    try {
      const res = effectiveMode === 'existing'
        ? await createTelegramInvite(selectedId, primaryInviteCompanyId)
        : await createNewEmployeeTelegramInvite({
          companyId: primaryInviteCompanyId,
          additionalCompanyIds: additionalCompanyIds.length > 0 ? additionalCompanyIds : undefined,
          companyAssignments,
          businessRole,
          employmentType,
          startDate,
          department: primaryOrg?.department || undefined,
          teamId: primaryOrg?.teamId || undefined,
          position: position.trim() || undefined,
          monthlySalary: monthlySalary ? Math.round(Number(monthlySalary)) : undefined,
          depositCollectionCompanyId: isSharedPayroll
            ? (depositCollectionCompanyId || primaryInviteCompanyId)
            : undefined,
        });
      await applyInviteResult(res, effectiveMode);
    } catch (e) {
      setError(e);
    } finally {
      setGenerating(false);
    }
  }

  function copyLink(link?: string) {
    const target = link ?? inviteLink;
    if (!target) return;
    void navigator.clipboard.writeText(target);
    setCopied(true);
  }

  async function copyInviteLink(row: CompanyInviteRow) {
    const link = freshLinks[row.id];
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiedInviteId(row.id);
    setTimeout(() => setCopiedInviteId(null), 2000);
  }

  async function handleRegenerate(inviteId: string) {
    setActingInviteId(inviteId);
    try {
      const res = await regenerateTelegramInvite(inviteId);
      setFreshLinks((prev) => ({ ...prev, [res.inviteId]: res.inviteLink }));
      setInviteLink(res.inviteLink);
      setExpiresAt(res.expiresAt);
      await loadCompanyInvites(companyIdsKey ? companyIdsKey.split(',') : []);
    } catch (e) {
      setError(e);
    } finally {
      setActingInviteId(null);
    }
  }

  async function handleCancel(inviteId: string) {
    if (!window.confirm('ยกเลิกลิงก์เชิญนี้? พนักงานจะไม่สามารถเริ่มลงทะเบียนผ่านลิงก์นี้ได้')) return;
    setActingInviteId(inviteId);
    try {
      await cancelTelegramInvite(inviteId);
      await loadCompanyInvites(companyIdsKey ? companyIdsKey.split(',') : []);
    } catch (e) {
      setError(e);
    } finally {
      setActingInviteId(null);
    }
  }

  async function openDetail(inviteId: string) {
    setActingInviteId(inviteId);
    try {
      const detail = await getTelegramInviteDetail(inviteId);
      setDetailData(detail);
      setDetailOpen(true);
    } catch (e) {
      setError(e);
    } finally {
      setActingInviteId(null);
    }
  }

  async function handleApprove(submissionId: string) {
    if (!window.confirm('อนุมัติข้อมูลพนักงานและเชื่อม Telegram?')) return;
    setActingInviteId(submissionId);
    try {
      await approveSelfOnboarding(submissionId);
      await loadCompanyInvites(companyIdsKey ? companyIdsKey.split(',') : []);
      if (detailOpen) setDetailOpen(false);
    } catch (e) {
      setError(e);
    } finally {
      setActingInviteId(null);
    }
  }

  async function handleReject(submissionId: string) {
    const reason = window.prompt('เหตุผลที่ไม่อนุมัติ (ไม่บังคับ)') ?? 'ไม่อนุมัติ';
    if (reason === null) return;
    setActingInviteId(submissionId);
    try {
      await rejectSelfOnboarding(submissionId, reason);
      await loadCompanyInvites(companyIdsKey ? companyIdsKey.split(',') : []);
      if (detailOpen) setDetailOpen(false);
    } catch (e) {
      setError(e);
    } finally {
      setActingInviteId(null);
    }
  }

  const displayBotUsername = botUsername || '…';
  const telegramShareUrl = inviteLink
    ? `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('ลิงก์เชิญเข้าระบบ WorkHQ')}`
    : '';

  const pageState = authLoading
    ? 'loading' as const
    : !canInvite
    ? 'permissionDenied' as const
    : !hasCompanyScope
      ? 'empty' as const
      : loading
        ? 'loading' as const
        : error && !employees.length
          ? 'error' as const
          : 'success' as const;

  const referenceCode = error instanceof ApiError ? error.requestId : undefined;

  return (
    <AppPageLayout
      breadcrumb={[
        { label: 'พนักงาน', href: '/hr/employees' },
        { label: 'เชิญพนักงาน' },
      ]}
      title="🔗 เชิญพนักงานด้วยลิงก์ Telegram"
      description="สร้างลิงก์เชิญครั้งเดียว — พนักงานกดลิงก์แล้วกรอกข้อมูลเองได้"
      primaryAction={<WorkHQButton to="/hr/employees/new" variant="secondary">+ เพิ่มพนักงาน</WorkHQButton>}
    >
      <WorkHQPageState
        state={pageState}
        permissionDenied={(
          <WorkHQPermissionDenied
            title="ไม่มีสิทธิ์ดูลิงก์เชิญพนักงาน"
            description="ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์ employee:onboarding:invite:view"
          />
        )}
        empty={(
          <WorkHQEmptyState icon="🏢" title="เลือกบริษัท" description="เลือกบริษัทก่อนสร้างลิงก์เชิญ" />
        )}
        error={<WorkHQErrorState referenceCode={referenceCode} onRetry={() => void load()} />}
      >
        <div className="whq-invite-quick-steps">
          <div className="whq-invite-quick-step">
            <strong>1</strong>
            สร้างลิงก์เชิญ
          </div>
          <div className="whq-invite-quick-step">
            <strong>2</strong>
            ส่งให้พนักงานใน Telegram
          </div>
          <div className="whq-invite-quick-step">
            <strong>3</strong>
            พนักงานกดลิงก์และกรอกข้อมูล
          </div>
          <div className="whq-invite-quick-step">
            <strong>4</strong>
            HR อนุมัติ → เชื่อมสำเร็จ
          </div>
        </div>

        <p className="whq-muted" style={{ marginBottom: '1rem' }}>
          ลิงก์เชิญใช้รูปแบบ <code>https://t.me/{displayBotUsername}?start=invite_…</code>
          {' '}· หมดอายุ 7 วัน · ใช้ครั้งเดียว · ไม่ต้องจำรหัสพนักงาน
        </p>

        <WorkHQCard title="สร้างลิงก์เชิญพนักงานใหม่">
          {canCreateInvite ? (
            <>
          {showCompanyPicker && (
            <WorkHQField label="บริษัท">
              <p className="whq-muted whq-text-sm whq-mb-sm">ติ๊กได้มากกว่า 1 บริษัท ถ้าพนักงานทำงานหลายบริษัท — บริษัทแรกที่เลือกจะเป็นบริษัทหลัก</p>
              <div className="whq-checkbox-group">
                {selectableCompanyIds.map((cid) => {
                  const c = companies.find((row) => row.id === cid);
                  return (
                    <label key={cid} className="whq-checkbox-row">
                      <input
                        type="checkbox"
                        checked={inviteCompanyIds.includes(cid)}
                        onChange={(e) => {
                          setInviteCompanyIds((prev) => {
                            if (e.target.checked) return [...prev, cid];
                            const next = prev.filter((id) => id !== cid);
                            return next.length > 0 ? next : prev;
                          });
                        }}
                      />
                      <span>{c ? `${c.name} (${c.code})` : cid}</span>
                    </label>
                  );
                })}
              </div>
            </WorkHQField>
          )}
          {invitePerms.showNewMode ? (
            <p className="whq-muted">
              ส่งลิงก์ให้พนักงานใหม่ — พนักงานกรอกข้อมูลส่วนตัว แผนก ทีม ตำแหน่ง เองใน Telegram
            </p>
          ) : (
            <p className="whq-muted">โหมด: พนักงานเดิม (เชื่อม Telegram)</p>
          )}

          {(invitePerms.showNewMode && (inviteMode === 'new' || !invitePerms.showExistingMode)) ? (
            <>
              {canCreateInvite && (
                <div className="whq-quick-actions" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                  <WorkHQButton
                    type="button"
                    variant="primary"
                    disabled={(showCompanyPicker && inviteCompanyIds.length === 0) || generating}
                    onClick={() => void generateQuickInvite()}
                  >
                    {generating ? 'กำลังสร้าง…' : 'สร้างลิงก์เลย'}
                  </WorkHQButton>
                </div>
              )}
              <p className="whq-muted whq-text-sm" style={{ marginBottom: '1rem' }}>
                ไม่ต้องกรอกแผนก/ทีม/เงินเดือนก่อน — พนักงานจะระบุเองตอนลงทะเบียนใน Telegram
              </p>

              <details className="whq-invite-advanced">
                <summary className="whq-muted" style={{ cursor: 'pointer', marginBottom: '0.75rem' }}>
                  ตั้งค่าล่วงหน้า (ไม่บังคับ) — บทบาท แผนก เงินเดือน ฯลฯ
                </summary>
              <WorkHQField label="บทบาท">
                <WorkHQSelect value={businessRole} onChange={(e) => setBusinessRole(e.target.value)}>
                  <option value="employee">พนักงาน</option>
                  <option value="secretary">เลขา / HR</option>
                  <option value="sub_leader">หัวหน้าทีม</option>
                  <option value="big_leader">หัวหน้าใหญ่</option>
                </WorkHQSelect>
              </WorkHQField>
              <EmployeePerCompanyOrgFields
                companyIds={inviteCompanyIds}
                companies={companies}
                value={companyOrgById}
                onChange={updateCompanyOrg}
              />
              <WorkHQField label="ประเภทการจ้าง">
                <WorkHQSelect value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                  <option value="full_time">ประจำ</option>
                  <option value="part_time">พาร์ทไทม์</option>
                  <option value="probation">ทดลองงาน</option>
                </WorkHQSelect>
                <p className="whq-field-hint">
                  ประจำ/พาร์ทไทม์ = สถานะ &quot;ทำงานอยู่&quot; · ทดลองงาน = อยู่ช่วงทดลอง 90 วัน
                </p>
              </WorkHQField>
              <WorkHQField label="วันเริ่มงาน">
                <WorkHQDateInput className="whq-input" value={startDate} onChange={setStartDate} />
              </WorkHQField>
              <WorkHQField label="ตำแหน่ง (ถ้ามี)">
                <input
                  className="whq-input"
                  value={position}
                  placeholder="เช่น Telesales, HR Officer"
                  onChange={(e) => setPosition(e.target.value)}
                />
              </WorkHQField>
              <WorkHQField label={isSharedPayroll ? th.addEmployee.sharedMonthlySalary : th.addEmployee.monthlySalary}>
                <input
                  className="whq-input"
                  type="number"
                  min={1}
                  placeholder="เช่น 15000"
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(e.target.value)}
                />
                {sharedSalaryPreview && (
                  <p className="whq-muted whq-text-sm whq-mt-sm">
                    {th.addEmployee.sharedMonthlySalaryHint(
                      sharedSalaryPreview.master,
                      sharedSalaryPreview.perCompany,
                      sharedSalaryPreview.companyCount,
                    )}
                  </p>
                )}
                {!isSharedPayroll && (
                  <p className="whq-muted whq-text-sm whq-mt-sm">{th.addEmployee.monthlySalaryHint}</p>
                )}
              </WorkHQField>
              {isSharedPayroll && (
                <WorkHQField label={th.addEmployee.depositCollectionCompany}>
                  <WorkHQSelect
                    value={depositCollectionCompanyId || primaryInviteCompanyId}
                    onChange={(e) => setDepositCollectionCompanyId(e.target.value)}
                  >
                    {inviteCompanyIds.map((cid) => {
                      const c = companies.find((row) => row.id === cid);
                      return (
                        <option key={cid} value={cid}>
                          {c ? `${c.name} (${c.code})` : cid}
                        </option>
                      );
                    })}
                  </WorkHQSelect>
                  <p className="whq-muted whq-text-sm whq-mt-sm">{th.addEmployee.depositCollectionCompanyHint}</p>
                </WorkHQField>
              )}
              {canCreateInvite && (
                <div className="whq-quick-actions" style={{ marginTop: '1rem' }}>
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    disabled={(showCompanyPicker && inviteCompanyIds.length === 0) || generating}
                    onClick={() => void generateInvite()}
                  >
                    {generating ? 'กำลังสร้าง…' : 'สร้างลิงก์พร้อมตั้งค่าล่วงหน้า'}
                  </WorkHQButton>
                </div>
              )}
              </details>
            </>
          ) : (invitePerms.showExistingMode && (inviteMode === 'existing' || !invitePerms.showNewMode)) ? (
            <WorkHQField label="เลือกพนักงาน">
              <WorkHQSelect value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">— เลือกพนักงาน —</option>
                {employees.filter((e) => !/placeholder/i.test(e.label)).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}{e.hasTelegram ? ' ✓ เชื่อมแล้ว' : ''}
                  </option>
                ))}
              </WorkHQSelect>
            </WorkHQField>
          ) : null}

          {invitePerms.showNewMode && invitePerms.showExistingMode && (
            <details className="whq-invite-advanced">
              <summary className="whq-muted" style={{ cursor: 'pointer' }}>
                ตัวเลือกเพิ่มเติม — เชิญพนักงานที่มีในระบบแล้ว
              </summary>
              <WorkHQField label="ประเภทการเชิญ">
                <WorkHQSelect value={inviteMode} onChange={(e) => setInviteMode(e.target.value as 'new' | 'existing')}>
                  <option value="new">พนักงานใหม่ (ยังไม่มีในระบบ)</option>
                  <option value="existing">พนักงานที่มีอยู่แล้ว (เชื่อม Telegram)</option>
                </WorkHQSelect>
              </WorkHQField>
            </details>
          )}

          {canCreateInvite && (inviteMode === 'existing' || !invitePerms.showNewMode) && (
          <div className="whq-quick-actions" style={{ marginTop: '1rem' }}>
            <WorkHQButton
              type="button"
              variant="primary"
              disabled={
                (showCompanyPicker && inviteCompanyIds.length === 0)
                || !selectedId
                || generating
              }
              onClick={() => void generateInvite()}
            >
              {generating ? 'กำลังสร้าง…' : 'สร้างและคัดลอกลิงก์'}
            </WorkHQButton>
            {selectedId && (
              <WorkHQButton to={`/hr/employees/${selectedId}`} variant="secondary">
                ดูโปรไฟล์
              </WorkHQButton>
            )}
          </div>
          )}

          {inviteLink && (
            <>
              <div className="whq-invite-link-box">{inviteLink.replace(/^https:\/\//, '')}</div>
              <p className="whq-muted">
                หมดอายุ: {expiresAt ? new Date(expiresAt).toLocaleString('th-TH') : '—'}
                {' · '}คัดลอกและส่งให้พนักงานทันที
              </p>
              <div className="whq-quick-actions">
                <WorkHQButton type="button" variant="primary" onClick={() => copyLink()}>
                  {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
                </WorkHQButton>
                {telegramShareUrl && (
                  <a href={telegramShareUrl} className="whq-btn whq-btn-secondary" target="_blank" rel="noreferrer">
                    แชร์ผ่าน Telegram
                  </a>
                )}
              </div>
            </>
          )}
            </>
          ) : (
            <p className="whq-muted">ไม่มีสิทธิ์สร้างลิงก์เชิญ — ต้องมีสิทธิ์สร้างและสิทธิ์เชิญพนักงานใหม่หรือเชื่อมพนักงานเดิม</p>
          )}
        </WorkHQCard>

        <WorkHQCard title="จัดการลิงก์เชิญทั้งหมด" className="whq-detail-card">
          {companyInvites.length === 0 ? (
            <WorkHQEmptyState icon="📭" title="ยังไม่มีลิงก์เชิญ" description="สร้างลิงก์เชิญใหม่ด้านบน" />
          ) : (
            <div className="whq-table-wrap">
              <table className="whq-table whq-invite-table">
                <thead>
                  <tr>
                    <th>สร้างเมื่อ</th>
                    <th>ผู้ถูกเชิญ</th>
                    {allCompanies && <th>บริษัท</th>}
                    <th>สถานะ</th>
                    <th>หมดอายุ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {companyInvites.map((row) => {
                    const hasFreshLink = Boolean(freshLinks[row.id]);
                    const canAct = ['pending', 'started'].includes(row.status)
                      || Boolean(row.canRegenerate);
                    const busy = actingInviteId === row.id
                      || actingInviteId === row.submissionId;
                    return (
                      <tr key={row.id}>
                        <td className="whq-invite-col-date">{fmtDateShort(row.createdAt)}</td>
                        <td className="whq-invite-col-subject">
                          <strong>{inviteSubjectLine(row)}</strong>
                          <span className="whq-invite-meta">{inviteMetaLine(row)}</span>
                          {row.submittedAt && (
                            <span className="whq-invite-meta">ส่งข้อมูล {fmtDateShort(row.submittedAt)}</span>
                          )}
                        </td>
                        {allCompanies && <td>{row.companyName ?? '—'}</td>}
                        <td>
                          <WorkHQBadge status={row.status} label={INVITE_STATUS_TH[row.status] ?? row.status} />
                        </td>
                        <td className="whq-invite-col-date">{fmtDateShort(row.expiresAt)}</td>
                        <td className="whq-invite-col-actions">
                          <div className="whq-invite-actions">
                            {(invitePerms.canView || invitePerms.canManage) && (
                              <WorkHQButton
                                type="button"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => void openDetail(row.id)}
                              >
                                รายละเอียด
                              </WorkHQButton>
                            )}
                            {row.canApprove && row.submissionId && (
                              <>
                                <WorkHQButton
                                  type="button"
                                  variant="primary"
                                  disabled={busy}
                                  onClick={() => void handleApprove(row.submissionId!)}
                                >
                                  อนุมัติ
                                </WorkHQButton>
                                <WorkHQButton
                                  type="button"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => void handleReject(row.submissionId!)}
                                >
                                  ปฏิเสธ
                                </WorkHQButton>
                              </>
                            )}
                            {hasFreshLink && (
                              <WorkHQButton
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void copyInviteLink(row)}
                              >
                                {copiedInviteId === row.id ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
                              </WorkHQButton>
                            )}
                            {canAct && invitePerms.canRegenerate && (
                              <WorkHQButton
                                type="button"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void handleRegenerate(row.id)}
                              >
                                {row.status === 'cancelled' ? 'ลิงก์ใหม่' : 'Regenerate'}
                              </WorkHQButton>
                            )}
                            {canAct && invitePerms.canCancel && (
                              <WorkHQButton
                                type="button"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => void handleCancel(row.id)}
                              >
                                ยกเลิก
                              </WorkHQButton>
                            )}
                          </div>
                          {!hasFreshLink && canAct && row.copyLinkHint && (
                            <p className="whq-invite-actions-hint">{row.copyLinkHint}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </WorkHQCard>

        {inviteMode === 'existing' && (
          <WorkHQCard title="ประวัติลิงก์เชิญ (พนักงานที่เลือก)" className="whq-detail-card">
            {history.length === 0 ? (
              <WorkHQEmptyState icon="📭" title="ยังไม่มีประวัติ" description="เลือกพนักงานและสร้างลิงก์เชิญ" />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>รหัสย่อ</th>
                    <th>สถานะ</th>
                    <th>หมดอายุ</th>
                    <th>สร้างเมื่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id}>
                      <td><code>{row.tokenPreview ?? '—'}</code></td>
                      <td><WorkHQBadge status={row.status} label={INVITE_STATUS_TH[row.status] ?? row.status} /></td>
                      <td>{fmtDate(row.expiresAt)}</td>
                      <td>{fmtDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </WorkHQCard>
        )}

        {detailOpen && detailData && (
          <div className="whq-modal-backdrop" role="dialog" aria-modal="true">
            <div className="whq-modal whq-card" style={{ maxWidth: 560 }}>
              <h3>รายละเอียดลิงก์เชิญ</h3>
              <p>สถานะ: {INVITE_STATUS_TH[String(detailData.status)] ?? String(detailData.status)}</p>
              <p>ประเภท: {detailData.inviteType === 'new_employee' ? 'พนักงานใหม่' : 'พนักงานเดิม'}</p>
              {detailData.company && typeof detailData.company === 'object' ? (
                <p>บริษัท: {String((detailData.company as { name?: string }).name ?? '—')}</p>
              ) : null}
              {detailData.departmentName ? <p>แผนก: {String(detailData.departmentName)}</p> : null}
              {detailData.teamName ? <p>ทีม: {String(detailData.teamName)}</p> : null}
              {detailData.businessRole ? <p>บทบาท: {String(detailData.businessRole)}</p> : null}
              <div style={{ marginTop: '0.75rem' }}>
                <strong>ขั้นตอน</strong>
                <ul>
                  {INVITE_FLOW_STEPS.map((step) => (
                    <li key={step.key} style={{
                      opacity: String(detailData.status) === step.key ? 1 : 0.5,
                      fontWeight: String(detailData.status) === step.key ? 600 : 400,
                    }}>
                      {step.label}
                    </li>
                  ))}
                </ul>
              </div>
              {detailData.copyLinkHint ? (
                <p className="whq-muted">{String(detailData.copyLinkHint)}</p>
              ) : null}
              {detailData.submission && typeof detailData.submission === 'object' ? (
                <div style={{ marginTop: '1rem' }}>
                  <strong>ข้อมูลที่ส่ง</strong>
                  <p className="whq-muted">
                    สถานะ: {String((detailData.submission as Record<string, unknown>).status ?? '—')}
                  </p>
                  <ul>
                    {Object.entries(
                      (detailData.submission as Record<string, unknown>).submittedDataJson as Record<string, unknown> ?? {},
                    )
                      .filter(([key]) => key !== 'employmentDeclaration')
                      .map(([key, value]) => (
                      <li key={key}>
                        {SUBMISSION_FIELD_TH[key] ?? key}: {typeof value === 'string' ? value : JSON.stringify(value)}
                      </li>
                    ))}
                  </ul>
                  {(() => {
                    const decl = (
                      (detailData.submission as Record<string, unknown>).submittedDataJson as Record<string, unknown> | undefined
                    )?.employmentDeclaration as Record<string, unknown> | undefined;
                    if (!decl || !Object.keys(decl).length) return null;
                    const companyTeams = decl.companyTeams as Array<Record<string, unknown>> | undefined;
                    return (
                      <div style={{ marginTop: '0.75rem' }}>
                        <strong>ข้อมูลการทำงาน (ที่พนักงานระบุ)</strong>
                        <ul>
                          {decl.declaredDepartment ? (
                            <li>แผนก: {String(decl.declaredDepartment)}</li>
                          ) : null}
                          {decl.declaredPosition ? (
                            <li>ตำแหน่ง: {formatEmploymentValue('declaredPosition', decl.declaredPosition)}</li>
                          ) : null}
                          {companyTeams?.length ? companyTeams.map((row) => (
                            <li key={String(row.companyId)}>
                              {String(row.companyName)} — ทีม:{' '}
                              {row.teamSkipped
                                ? 'ไม่ระบุ'
                                : formatEmploymentValue('declaredTeamName', row.teamName)}
                            </li>
                          )) : null}
                          {decl.declaredWorkLocation ? (
                            <li>ทำงานที่: {formatEmploymentValue('declaredWorkLocation', decl.declaredWorkLocation)}</li>
                          ) : null}
                          {decl.declaredOfficeType ? (
                            <li>ค่าคอมแอดมิน: {formatEmploymentValue('declaredOfficeType', decl.declaredOfficeType)}</li>
                          ) : null}
                        </ul>
                      </div>
                    );
                  })()}
                  {(detailData.submission as Record<string, unknown>).status === 'submitted' && (
                    <div className="whq-quick-actions" style={{ marginTop: '0.75rem' }}>
                      <WorkHQButton
                        type="button"
                        variant="primary"
                        disabled={actingInviteId !== null}
                        onClick={() => void handleApprove(String((detailData.submission as Record<string, unknown>).id))}
                      >
                        อนุมัติและเชื่อม Telegram
                      </WorkHQButton>
                      <WorkHQButton
                        type="button"
                        variant="ghost"
                        disabled={actingInviteId !== null}
                        onClick={() => void handleReject(String((detailData.submission as Record<string, unknown>).id))}
                      >
                        ปฏิเสธ
                      </WorkHQButton>
                    </div>
                  )}
                </div>
              ) : null}
              <div className="whq-modal-actions">
                <WorkHQButton variant="ghost" onClick={() => { setDetailOpen(false); setDetailData(null); }}>
                  ปิด
                </WorkHQButton>
              </div>
            </div>
          </div>
        )}
      </WorkHQPageState>
    </AppPageLayout>
  );
}
