import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiDelete, apiGet, apiPatch, apiPost, fetchCompanies, type CompanyOption,
} from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { th, roleLabel } from '../../i18n/th-labels';
import {
  WorkHQButton,
  WorkHQCard,
  WorkHQField,
  WorkHQInput,
  WorkHQSelect,
} from '../ui';
import {
  ONBOARDING_INVITE_PERMISSIONS,
  onboardingInvitePermissionLabel,
} from '../../constants/onboarding-invite-permissions';

interface RoleTemplate {
  code: string;
  name: string;
  description: string;
  requiredScopeType: string;
  showsAllCompaniesBadge: boolean;
  hidesScopeSelector: boolean;
  requiresCompanyScope: boolean;
  requiresTeamScope: boolean;
}

interface TeamOption {
  id: string;
  companyId: string;
  name: string;
}

interface EffectiveAccess {
  userId: string;
  employeeId: string | null;
  username: string;
  businessRole: string | null;
  roleLabel: string;
  scopeBadge: string;
  companyScopes: Array<{ id: string; name: string; code: string }>;
  teamScopes: Array<{ id: string; name: string; companyId: string }>;
  preview: {
    can: string[];
    cannot: string[];
    salaryVisibility: string;
  };
  salaryPreview: { canViewOthers: boolean; reason: string } | null;
  overrides: Array<{ id: string; permission: string; effect: 'allow' | 'deny'; reason: string | null }>;
}

interface PreviewState {
  roleLabel: string;
  scopeBadge: string;
  preview: EffectiveAccess['preview'];
  salaryPreview: EffectiveAccess['salaryPreview'];
}

const OVERRIDE_OPTIONS = [
  { value: 'salary:read', label: 'ดูข้อมูลเงินเดือนพนักงาน' },
  { value: 'payroll:read', label: 'ดูสรุปเงินเดือน' },
  { value: 'employee:export', label: 'ส่งออกข้อมูลพนักงาน' },
  ...Object.values(ONBOARDING_INVITE_PERMISSIONS).map((value) => ({
    value,
    label: onboardingInvitePermissionLabel(value),
  })),
];

interface Props {
  employeeId: string;
  onSaved?: () => void;
}

function templateName(t: RoleTemplate): string {
  return roleLabel(t.code) !== t.code ? roleLabel(t.code) : t.name;
}

export function EmployeeAccessControlSection({ employeeId, onSaved }: Props) {
  const { can, user } = useAuth();
  const canRead = can('permission:read');
  const canWrite = can('permission:write');
  const isOwner = user?.businessRole === 'owner';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [access, setAccess] = useState<EffectiveAccess | null>(null);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);

  const [role, setRole] = useState('employee');
  const [companyScopeIds, setCompanyScopeIds] = useState<string[]>([]);
  const [teamScopeIds, setTeamScopeIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const [overridePermission, setOverridePermission] = useState('salary:read');
  const [overrideReason, setOverrideReason] = useState('');

  const template = useMemo(
    () => templates.find((t) => t.code === role),
    [templates, role],
  );

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [tmpl, data, companyList] = await Promise.all([
        apiGet<RoleTemplate[]>('/access-control/role-templates'),
        apiGet<EffectiveAccess>(`/access-control/employees/${employeeId}/effective-access`),
        fetchCompanies().catch(() => [] as CompanyOption[]),
      ]);
      setTemplates(tmpl);
      setAccess(data);
      setCompanies(companyList);
      setRole(data.businessRole ?? 'employee');
      setCompanyScopeIds(data.companyScopes.map((c) => c.id));
      setTeamScopeIds(data.teamScopes.map((t) => t.id));
    } catch (err) {
      setError((err as Error).message);
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }, [canRead, employeeId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!companies.length) return;
    void (async () => {
      const rows = await Promise.all(
        companies.map(async (c) => {
          const list = await apiGet<TeamOption[]>(`/organization/companies/${c.id}/teams`);
          return list;
        }),
      );
      setTeams(rows.flat());
    })();
  }, [companies]);

  useEffect(() => {
    if (!access?.userId || !canRead) return;
    const timer = setTimeout(async () => {
      try {
        const row = await apiPost<PreviewState>(
          `/access-control/users/${access.userId}/effective-access/preview`,
          { role, companyScopeIds, teamScopeIds },
        );
        setPreview(row);
      } catch {
        setPreview(null);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [access?.userId, canRead, role, companyScopeIds, teamScopeIds]);

  function toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function saveRole(e: FormEvent) {
    e.preventDefault();
    if (!access?.userId || !canWrite) return;
    setSaving(true);
    setError('');
    try {
      const updated = await apiPatch<EffectiveAccess>(
        `/access-control/users/${access.userId}/business-role`,
        { role, companyScopeIds, teamScopeIds },
      );
      setAccess(updated);
      setRole(updated.businessRole ?? role);
      setCompanyScopeIds(updated.companyScopes.map((c) => c.id));
      setTeamScopeIds(updated.teamScopes.map((t) => t.id));
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addOverride(e: FormEvent) {
    e.preventDefault();
    if (!access?.userId || !isOwner) return;
    setError('');
    try {
      await apiPost(`/access-control/users/${access.userId}/overrides`, {
        permission: overridePermission,
        effect: 'allow',
        reason: overrideReason || undefined,
      });
      setOverrideReason('');
      await load();
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeOverride(overrideId: string) {
    if (!access?.userId || !isOwner) return;
    setError('');
    try {
      await apiDelete(`/access-control/users/${access.userId}/overrides/${overrideId}`);
      await load();
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!canRead) {
    return (
      <WorkHQCard title={th.accessControl.title} className="whq-access-card">
        <p className="whq-muted">{th.accessControl.noPermission}</p>
      </WorkHQCard>
    );
  }

  if (loading) {
    return (
      <WorkHQCard title={th.accessControl.title} className="whq-access-card">
        <p className="whq-muted">{th.accessControl.loading}</p>
      </WorkHQCard>
    );
  }

  if (!access) {
    return (
      <WorkHQCard title={th.accessControl.title} className="whq-access-card">
        <p className="whq-muted">{error || th.accessControl.noLogin}</p>
      </WorkHQCard>
    );
  }

  const display = preview ?? {
    roleLabel: access.roleLabel,
    scopeBadge: access.scopeBadge,
    preview: access.preview,
    salaryPreview: access.salaryPreview,
  };

  return (
    <WorkHQCard
      title={th.accessControl.title}
      description={th.accessControl.subtitle(access.username)}
      className="whq-access-card"
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        {template?.showsAllCompaniesBadge && (
          <span className="whq-badge whq-badge-info">{th.accessControl.allCompanies}</span>
        )}
        {!template?.showsAllCompaniesBadge && template?.hidesScopeSelector && (
          <span className="whq-badge whq-badge-neutral">{display.scopeBadge}</span>
        )}
      </div>

      {error && <p className="whq-error-text">{error}</p>}

      <form onSubmit={saveRole}>
        <div style={{ marginBottom: '1.25rem' }}>
          <span className="whq-label">{th.accessControl.businessRole}</span>
          <div className="whq-role-grid" style={{ marginTop: '0.5rem' }}>
            {templates.map((t) => (
              <button
                key={t.code}
                type="button"
                className={`whq-role-card${role === t.code ? ' whq-role-card-active' : ''}`}
                disabled={!canWrite}
                onClick={() => setRole(t.code)}
              >
                <strong>{templateName(t)}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
        </div>

        {template?.requiresCompanyScope && (
          <div style={{ marginBottom: '1.25rem' }}>
            <span className="whq-label">{th.accessControl.companyScope}</span>
            <div className="whq-scope-chip-grid" style={{ marginTop: '0.5rem' }}>
              {companies.map((c) => (
                <label key={c.id} className={`whq-scope-chip${companyScopeIds.includes(c.id) ? ' whq-scope-chip-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={companyScopeIds.includes(c.id)}
                    disabled={!canWrite}
                    onChange={() => setCompanyScopeIds((ids) => toggleId(ids, c.id))}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {template?.requiresTeamScope && (
          <div style={{ marginBottom: '1.25rem' }}>
            <span className="whq-label">{th.accessControl.teamScope}</span>
            <div className="whq-scope-chip-grid" style={{ marginTop: '0.5rem' }}>
              {teams.map((t) => (
                <label key={t.id} className={`whq-scope-chip${teamScopeIds.includes(t.id) ? ' whq-scope-chip-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={teamScopeIds.includes(t.id)}
                    disabled={!canWrite}
                    onChange={() => setTeamScopeIds((ids) => toggleId(ids, t.id))}
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="whq-preview-grid">
          <div className="whq-preview-panel">
            <h3 className="whq-card-title" style={{ fontSize: '1rem' }}>{th.accessControl.preview}</h3>
            <p className="whq-muted">{display.roleLabel} · {display.scopeBadge}</p>
            {display.preview.can.length > 0 && (
              <>
                <h4>{th.accessControl.canAccess}</h4>
                <ul className="whq-access-list">
                  {display.preview.can.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </>
            )}
            {display.preview.cannot.length > 0 && (
              <>
                <h4>{th.accessControl.cannotAccess}</h4>
                <ul className="whq-access-list">
                  {display.preview.cannot.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </>
            )}
          </div>

          <div className="whq-preview-panel">
            <h3 className="whq-card-title" style={{ fontSize: '1rem' }}>{th.accessControl.salaryVisibility}</h3>
            <p>{display.preview.salaryVisibility}</p>
            {display.salaryPreview && (
              <p className="whq-muted">
                {display.salaryPreview.canViewOthers
                  ? th.accessControl.salaryCanViewOthers
                  : th.accessControl.salaryOwnOnly}
              </p>
            )}
          </div>
        </div>

        {canWrite && (
          <div className="whq-btn-group" style={{ marginTop: '1rem' }}>
            <WorkHQButton type="submit" variant="primary" disabled={saving}>
              {saving ? th.accessControl.saving : th.accessControl.saveAccess}
            </WorkHQButton>
          </div>
        )}
      </form>

      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--whq-border)' }}>
        <h3 className="whq-card-title" style={{ fontSize: '1rem' }}>{th.accessControl.additionalAccess}</h3>
        <p className="whq-muted">{th.accessControl.additionalDesc}</p>

        {access.overrides.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0', display: 'grid', gap: '0.5rem' }}>
            {access.overrides.map((o) => (
              <li key={o.id} className="whq-direct-reports" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                  <div>
                    <strong>{OVERRIDE_OPTIONS.find((x) => x.value === o.permission)?.label ?? o.permission}</strong>
                    {o.reason && <span className="whq-muted"> — {o.reason}</span>}
                  </div>
                  {isOwner && (
                    <WorkHQButton type="button" variant="secondary" onClick={() => removeOverride(o.id)}>
                      {th.accessControl.remove}
                    </WorkHQButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          <form className="whq-form-row" onSubmit={addOverride} style={{ marginTop: '0.75rem' }}>
            <WorkHQField label={th.accessControl.grantAccess}>
              <WorkHQSelect value={overridePermission} onChange={(e) => setOverridePermission(e.target.value)}>
                {OVERRIDE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </WorkHQSelect>
            </WorkHQField>
            <WorkHQField label={th.accessControl.reasonOptional}>
              <WorkHQInput value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            </WorkHQField>
            <WorkHQButton type="submit" variant="primary">{th.accessControl.addOverride}</WorkHQButton>
          </form>
        ) : (
          <p className="whq-muted">{th.accessControl.ownerOnly}</p>
        )}
      </div>
    </WorkHQCard>
  );
}
