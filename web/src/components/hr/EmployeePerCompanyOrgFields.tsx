import { useEffect, useState } from 'react';
import { fetchCompanyTeams } from '../../api/employee-employment';
import { EMPLOYEE_DEPARTMENT_OPTIONS, EMPLOYEE_POSITION_OPTIONS } from '../../lib/employee-org-options';
import { NO_DATA } from '../../lib/employee-date-utils';
import { WorkHQField, WorkHQSelect } from '../ui';

/** `teamId` is the primary team in the company; `extraTeamIds` are further teams there. */
export type CompanyOrgSelection = { department: string; teamId: string; extraTeamIds?: string[] };

interface CompanyOption {
  id: string;
  name: string;
  code?: string;
}

interface EmployeePerCompanyOrgFieldsProps {
  companyIds: string[];
  companies: CompanyOption[];
  value: Record<string, CompanyOrgSelection>;
  onChange: (companyId: string, patch: Partial<CompanyOrgSelection>) => void;
  position?: string;
  onPositionChange?: (value: string) => void;
  /** Show "other teams in this company" checkboxes (needs a save path that sends extraTeamIds). */
  allowMultipleTeams?: boolean;
}

function companyLabel(c: CompanyOption | undefined, id: string): string {
  if (!c) return id.slice(0, 8);
  return c.code ? `${c.name} (${c.code})` : c.name;
}

export function EmployeePerCompanyOrgFields({
  companyIds,
  companies,
  value,
  onChange,
  position,
  onPositionChange,
  allowMultipleTeams = false,
}: EmployeePerCompanyOrgFieldsProps) {
  const [teamsByCompany, setTeamsByCompany] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  // Extra teams may sit in another department, so they are picked from every team in the company.
  const [allTeamsByCompany, setAllTeamsByCompany] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const companyIdsKey = companyIds.join(',');
  const orgKey = companyIds.map((cid) => `${cid}:${value[cid]?.department ?? ''}`).join('|');

  useEffect(() => {
    if (!companyIds.length) return;
    void Promise.all(
      companyIds.map(async (cid) => {
        const dept = value[cid]?.department;
        const rows = await fetchCompanyTeams(cid, dept || undefined).catch(() => []);
        return { cid, rows };
      }),
    ).then((results) => {
      setTeamsByCompany((prev) => {
        const next = { ...prev };
        for (const row of results) next[row.cid] = row.rows;
        return next;
      });
    });
  }, [companyIdsKey, orgKey, companyIds]);

  useEffect(() => {
    if (!allowMultipleTeams || !companyIds.length) return;
    void Promise.all(
      companyIds.map(async (cid) => ({ cid, rows: await fetchCompanyTeams(cid).catch(() => []) })),
    ).then((results) => {
      setAllTeamsByCompany((prev) => {
        const next = { ...prev };
        for (const row of results) next[row.cid] = row.rows;
        return next;
      });
    });
  }, [allowMultipleTeams, companyIdsKey]);

  const multiCompany = companyIds.length > 1;
  const sectionLabel = multiCompany ? 'แผนก / ทีม (ต่อบริษัท)' : 'แผนก / ทีม';

  return (
    <WorkHQField label={sectionLabel}>
      {multiCompany ? (
        <p className="whq-muted whq-text-sm whq-mb-sm">
          ตั้งแผนกและทีมแยกตามบริษัท — เช่น SB ทีม 1, KW ทีม 3
        </p>
      ) : null}
      {companyIds.map((cid, index) => {
        const c = companies.find((row) => row.id === cid);
        const org = value[cid] ?? { department: '', teamId: '' };
        const teams = teamsByCompany[cid] ?? [];
        const extraTeamIds = org.extraTeamIds ?? [];
        const extraTeamOptions = (allTeamsByCompany[cid] ?? []).filter((team) => team.id !== org.teamId);
        return (
          <div
            key={cid}
            className="whq-invite-company-org"
            style={{ marginBottom: multiCompany ? '1rem' : 0 }}
          >
            {multiCompany ? (
              <div className="whq-muted whq-text-sm" style={{ marginBottom: '0.35rem', fontWeight: 600 }}>
                {index === 0 ? 'บริษัทหลัก · ' : ''}{companyLabel(c, cid)}
              </div>
            ) : null}
            <div className="whq-form-row">
              <WorkHQField label="แผนก">
                <WorkHQSelect
                  value={org.department}
                  onChange={(e) => onChange(cid, { department: e.target.value })}
                >
                  <option value="">{NO_DATA}</option>
                  {EMPLOYEE_DEPARTMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </WorkHQSelect>
              </WorkHQField>
              <WorkHQField label="ทีม">
                <WorkHQSelect
                  value={org.teamId}
                  onChange={(e) => onChange(cid, { teamId: e.target.value })}
                  disabled={teams.length === 0}
                >
                  <option value="">{teams.length === 0 ? '— ไม่มีทีมในบริษัทนี้ —' : NO_DATA}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </WorkHQSelect>
              </WorkHQField>
            </div>
            {allowMultipleTeams && org.teamId && extraTeamOptions.length > 0 ? (
              <WorkHQField label="ทีมอื่นในบริษัทนี้ (ถ้าทำหลายทีม)">
                <div className="whq-checkbox-group whq-checkbox-group--inline">
                  {extraTeamOptions.map((team) => (
                    <label key={team.id} className="whq-checkbox-row">
                      <input
                        type="checkbox"
                        checked={extraTeamIds.includes(team.id)}
                        onChange={(e) => onChange(cid, {
                          extraTeamIds: e.target.checked
                            ? [...extraTeamIds, team.id]
                            : extraTeamIds.filter((id) => id !== team.id),
                        })}
                      />
                      <span>{team.name}</span>
                    </label>
                  ))}
                </div>
              </WorkHQField>
            ) : null}
          </div>
        );
      })}
      {onPositionChange && (
        <div style={{ marginTop: companyIds.length ? '0.75rem' : 0 }}>
          <WorkHQField label="ตำแหน่ง">
            <WorkHQSelect value={position ?? ''} onChange={(e) => onPositionChange(e.target.value)}>
              <option value="">{NO_DATA}</option>
              {EMPLOYEE_POSITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
        </div>
      )}
    </WorkHQField>
  );
}
