import type { CompanyOption } from '../../api/client';
import { th, roleLabel } from '../../i18n/th-labels';
import { WorkHQField, WorkHQSelect } from '../ui';

interface RoleTemplate {
  code: string;
  name: string;
  requiresCompanyScope: boolean;
  requiresTeamScope: boolean;
}

interface TeamOption {
  id: string;
  name: string;
}

interface Props {
  templates: RoleTemplate[];
  businessRole: string;
  onRoleChange: (role: string) => void;
  companies: CompanyOption[];
  teams: TeamOption[];
  companyScopeIds: string[];
  teamScopeIds: string[];
  onCompanyScopeChange: (ids: string[]) => void;
  onTeamScopeChange: (ids: string[]) => void;
  disabled?: boolean;
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function BusinessRoleScopeFields({
  templates,
  businessRole,
  onRoleChange,
  companies,
  teams,
  companyScopeIds,
  teamScopeIds,
  onCompanyScopeChange,
  onTeamScopeChange,
  disabled,
}: Props) {
  const template = templates.find((t) => t.code === businessRole);

  if (!templates.length) return null;

  return (
    <div className="whq-stack">
      <WorkHQField label={th.addEmployee.businessRole}>
        <WorkHQSelect value={businessRole} disabled={disabled} onChange={(e) => onRoleChange(e.target.value)}>
          {templates.map((t) => (
            <option key={t.code} value={t.code}>{roleLabel(t.code)}</option>
          ))}
        </WorkHQSelect>
      </WorkHQField>

      {template?.requiresCompanyScope && (
        <div>
          <span className="whq-label">{th.addEmployee.companyScope}</span>
          <div className="whq-scope-chip-grid" style={{ marginTop: '0.5rem' }}>
            {companies.map((c) => (
              <label key={c.id} className={`whq-scope-chip${companyScopeIds.includes(c.id) ? ' whq-scope-chip-active' : ''}`}>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={companyScopeIds.includes(c.id)}
                  onChange={() => onCompanyScopeChange(toggleId(companyScopeIds, c.id))}
                />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      )}

      {template?.requiresTeamScope && (
        <div>
          <span className="whq-label">{th.addEmployee.teamScope}</span>
          <div className="whq-scope-chip-grid" style={{ marginTop: '0.5rem' }}>
            {teams.map((t) => (
              <label key={t.id} className={`whq-scope-chip${teamScopeIds.includes(t.id) ? ' whq-scope-chip-active' : ''}`}>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={teamScopeIds.includes(t.id)}
                  onChange={() => onTeamScopeChange(toggleId(teamScopeIds, t.id))}
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
