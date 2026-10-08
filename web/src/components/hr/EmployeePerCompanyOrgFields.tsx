import { useEffect, useState } from 'react';
import { fetchCompanyTeams } from '../../api/employee-employment';
import { EMPLOYEE_DEPARTMENT_OPTIONS, EMPLOYEE_POSITION_OPTIONS } from '../../lib/employee-org-options';
import { NO_DATA } from '../../lib/employee-date-utils';
import { WorkHQButton, WorkHQField, WorkHQSelect } from '../ui';

/** `teamId` is the primary team in the company; `extraTeamIds` are further teams there. */
export type CompanyOrgSelection = { department: string; teamId: string; extraTeamIds?: string[] };

interface CompanyOption {
  id: string;
  name: string;
  code?: string;
}

/**
 * Turns the list into editable rows: each row picks its own company, and rows can be
 * added or removed. The first company in `companyIds` is the primary company.
 */
export interface CompanyRowsEditor {
  /** Add a row for the next company not yet used. */
  onAddCompany: () => void;
  onChangeCompany: (fromCompanyId: string, toCompanyId: string) => void;
  onRemoveCompany: (companyId: string) => void;
  /** Omit to keep the primary company fixed. */
  onMakePrimary?: (companyId: string) => void;
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
  companyRows?: CompanyRowsEditor;
  /**
   * How teams are picked (from the position): 'none' hides the team field, 'single' is one
   * team per company, 'multi' ticks several, 'all' covers every team so nothing is picked.
   * Omit for the original select + "other teams" checkboxes.
   */
  teamsMode?: 'none' | 'single' | 'multi' | 'all';
  /** Department comes from the position, so the department field is hidden. */
  departmentLocked?: boolean;
  /** Every company is used (e.g. เลขา), so rows can't be added, removed or swapped. */
  companiesLocked?: boolean;
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
  companyRows,
  teamsMode,
  departmentLocked = false,
  companiesLocked = false,
}: EmployeePerCompanyOrgFieldsProps) {
  const [teamsByCompany, setTeamsByCompany] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  // Extra teams may sit in another department, so they are picked from every team in the company.
  const [allTeamsByCompany, setAllTeamsByCompany] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  // Companies whose team list failed to load — shown as an error, not as "no teams".
  const [teamLoadErrors, setTeamLoadErrors] = useState<Record<string, boolean>>({});
  const [reloadCount, setReloadCount] = useState(0);
  const companyIdsKey = companyIds.join(',');
  const orgKey = companyIds.map((cid) => `${cid}:${value[cid]?.department ?? ''}`).join('|');

  useEffect(() => {
    if (!companyIds.length) return;
    void Promise.all(
      companyIds.map(async (cid) => {
        const dept = value[cid]?.department;
        try {
          return { cid, rows: await fetchCompanyTeams(cid, dept || undefined), failed: false };
        } catch {
          return { cid, rows: [], failed: true };
        }
      }),
    ).then((results) => {
      setTeamsByCompany((prev) => {
        const next = { ...prev };
        for (const row of results) next[row.cid] = row.rows;
        return next;
      });
      setTeamLoadErrors((prev) => {
        const next = { ...prev };
        for (const row of results) next[row.cid] = row.failed;
        return next;
      });
    });
  }, [companyIdsKey, orgKey, companyIds, reloadCount]);

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
  const sectionLabel = companyRows
    ? 'บริษัท / แผนก / ทีม'
    : multiCompany ? 'แผนก / ทีม (ต่อบริษัท)' : 'แผนก / ทีม';
  const unusedCompanies = companies.filter((c) => !companyIds.includes(c.id));
  const rowsEditable = Boolean(companyRows) && !companiesLocked;
  const showTeamSelect = teamsMode === undefined || teamsMode === 'single';

  return (
    <WorkHQField label={sectionLabel}>
      {companiesLocked ? (
        <p className="whq-muted whq-text-sm whq-mb-sm">ตำแหน่งนี้ทำงานให้ทุกบริษัท ระบบใส่ให้ครบแล้ว</p>
      ) : companyRows ? (
        <p className="whq-muted whq-text-sm whq-mb-sm">
          ทำงานหลายบริษัท ให้กด &quot;+ เพิ่มบริษัท&quot; แล้วเลือกทีมของแต่ละบริษัท เช่น KW ทีม 1, SB ทีม 3
        </p>
      ) : multiCompany ? (
        <p className="whq-muted whq-text-sm whq-mb-sm">
          ตั้งแผนกและทีมแยกตามบริษัท — เช่น SB ทีม 1, KW ทีม 3
        </p>
      ) : null}
      {companyIds.map((cid, index) => {
        const c = companies.find((row) => row.id === cid);
        const org = value[cid] ?? { department: '', teamId: '' };
        const teams = teamsByCompany[cid] ?? [];
        const teamsLoading = teamsByCompany[cid] === undefined;
        const teamLoadFailed = teamLoadErrors[cid] === true;
        const extraTeamIds = org.extraTeamIds ?? [];
        const extraTeamOptions = (allTeamsByCompany[cid] ?? []).filter((team) => team.id !== org.teamId);
        return (
          <div
            key={cid}
            className="whq-invite-company-org"
            style={{ marginBottom: multiCompany || companyRows ? '1rem' : 0 }}
          >
            {companyRows ? (
              <div className="whq-company-row-head">
                <span className="whq-muted whq-text-sm" style={{ fontWeight: 600 }}>
                  {index === 0 ? 'บริษัทหลัก' : `บริษัทที่ ${index + 1}`}
                </span>
                {index > 0 && rowsEditable ? (
                  <span style={{ display: 'flex', gap: '0.25rem' }}>
                    {companyRows.onMakePrimary ? (
                      <WorkHQButton variant="ghost" onClick={() => companyRows.onMakePrimary?.(cid)}>
                        ตั้งเป็นบริษัทหลัก
                      </WorkHQButton>
                    ) : null}
                    <WorkHQButton
                      variant="ghost"
                      aria-label={`ลบ ${companyLabel(c, cid)}`}
                      onClick={() => companyRows.onRemoveCompany(cid)}
                    >
                      ลบ
                    </WorkHQButton>
                  </span>
                ) : null}
              </div>
            ) : multiCompany ? (
              <div className="whq-muted whq-text-sm" style={{ marginBottom: '0.35rem', fontWeight: 600 }}>
                {index === 0 ? 'บริษัทหลัก · ' : ''}{companyLabel(c, cid)}
              </div>
            ) : null}
            <div
              className={companyRows && !departmentLocked && showTeamSelect ? 'whq-form-row whq-form-row--3' : 'whq-form-row'}
            >
              {companyRows ? (
                <WorkHQField label="บริษัท">
                  <WorkHQSelect
                    value={cid}
                    disabled={companiesLocked || (index === 0 && !companyRows.onMakePrimary)}
                    onChange={(e) => companyRows.onChangeCompany(cid, e.target.value)}
                  >
                    {companies
                      .filter((row) => row.id === cid || !companyIds.includes(row.id))
                      .map((row) => (
                        <option key={row.id} value={row.id}>{companyLabel(row, row.id)}</option>
                      ))}
                  </WorkHQSelect>
                </WorkHQField>
              ) : null}
              {departmentLocked ? null : (
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
              )}
              {teamsMode === 'all' ? (
                <WorkHQField label="ทีม">
                  <p className="whq-muted" style={{ margin: '0.6rem 0 0' }}>ดูแลทุกทีมในบริษัทนี้</p>
                </WorkHQField>
              ) : null}
              {showTeamSelect ? (
              <WorkHQField label="ทีม">
                <WorkHQSelect
                  value={org.teamId}
                  onChange={(e) => onChange(cid, { teamId: e.target.value })}
                  disabled={teams.length === 0 || (companyRows && !org.department)}
                >
                  <option value="">
                    {companyRows && !org.department ? '— เลือกแผนกก่อน —'
                      : teamsLoading ? '— กำลังโหลดทีม… —'
                        : teamLoadFailed ? '— โหลดรายชื่อทีมไม่สำเร็จ —'
                          : teams.length === 0 ? '— ไม่มีทีมในบริษัทนี้ —' : NO_DATA}
                  </option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </WorkHQSelect>
                {teamLoadFailed ? (
                  <span className="whq-field-error" role="alert">
                    โหลดรายชื่อทีมไม่สำเร็จ{' '}
                    <WorkHQButton variant="ghost" type="button" onClick={() => setReloadCount((n) => n + 1)}>
                      ลองใหม่
                    </WorkHQButton>
                  </span>
                ) : null}
              </WorkHQField>
              ) : null}
            </div>
            {teamsMode === 'multi' ? (
              <WorkHQField label="ทีม (เลือกได้หลายทีม ทีมแรกที่ติ๊กเป็นทีมหลัก)">
                {companyRows && !org.department ? (
                  <p className="whq-muted">— เลือกแผนกก่อน —</p>
                ) : teamsLoading ? (
                  <p className="whq-muted">— กำลังโหลดทีม… —</p>
                ) : teamLoadFailed ? (
                  <span className="whq-field-error" role="alert">
                    โหลดรายชื่อทีมไม่สำเร็จ{' '}
                    <WorkHQButton variant="ghost" type="button" onClick={() => setReloadCount((n) => n + 1)}>
                      ลองใหม่
                    </WorkHQButton>
                  </span>
                ) : teams.length === 0 ? (
                  <p className="whq-muted">— ไม่มีทีมในบริษัทนี้ —</p>
                ) : (
                  <div className="whq-checkbox-group whq-checkbox-group--inline">
                    {teams.map((team) => {
                      const picked = [org.teamId, ...extraTeamIds].filter(Boolean);
                      return (
                        <label key={team.id} className="whq-checkbox-row">
                          <input
                            type="checkbox"
                            checked={picked.includes(team.id)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...picked, team.id]
                                : picked.filter((id) => id !== team.id);
                              onChange(cid, { teamId: next[0] ?? '', extraTeamIds: next.slice(1) });
                            }}
                          />
                          <span>{team.name}{org.teamId === team.id && picked.length > 1 ? ' (หลัก)' : ''}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </WorkHQField>
            ) : null}
            {teamsMode === undefined && allowMultipleTeams && org.teamId && extraTeamOptions.length > 0 ? (
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
      {companyRows && rowsEditable && unusedCompanies.length > 0 ? (
        <WorkHQButton variant="secondary" onClick={companyRows.onAddCompany}>
          + เพิ่มบริษัท
        </WorkHQButton>
      ) : null}
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
