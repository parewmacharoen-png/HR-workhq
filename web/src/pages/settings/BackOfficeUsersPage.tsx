import { FormEvent, Fragment, useEffect, useMemo, useState } from 'react';
import {
  BACKOFFICE_ROLE_LABELS,
  BackofficeUserDetail,
  BackofficeUserRow,
  createBackofficeUser,
  createOperatorTelegramLink,
  getBackofficeAccessMatrix,
  getBackofficeUser,
  getOperatorTelegramLink,
  listBackofficeUsers,
  revokeOperatorTelegramLink,
  saveBackofficePermissions,
  updateBackofficeUser,
} from '../../api/backoffice-users';
import { WorkHQButton, WorkHQField, WorkHQPasswordInput, WorkHQSelect, generateRandomPassword } from '../../components/ui';
import { BACKOFFICE_PERMISSION_SECTIONS } from '../../constants/backoffice-permission-sections';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../../context/AuthContext';
import {
  AppPageLayout,
  WorkHQPageState,
  WorkHQPermissionDenied,
} from '../../components/workhq';

const STAFF_ROLES = ['owner', 'secretary', 'big_leader', 'sub_leader', 'admin_manager', 'admin'] as const;

function roleBadgeClass(role: string | null) {
  switch (role) {
    case 'owner': return 'whq-bo-role whq-bo-role--owner';
    case 'secretary': return 'whq-bo-role whq-bo-role--secretary';
    case 'big_leader': return 'whq-bo-role whq-bo-role--leader';
    case 'admin_manager': return 'whq-bo-role whq-bo-role--admin';
    default: return 'whq-bo-role';
  }
}

function telegramStatusLabel(status?: BackofficeUserRow['telegramStatus']) {
  switch (status) {
    case 'LINKED': return 'เชื่อมแล้ว';
    case 'PENDING': return 'รอเปิดลิงก์';
    case 'EXPIRED': return 'ลิงก์หมดอายุ';
    default: return 'ยังไม่เชื่อม';
  }
}

interface TelegramLinkModalProps {
  user: BackofficeUserRow;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}

function TelegramLinkModal({ user, canWrite, onClose, onChanged }: TelegramLinkModalProps) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [status, setStatus] = useState<BackofficeUserRow['telegramStatus']>('NONE');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [linkedAt, setLinkedAt] = useState<string | null>(null);
  const [telegramUsername, setTelegramUsername] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const info = await getOperatorTelegramLink(user.id);
        if (cancelled) return;
        setStatus(info.status);
        setDeepLink(info.deepLink);
        setExpiresAt(info.expiresAt);
        setLinkedAt(info.linkedAt);
        setTelegramUsername(info.telegramUsername);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'โหลดสถานะไม่สำเร็จ');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user.id]);

  async function generateLink() {
    if (!canWrite) return;
    setBusy(true);
    setError('');
    try {
      const result = await createOperatorTelegramLink(user.id);
      setDeepLink(result.deepLink);
      setStatus('PENDING');
      setExpiresAt(result.expiresAt);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างลิงก์ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  async function revokeLink() {
    if (!canWrite || !window.confirm('ยกเลิกการเชื่อม Telegram ของผู้ใช้นี้?')) return;
    setBusy(true);
    setError('');
    try {
      await revokeOperatorTelegramLink(user.id);
      setDeepLink(null);
      setStatus('NONE');
      setExpiresAt(null);
      setLinkedAt(null);
      setTelegramUsername(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ยกเลิกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="whq-modal-backdrop" role="dialog" aria-modal="true">
      <div className="whq-modal whq-card">
        <h3>เชื่อม Telegram — {user.displayName}</h3>
        <p className="whq-muted">
          สำหรับเจ้าของ / เลขา / หัวหน้า — ดูรายงาน อนุมัติคำขอ ปฏิทิน และคุยกับ AI ผ่าน Telegram
          โดยไม่ต้องมีข้อมูลพนักงาน
        </p>
        {loading ? (
          <LoadingState />
        ) : (
          <div className="whq-form-stack">
            <p>
              สถานะ: <strong>{telegramStatusLabel(status)}</strong>
              {telegramUsername ? ` (@${telegramUsername})` : ''}
            </p>
            {linkedAt && <p className="whq-muted">เชื่อมเมื่อ: {formatThaiDate(linkedAt)}</p>}
            {expiresAt && status === 'PENDING' && (
              <p className="whq-muted">ลิงก์หมดอายุ: {formatThaiDate(expiresAt)}</p>
            )}
            {deepLink && status === 'PENDING' && (
              <WorkHQField label="ลิงก์เชื่อม (ส่งให้ผู้ใช้เปิดใน Telegram)">
                <input readOnly value={deepLink} onFocus={(e) => e.target.select()} />
              </WorkHQField>
            )}
            {error && <p className="whq-error-text">{error}</p>}
          </div>
        )}
        <div className="whq-modal-actions">
          <WorkHQButton type="button" variant="secondary" onClick={onClose}>ปิด</WorkHQButton>
          {canWrite && status === 'LINKED' && (
            <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={() => void revokeLink()}>
              ยกเลิกการเชื่อม
            </WorkHQButton>
          )}
          {canWrite && status !== 'LINKED' && (
            <WorkHQButton type="button" variant="primary" disabled={busy || loading} onClick={() => void generateLink()}>
              {busy ? 'กำลังสร้าง…' : deepLink ? 'สร้างลิงก์ใหม่' : 'สร้างลิงก์ Telegram'}
            </WorkHQButton>
          )}
        </div>
      </div>
    </div>
  );
}

function formatThaiDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface PermissionModalProps {
  userId: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function PermissionModal({ userId, canWrite, onClose, onSaved }: PermissionModalProps) {
  const [detail, setDetail] = useState<BackofficeUserDetail | null>(null);
  const [rolePresets, setRolePresets] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [role, setRole] = useState('admin');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState<'all' | 'on' | 'off'>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [row, matrix] = await Promise.all([
          getBackofficeUser(userId),
          getBackofficeAccessMatrix(),
        ]);
        if (cancelled) return;
        setDetail(row);
        setRolePresets(matrix.rolePresets);
        setRole(row.businessRole ?? 'admin');
        setSelected(new Set(row.grantedPermissions));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  function togglePermission(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleModule(modId: string, on: boolean) {
    const mod = detail?.modules.find((m) => m.id === modId);
    if (!mod) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of mod.items) {
        if (on) next.add(item.permission);
        else next.delete(item.permission);
      }
      return next;
    });
  }

  function toggleSection(moduleIds: string[], on: boolean) {
    if (!detail) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const modId of moduleIds) {
        const mod = detail.modules.find((m) => m.id === modId);
        if (!mod) continue;
        for (const item of mod.items) {
          if (on) next.add(item.permission);
          else next.delete(item.permission);
        }
      }
      return next;
    });
  }

  function applyRolePreset() {
    const preset = rolePresets[role] ?? [];
    setSelected(new Set(preset));
  }

  function selectAll(on: boolean) {
    if (!detail) return;
    if (!on) {
      setSelected(new Set());
      return;
    }
    const all = detail.modules.flatMap((m) => m.items.map((i) => i.permission));
    setSelected(new Set(all));
  }

  async function save() {
    setSaving(true);
    try {
      await saveBackofficePermissions(userId, {
        businessRole: role,
        permissions: [...selected],
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = selected.size;
  const totalCount = detail?.modules.reduce((n, m) => n + m.items.length, 0) ?? 0;
  const searchLower = search.trim().toLowerCase();

  function matchesSearch(mod: NonNullable<typeof detail>['modules'][number], item: typeof mod.items[number]) {
    if (!searchLower) return true;
    const hay = [
      mod.label,
      mod.id,
      item.label,
      item.permission,
      item.description ?? '',
      item.menuHint ?? '',
    ].join(' ').toLowerCase();
    return hay.includes(searchLower);
  }

  function matchesFilter(on: boolean) {
    if (showFilter === 'all') return true;
    if (showFilter === 'on') return on;
    return !on;
  }

  function moduleStatus(mod: NonNullable<typeof detail>['modules'][number]) {
    const onCount = mod.items.filter((i) => selected.has(i.permission)).length;
    if (onCount === 0) return 'off' as const;
    if (onCount === mod.items.length) return 'on' as const;
    return 'partial' as const;
  }

  function sectionStatus(moduleIds: string[]) {
    if (!detail) return 'off' as const;
    let on = 0;
    let total = 0;
    for (const modId of moduleIds) {
      const mod = detail.modules.find((m) => m.id === modId);
      if (!mod) continue;
      total += mod.items.length;
      on += mod.items.filter((i) => selected.has(i.permission)).length;
    }
    if (on === 0) return 'off' as const;
    if (on === total) return 'on' as const;
    return 'partial' as const;
  }

  const sections = useMemo(() => {
    if (!detail) return [];
    const byId = new Map(detail.modules.map((m) => [m.id, m]));
    return BACKOFFICE_PERMISSION_SECTIONS.map((section) => ({
      ...section,
      modules: section.moduleIds
        .map((id) => byId.get(id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    })).filter((s) => s.modules.length > 0);
  }, [detail]);

  const visibleRowCount = useMemo(() => {
    if (!detail) return 0;
    let n = 0;
    for (const section of sections) {
      for (const mod of section.modules) {
        for (const item of mod.items) {
          const on = selected.has(item.permission);
          if (matchesSearch(mod, item) && matchesFilter(on)) n += 1;
        }
      }
    }
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchLower/showFilter drive filter
  }, [detail, sections, selected, searchLower, showFilter]);

  return (
    <div className="whq-modal-backdrop" role="dialog" aria-modal="true">
      <div className="whq-modal whq-card whq-bo-perm-modal">
        <button type="button" className="whq-modal-close" onClick={onClose} aria-label="ปิด">×</button>
        <div className="whq-modal-head whq-bo-perm-head">
          <div>
            <h3>แก้ไขสิทธิ์ — {detail?.displayName ?? detail?.username ?? '…'}</h3>
            <p className="whq-muted whq-bo-perm-lead">
              ติ๊กเลือกทีละรายการว่าผู้ใช้คนนี้ <strong>เห็นเมนูไหน</strong> และ <strong>ทำอะไรได้บ้าง</strong>
            </p>
          </div>
          {!loading && detail && (
            <div className="whq-bo-perm-summary-badge" aria-live="polite">
              เปิด <strong>{enabledCount}</strong> / {totalCount} รายการ
            </div>
          )}
        </div>

        {loading && <LoadingState />}
        {error != null ? <ErrorState error={error} /> : null}
        {!loading && detail && (
          <>
            <div className="whq-bo-perm-role-box">
              <div className="whq-bo-perm-role-main">
                <p className="whq-bo-perm-step">ขั้นที่ 1 — เลือกบทบาท (ตั้งค่าเริ่มต้น)</p>
                <WorkHQField label="บทบาทหลัก">
                  <WorkHQSelect
                    value={role}
                    disabled={!canWrite}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>{BACKOFFICE_ROLE_LABELS[r] ?? r}</option>
                    ))}
                  </WorkHQSelect>
                </WorkHQField>
                <p className="whq-muted whq-bo-perm-role-hint">
                  กด &quot;ใช้สิทธิ์ตามบทบาท&quot; เพื่อตั้งค่าเริ่มต้น แล้วปรับรายละเอียดในตารางด้านล่างทีละบรรทัด
                </p>
              </div>
              {canWrite && (
                <div className="whq-bo-perm-role-actions">
                  <WorkHQButton type="button" variant="primary" onClick={applyRolePreset}>
                    ใช้สิทธิ์ตามบทบาท
                  </WorkHQButton>
                  <WorkHQButton type="button" variant="ghost" onClick={() => selectAll(true)}>
                    เปิดทั้งหมด
                  </WorkHQButton>
                  <WorkHQButton type="button" variant="ghost" onClick={() => selectAll(false)}>
                    ปิดทั้งหมด
                  </WorkHQButton>
                </div>
              )}
            </div>

            <div className="whq-bo-perm-toolbar">
              <p className="whq-bo-perm-step whq-bo-perm-step--inline">ขั้นที่ 2 — เลือกสิทธิ์ทีละรายการ</p>
              <div className="whq-bo-perm-toolbar-row">
                <input
                  type="search"
                  className="whq-bo-perm-search"
                  placeholder="ค้นหา เช่น เงินเดือน, อนุมัติ, Telegram…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="ค้นหาสิทธิ์"
                />
                <div className="whq-bo-perm-filter" role="group" aria-label="กรองสิทธิ์">
                  {([
                    ['all', 'ทั้งหมด'],
                    ['on', 'เปิดอยู่'],
                    ['off', 'ปิดอยู่'],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`whq-bo-perm-filter-btn${showFilter === key ? ' is-active' : ''}`}
                      onClick={() => setShowFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="whq-muted whq-bo-perm-visible-count">
                  แสดง {visibleRowCount} รายการ
                </span>
              </div>
            </div>

            <div className="whq-bo-perm-body">
              <table className="whq-bo-perm-table">
                <thead>
                  <tr>
                    <th scope="col" className="whq-bo-perm-col-check">เปิด</th>
                    <th scope="col">หมวด / กลุ่ม</th>
                    <th scope="col">สิทธิ์</th>
                    <th scope="col">ทำอะไรได้</th>
                    <th scope="col">เมนูที่เกี่ยวข้อง</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => {
                    const secStatus = sectionStatus(section.moduleIds);
                    const secOn = secStatus === 'on';
                    const secPartial = secStatus === 'partial';
                    const sectionRows = section.modules.flatMap((mod) =>
                      mod.items
                        .filter((item) => {
                          const on = selected.has(item.permission);
                          return matchesSearch(mod, item) && matchesFilter(on);
                        })
                        .map((item) => ({ mod, item })),
                    );
                    if (sectionRows.length === 0) return null;
                    return (
                      <SectionRows
                        key={section.id}
                        section={section}
                        sectionRows={sectionRows}
                        secOn={secOn}
                        secPartial={secPartial}
                        canWrite={canWrite}
                        selected={selected}
                        onToggleSection={(on) => toggleSection(section.moduleIds, on)}
                        onToggleModule={toggleModule}
                        onTogglePermission={togglePermission}
                        moduleStatus={moduleStatus}
                      />
                    );
                  })}
                  {visibleRowCount === 0 && (
                    <tr>
                      <td colSpan={5} className="whq-bo-perm-empty">
                        ไม่พบสิทธิ์ที่ตรงกับคำค้นหา — ลองคำอื่นหรือเปลี่ยนตัวกรอง
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="whq-modal-actions whq-bo-perm-footer">
          <p className="whq-muted whq-bo-perm-footer-note">กดบันทึกแล้วผู้ใช้ต้องล็อกอินใหม่เพื่อให้สิทธิ์มีผลทันที</p>
          <div className="whq-bo-perm-footer-actions">
            <WorkHQButton type="button" variant="secondary" onClick={onClose}>ปิด</WorkHQButton>
            {canWrite && (
              <WorkHQButton type="button" variant="primary" disabled={saving || loading} onClick={() => void save()}>
                {saving ? 'กำลังบันทึก…' : 'บันทึกสิทธิ์'}
              </WorkHQButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SectionRowsProps {
  section: {
    id: string;
    label: string;
    description: string;
    moduleIds: string[];
    modules: BackofficeUserDetail['modules'];
  };
  sectionRows: Array<{
    mod: BackofficeUserDetail['modules'][number];
    item: BackofficeUserDetail['modules'][number]['items'][number];
  }>;
  secOn: boolean;
  secPartial: boolean;
  canWrite: boolean;
  selected: Set<string>;
  onToggleSection: (on: boolean) => void;
  onToggleModule: (modId: string, on: boolean) => void;
  onTogglePermission: (key: string) => void;
  moduleStatus: (mod: BackofficeUserDetail['modules'][number]) => 'on' | 'partial' | 'off';
}

function SectionRows({
  section,
  sectionRows,
  secOn,
  secPartial,
  canWrite,
  selected,
  onToggleSection,
  onToggleModule,
  onTogglePermission,
  moduleStatus,
}: SectionRowsProps) {
  let lastModId = '';
  return (
    <>
      <tr className="whq-bo-perm-table-section">
        <td className="whq-bo-perm-col-check">
          {canWrite && (
            <input
              type="checkbox"
              checked={secOn}
              ref={(el) => { if (el) el.indeterminate = secPartial; }}
              onChange={(e) => onToggleSection(e.target.checked)}
              aria-label={`เปิด/ปิดทั้งหมดใน ${section.label}`}
            />
          )}
        </td>
        <td colSpan={4}>
          <div className="whq-bo-perm-section-row">
            <strong>{section.label}</strong>
            <span className="whq-muted">{section.description}</span>
          </div>
        </td>
      </tr>
      {sectionRows.map(({ mod, item }) => {
        const showModHeader = mod.id !== lastModId;
        lastModId = mod.id;
        const on = selected.has(item.permission);
        const modStat = moduleStatus(mod);
        return (
          <Fragment key={`${mod.id}-${item.id}`}>
            {showModHeader && (
              <tr className="whq-bo-perm-table-module">
                <td className="whq-bo-perm-col-check">
                  {canWrite && (
                    <input
                      type="checkbox"
                      checked={modStat === 'on'}
                      ref={(el) => { if (el) el.indeterminate = modStat === 'partial'; }}
                      onChange={(e) => onToggleModule(mod.id, e.target.checked)}
                      aria-label={`เปิด/ปิดทั้งหมดใน ${mod.label}`}
                    />
                  )}
                </td>
                <td colSpan={4}>
                  <span className="whq-bo-perm-module-head">
                    <span className="whq-bo-perm-module-icon" aria-hidden>{mod.icon}</span>
                    <strong>{mod.label}</strong>
                    <span className="whq-muted">
                      {mod.items.filter((i) => selected.has(i.permission)).length} / {mod.items.length}
                    </span>
                  </span>
                </td>
              </tr>
            )}
            <tr className={`whq-bo-perm-table-row${on ? ' is-on' : ''}`}>
              <td className="whq-bo-perm-col-check">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!canWrite}
                  onChange={() => onTogglePermission(item.permission)}
                  aria-label={item.label}
                />
              </td>
              <td className="whq-bo-perm-col-group whq-muted">{mod.label}</td>
              <td className="whq-bo-perm-col-name">
                <strong>{item.label}</strong>
                <code className="whq-bo-perm-key">{item.permission}</code>
              </td>
              <td>{item.description ?? '—'}</td>
              <td className="whq-bo-perm-col-menu">{item.menuHint ?? '—'}</td>
            </tr>
          </Fragment>
        );
      })}
    </>
  );
}

interface CreateModalProps {
  open: boolean;
  canWrite: boolean;
  onClose: () => void;
  onCreated: (userId: string) => void;
}

function CreateUserModal({ open, canWrite, onClose, onCreated }: CreateModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [businessRole, setBusinessRole] = useState('secretary');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setBusy(true);
    setError('');
    try {
      const createdUsername = username.trim();
      const created = await createBackofficeUser({
        username: createdUsername,
        password,
        displayName: displayName.trim() || undefined,
        businessRole,
      });
      window.alert(
        `สร้างผู้ใช้สำเร็จ\n\nล็อกอินด้วย:\n• ชื่อผู้ใช้: ${createdUsername}${
          displayName.trim() ? `\n• ชื่อแสดง: ${displayName.trim()} (ใช้ล็อกอินได้ถ้าไม่ซ้ำ)` : ''
        }\n• รหัสผ่าน: ${password}`,
      );
      onCreated(created.id);
      onClose();
      setUsername('');
      setPassword('');
      setDisplayName('');
      setBusinessRole('secretary');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างผู้ใช้ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="whq-modal-backdrop" role="dialog" aria-modal="true">
      <form className="whq-modal whq-card" onSubmit={(e) => void submit(e)}>
        <h3>สร้างผู้ใช้หลังบ้าน</h3>
        <p className="whq-muted">
          บัญชีนี้ใช้ล็อกอินเข้าระบบหลังบ้าน — ไม่ผูกพนักงาน
          หลังสร้างแล้วสามารถสร้างลิงก์ Telegram จากปุ่ม Telegram ในตาราง
        </p>
        <div className="whq-form-stack">
          <WorkHQField label="ชื่อผู้ใช้ (ใช้ล็อกอิน)">
            <input value={username} required autoComplete="off" onChange={(e) => setUsername(e.target.value)} placeholder="เช่น owner01, hr_admin" />
          </WorkHQField>
          <WorkHQField label="ชื่อแสดง">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="เช่น เลขา, หัวหน้าทีมใหญ่" />
          </WorkHQField>
          <WorkHQField label="รหัสผ่านเริ่มต้น">
            <WorkHQPasswordInput
              value={password}
              required
              minLength={6}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              showGenerate
              onGenerate={setPassword}
            />
          </WorkHQField>
          <WorkHQField label="บทบาทเริ่มต้น">
            <WorkHQSelect value={businessRole} onChange={(e) => setBusinessRole(e.target.value)}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>{BACKOFFICE_ROLE_LABELS[r] ?? r}</option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
        </div>
        {error && <p className="whq-error-text">{error}</p>}
        <div className="whq-modal-actions">
          <WorkHQButton type="button" variant="secondary" onClick={onClose}>ยกเลิก</WorkHQButton>
          <WorkHQButton type="submit" variant="primary" disabled={busy || !canWrite}>
            {busy ? 'กำลังสร้าง…' : 'สร้างและตั้งสิทธิ์'}
          </WorkHQButton>
        </div>
      </form>
    </div>
  );
}

export default function BackOfficeUsersPage() {
  const { can } = useAuth();
  const canRead = can('permission:read') || can('permission:write');
  const canWrite = can('permission:write');

  const [rows, setRows] = useState<BackofficeUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [permUserId, setPermUserId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<BackofficeUserRow | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [telegramUser, setTelegramUser] = useState<BackofficeUserRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await listBackofficeUsers());
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (canRead) void load(); }, [canRead]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (roleFilter !== 'all' && row.businessRole !== roleFilter) return false;
      if (statusFilter === 'active' && !row.isActive) return false;
      if (statusFilter === 'inactive' && row.isActive) return false;
      return true;
    });
  }, [rows, roleFilter, statusFilter]);

  async function changeStatus(row: BackofficeUserRow, isActive: boolean) {
    if (!canWrite) return;
    await updateBackofficeUser(row.id, { isActive });
    void load();
  }

  async function saveEdit() {
    if (!editUser || !canWrite) return;
    const nextPassword = editPassword.trim();
    if (nextPassword && nextPassword.length < 6) {
      window.alert('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    setEditBusy(true);
    try {
      await updateBackofficeUser(editUser.id, {
        password: nextPassword || undefined,
        displayName: editDisplayName.trim() || undefined,
        businessRole: editUser.businessRole ?? undefined,
      });
      if (nextPassword) {
        window.alert(
          `เปลี่ยนรหัสผ่านสำเร็จ\n\nผู้ใช้: ${editUser.username}\nรหัสผ่านใหม่: ${nextPassword}\n\nผู้ใช้ต้องล็อกอินใหม่ด้วยรหัสนี้`,
        );
      }
      setEditUser(null);
      setEditPassword('');
      setEditDisplayName('');
      void load();
    } finally {
      setEditBusy(false);
    }
  }

  async function resetEditPassword() {
    if (!editUser || !canWrite) return;
    const ok = window.confirm(`รีเซ็ตรหัสผ่านของ "${editUser.username}" เป็นค่าใหม่ทันที?`);
    if (!ok) return;
    const nextPassword = generateRandomPassword();
    setResetBusy(true);
    try {
      await updateBackofficeUser(editUser.id, { password: nextPassword });
      window.alert(
        `รีเซ็ตรหัสผ่านสำเร็จ\n\nผู้ใช้: ${editUser.username}\nรหัสผ่านใหม่: ${nextPassword}\n\nส่งรหัสนี้ให้ผู้ใช้แล้วให้ล็อกอินใหม่`,
      );
      setEditUser(null);
      setEditPassword('');
      setEditDisplayName('');
      void load();
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <AppPageLayout
      breadcrumb={[
        { label: 'ภาพรวม', href: '/dashboard' },
        { label: 'ตั้งค่า', href: '/settings' },
        { label: 'ผู้ใช้หลังบ้าน' },
      ]}
      title="ผู้ใช้หลังบ้าน"
      description="บัญชี login สำหรับเจ้าของ / เลขา / หัวหน้า — แยกจากพนักงาน สามารถเชื่อม Telegram เพื่อดูรายงานและอนุมัติได้"
      primaryAction={canWrite ? (
        <WorkHQButton type="button" variant="primary" onClick={() => setShowCreate(true)}>
          + สร้างผู้ใช้หลังบ้าน
        </WorkHQButton>
      ) : undefined}
    >
      <WorkHQPageState
        state={canRead ? (loading ? 'loading' : error ? 'error' : 'success') : 'permissionDenied'}
        loading={<LoadingState />}
        error={error ? <ErrorState error={error} onRetry={load} /> : undefined}
        permissionDenied={<WorkHQPermissionDenied />}
      >
        <div className="whq-bo-intro whq-card">
          <strong>แยกจากพนักงานชัดเจน</strong>
          <p className="whq-muted">
            พนักงาน = ข้อมูลคนในระบบ (เชื่อม Telegram สำหรับเช็กอิน/ลา)
            · ผู้ใช้หลังบ้าน = บัญชี login ดูระบบ (เจ้าของ เลขา หัวหน้า) — กด
            <strong> Telegram</strong>
            {' '}เพื่อสร้างลิงก์เชื่อมบอท หรือกด
            <strong> สิทธิ์</strong>
            {' '}เพื่อเลือกหัวข้อที่เห็นได้
          </p>
        </div>

        <div className="whq-bo-filters whq-card">
          <label>
            บทบาท
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">ทั้งหมด</option>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>{BACKOFFICE_ROLE_LABELS[r]}</option>
              ))}
            </select>
          </label>
          <label>
            สถานะ
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">ทั้งหมด</option>
              <option value="active">เปิดใช้งาน</option>
              <option value="inactive">ปิดใช้งาน</option>
            </select>
          </label>
        </div>

        <div className="whq-card whq-bo-table-wrap">
          <table className="whq-bo-table">
            <thead>
              <tr>
                <th>#</th>
                <th>ชื่อผู้ใช้ (ล็อกอิน)</th>
                <th>ชื่อแสดง</th>
                <th>บทบาท</th>
                <th>Telegram</th>
                <th>สถานะ</th>
                <th>แก้ไขล่าสุด</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr key={row.id}>
                  <td>{idx + 1}</td>
                  <td><strong>{row.username}</strong></td>
                  <td>{row.displayName}</td>
                  <td>
                    <span className={roleBadgeClass(row.businessRole)}>
                      {row.businessRole ? (BACKOFFICE_ROLE_LABELS[row.businessRole] ?? row.businessRole) : '—'}
                    </span>
                  </td>
                  <td>
                    <span className={row.telegramStatus === 'LINKED' ? 'whq-bo-status whq-bo-status--on' : 'whq-muted'}>
                      {telegramStatusLabel(row.telegramStatus)}
                      {row.telegramUsername ? ` @${row.telegramUsername}` : ''}
                    </span>
                  </td>
                  <td>
                    {canWrite ? (
                      <select
                        className="whq-bo-status-select"
                        value={row.isActive ? 'active' : 'inactive'}
                        onChange={(e) => void changeStatus(row, e.target.value === 'active')}
                      >
                        <option value="active">เปิดใช้งาน</option>
                        <option value="inactive">ปิดใช้งาน</option>
                      </select>
                    ) : (
                      <span className={row.isActive ? 'whq-bo-status whq-bo-status--on' : 'whq-bo-status whq-bo-status--off'}>
                        {row.isActive ? 'เปิดใช้งาน' : 'ปิด'}
                      </span>
                    )}
                  </td>
                  <td className="whq-muted">{formatThaiDate(row.updatedAt)}</td>
                  <td>
                    <div className="whq-bo-actions">
                      <button type="button" className="whq-bo-act" onClick={() => setTelegramUser(row)}>
                        Telegram
                      </button>
                      <button type="button" className="whq-bo-act whq-bo-act--perm" onClick={() => setPermUserId(row.id)}>
                        สิทธิ์
                      </button>
                      {canWrite && (
                        <button
                          type="button"
                          className="whq-bo-act whq-bo-act--edit"
                          onClick={() => {
                            setEditUser(row);
                            setEditDisplayName(row.displayName);
                            setEditPassword('');
                          }}
                        >
                          แก้ไข
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="whq-muted whq-bo-empty">
                    ยังไม่มีผู้ใช้หลังบ้าน — กด &quot;สร้างผู้ใช้หลังบ้าน&quot; เพื่อเพิ่มบัญชี login
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </WorkHQPageState>

      {permUserId && (
        <PermissionModal
          userId={permUserId}
          canWrite={canWrite}
          onClose={() => setPermUserId(null)}
          onSaved={() => void load()}
        />
      )}

      {telegramUser && (
        <TelegramLinkModal
          user={telegramUser}
          canWrite={canWrite}
          onClose={() => setTelegramUser(null)}
          onChanged={() => void load()}
        />
      )}

      <CreateUserModal
        open={showCreate}
        canWrite={canWrite}
        onClose={() => setShowCreate(false)}
        onCreated={(userId) => {
          void load();
          setPermUserId(userId);
        }}
      />

      {editUser && (
        <div className="whq-modal-backdrop" role="dialog" aria-modal="true">
          <div className="whq-modal whq-card">
            <h3>แก้ไข — {editUser.username}</h3>
            <div className="whq-form-stack">
              <WorkHQField label="ชื่อแสดง">
                <input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
              </WorkHQField>
              <WorkHQField label="รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)">
                <WorkHQPasswordInput
                  value={editPassword}
                  minLength={6}
                  autoComplete="new-password"
                  onChange={(e) => setEditPassword(e.target.value)}
                  showGenerate
                  onGenerate={setEditPassword}
                />
              </WorkHQField>
              {canWrite && (
                <div className="whq-bo-password-reset">
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    disabled={editBusy || resetBusy}
                    onClick={() => void resetEditPassword()}
                  >
                    {resetBusy ? 'กำลังรีเซ็ต…' : 'รีเซ็ตรหัสผ่านทันที'}
                  </WorkHQButton>
                  <p className="whq-muted whq-bo-password-reset-hint">
                    สุ่มรหัสใหม่และบันทึกทันที — ระบบจะแสดงรหัสใหม่ให้คัดลอกส่งให้ผู้ใช้
                  </p>
                </div>
              )}
              <WorkHQField label="บทบาท">
                <WorkHQSelect
                  value={editUser.businessRole ?? 'admin'}
                  onChange={(e) => setEditUser({ ...editUser, businessRole: e.target.value })}
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>{BACKOFFICE_ROLE_LABELS[r]}</option>
                  ))}
                </WorkHQSelect>
              </WorkHQField>
            </div>
            <div className="whq-modal-actions">
              <WorkHQButton type="button" variant="secondary" onClick={() => setEditUser(null)}>ยกเลิก</WorkHQButton>
              <WorkHQButton type="button" variant="primary" disabled={editBusy} onClick={() => void saveEdit()}>
                บันทึก
              </WorkHQButton>
            </div>
          </div>
        </div>
      )}
    </AppPageLayout>
  );
}
