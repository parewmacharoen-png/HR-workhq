import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost, apiPut, apiDelete } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { onboardingInvitePermissionLabel } from '../../constants/onboarding-invite-permissions';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';

interface RoleTemplate {
  code: string;
  name: string;
  description: string;
  defaultScopeType: string;
  permissions: string[];
}

interface UserSearchResult {
  id: string;
  username: string;
  employeeId: string | null;
  displayName: string | null;
}

interface UserAccess {
  userId: string;
  username: string;
  employeeId: string | null;
  businessRole: string | null;
  scopes: Array<{ id: string; scopeType: string; companyId: string | null; teamId: string | null }>;
  effectivePermissions: string[];
  overrides: Array<{ id: string; permission: string; effect: string; reason: string | null }>;
  salaryVisibilityNote: string;
}

interface SalaryPreview {
  canView: boolean;
  reason: string;
}

type Tab = 'templates' | 'users' | 'salary';

export default function PermissionsSettingsPage() {
  const { can } = useAuth();
  const canRead = can('permission:read');
  const canWrite = can('permission:write');

  const [tab, setTab] = useState<Tab>('templates');
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [access, setAccess] = useState<UserAccess | null>(null);
  const [selectedRole, setSelectedRole] = useState('employee');
  const [overridePermission, setOverridePermission] = useState('salary:read');
  const [overrideEffect, setOverrideEffect] = useState<'allow' | 'deny'>('allow');
  const [overrideReason, setOverrideReason] = useState('');
  const [scopeType, setScopeType] = useState('company');
  const [scopeCompanyId, setScopeCompanyId] = useState('');

  const [viewerUserId, setViewerUserId] = useState('');
  const [targetEmployeeId, setTargetEmployeeId] = useState('');
  const [salaryPreview, setSalaryPreview] = useState<SalaryPreview | null>(null);

  async function loadTemplates() {
    setLoading(true);
    try {
      const rows = await apiGet<RoleTemplate[]>('/permissions/business-roles');
      setTemplates(rows);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canRead) void loadTemplates();
    else setLoading(false);
  }, [canRead]);

  async function searchUsers(e: FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const rows = await apiGet<UserSearchResult[]>(`/permissions/users/search?q=${encodeURIComponent(searchQuery)}`);
    setSearchResults(rows);
  }

  async function loadUserAccess(userId: string) {
    setSelectedUserId(userId);
    const row = await apiGet<UserAccess>(`/permissions/users/${userId}/access`);
    setAccess(row);
    setSelectedRole(row.businessRole ?? 'employee');
    setScopeType(row.scopes[0]?.scopeType ?? 'self');
    setScopeCompanyId(row.scopes[0]?.companyId ?? '');
  }

  async function assignRole() {
    if (!selectedUserId || !canWrite) return;
    await apiPut(`/permissions/users/${selectedUserId}/business-role`, { role: selectedRole });
    await loadUserAccess(selectedUserId);
  }

  async function saveScopes() {
    if (!selectedUserId || !canWrite) return;
    const scopes = [{
      scopeType,
      companyId: scopeType === 'company' ? scopeCompanyId || null : null,
      teamId: null,
    }];
    await apiPut(`/permissions/users/${selectedUserId}/scopes`, { scopes });
    await loadUserAccess(selectedUserId);
  }

  async function addOverride() {
    if (!selectedUserId || !canWrite) return;
    await apiPost(`/permissions/users/${selectedUserId}/overrides`, {
      permission: overridePermission,
      effect: overrideEffect,
      reason: overrideReason || undefined,
    });
    setOverrideReason('');
    await loadUserAccess(selectedUserId);
  }

  async function removeOverride(overrideId: string) {
    if (!selectedUserId || !canWrite) return;
    await apiDelete(`/permissions/users/${selectedUserId}/overrides/${overrideId}`);
    await loadUserAccess(selectedUserId);
  }

  async function runSalaryPreview(e: FormEvent) {
    e.preventDefault();
    const result = await apiGet<SalaryPreview>(
      `/permissions/salary-visibility/preview?viewerUserId=${viewerUserId}&targetEmployeeId=${targetEmployeeId}`,
    );
    setSalaryPreview(result);
  }

  if (!canRead) {
    return (
      <div className="card">
        <h1>บทบาทและสิทธิ์</h1>
        <p>คุณไม่มีสิทธิ์ดูหน้านี้</p>
      </div>
    );
  }

  if (loading) return <LoadingState label="กำลังโหลด…" />;
  if (error) return <ErrorState error={error} onRetry={() => void loadTemplates()} />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>บทบาทและสิทธิ์</h1>
        <Link to="/settings" className="muted">← ตั้งค่า</Link>
      </div>
      <p className="muted">
        กำหนดสิทธิ์ตามบทบาท → ขอบเขตข้อมูล → สิทธิ์พิเศษรายคน
      </p>

      <div className="tab-row" style={{ marginBottom: '1rem' }}>
        {(['templates', 'users', 'salary'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'btn primary' : 'btn'}
            onClick={() => setTab(key)}
          >
            {key === 'templates' ? 'แม่แบบบทบาท' : key === 'users' ? 'สิทธิ์ผู้ใช้' : 'ตรวจสอบเงินเดือน'}
          </button>
        ))}
      </div>

      {tab === 'templates' && (
        <div className="settings-section-grid">
          {templates.map((role) => (
            <div key={role.code} className="settings-section-card">
              <strong>{role.name}</strong>
              <span className="muted">{role.code}</span>
              <p>{role.description}</p>
              <p><small>ขอบเขตเริ่มต้น: {role.defaultScopeType}</small></p>
              <details>
                <summary>{role.permissions.length} สิทธิ์</summary>
                <ul>
                  {role.permissions.map((p) => (
                    <li key={p}>
                      <code>{p}</code>
                      {' — '}
                      {onboardingInvitePermissionLabel(p)}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div>
          <form onSubmit={searchUsers} className="form-row">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อผู้ใช้หรือพนักงาน"
            />
            <button type="submit" className="btn">ค้นหา</button>
          </form>

          {searchResults.length > 0 && (
            <ul>
              {searchResults.map((u) => (
                <li key={u.id}>
                  <button type="button" className="link-btn" onClick={() => void loadUserAccess(u.id)}>
                    {u.displayName ?? u.username}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {access && (
            <div style={{ marginTop: '1.5rem' }}>
              <h2>{access.username}</h2>
              <p className="muted">{access.salaryVisibilityNote}</p>

              {canWrite && (
                <div className="form-stack" style={{ marginBottom: '1rem' }}>
                  <label>
                    บทบาท
                    <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                      {templates.map((r) => (
                        <option key={r.code} value={r.code}>{r.name}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="btn primary" onClick={() => void assignRole()}>กำหนดบทบาท</button>

                  <label>
                    ขอบเขต
                    <select value={scopeType} onChange={(e) => setScopeType(e.target.value)}>
                      <option value="self">ตนเอง</option>
                      <option value="company">บริษัท</option>
                      <option value="team">ทีม</option>
                      <option value="all">ทั้งหมด</option>
                    </select>
                  </label>
                  {scopeType === 'company' && (
                    <label>
                      รหัสบริษัท
                      <input value={scopeCompanyId} onChange={(e) => setScopeCompanyId(e.target.value)} />
                    </label>
                  )}
                  <button type="button" className="btn" onClick={() => void saveScopes()}>บันทึกขอบเขต</button>

                  <label>
                    สิทธิ์พิเศษ
                    <input value={overridePermission} onChange={(e) => setOverridePermission(e.target.value)} />
                  </label>
                  <label>
                    ผลลัพธ์
                    <select value={overrideEffect} onChange={(e) => setOverrideEffect(e.target.value as 'allow' | 'deny')}>
                      <option value="allow">อนุญาต</option>
                      <option value="deny">ปฏิเสธ</option>
                    </select>
                  </label>
                  <label>
                    เหตุผล
                    <input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                  </label>
                  <button type="button" className="btn" onClick={() => void addOverride()}>เพิ่มสิทธิ์พิเศษ</button>
                </div>
              )}

              <h3>สิทธิ์ที่มีผล ({access.effectivePermissions.length})</h3>
              <pre style={{ maxHeight: 160, overflow: 'auto' }}>{access.effectivePermissions.join('\n')}</pre>

              <h3>สิทธิ์พิเศษ</h3>
              <ul>
                {access.overrides.map((o) => (
                  <li key={o.id}>
                    <code>{o.effect}</code> {o.permission}
                    {o.reason ? ` — ${o.reason}` : ''}
                    {canWrite && (
                      <button type="button" className="link-btn" onClick={() => void removeOverride(o.id)}>ลบ</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'salary' && (
        <form onSubmit={runSalaryPreview} className="form-stack">
          <label>
            รหัสผู้ใช้ที่ตรวจสอบ
            <input value={viewerUserId} onChange={(e) => setViewerUserId(e.target.value)} required />
          </label>
          <label>
            รหัสพนักงานเป้าหมาย
            <input value={targetEmployeeId} onChange={(e) => setTargetEmployeeId(e.target.value)} required />
          </label>
          <button type="submit" className="btn primary">ตรวจสอบ</button>
          {salaryPreview && (
            <p>
              <strong>{salaryPreview.canView ? 'ดูได้' : 'ไม่มีสิทธิ์'}</strong>
              {' — '}
              {salaryPreview.reason}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
