import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet, ApiError, fetchCompanies, type CompanyOption } from '../../api/client';
import { onboardEmployee } from '../../api/employees';
import { useCompanyId } from '../../context/AuthContext';
import { useCanAddEmployee } from '../../hooks/useEmployeePermissions';
import { BusinessRoleScopeFields } from '../../components/hr/BusinessRoleScopeFields';
import {
  EmployeePerCompanyOrgFields,
  type CompanyOrgSelection,
} from '../../components/hr/EmployeePerCompanyOrgFields';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import {
  WorkHQAlert,
  WorkHQButton,
  WorkHQCard,
  WorkHQField,
  WorkHQInput,
  WorkHQDateInput,
  WorkHQPage,
  WorkHQPageHeader,
  WorkHQSelect,
} from '../../components/ui';
import { th } from '../../i18n/th-labels';

interface RoleTemplate {
  code: string;
  name: string;
  requiresCompanyScope: boolean;
  requiresTeamScope: boolean;
}

interface TeamOption {
  id: string;
  companyId: string;
  name: string;
}

const EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'probation',
  'permanent',
  'contract',
] as const;

export default function AddEmployeePage() {
  const navigate = useNavigate();
  const defaultCompanyId = useCompanyId();
  const canAdd = useCanAddEmployee();

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [additionalCompanyIds, setAdditionalCompanyIds] = useState<string[]>([]);
  const [companyOrgById, setCompanyOrgById] = useState<Record<string, CompanyOrgSelection>>({});
  const [position, setPosition] = useState('');
  const [employmentType, setEmploymentType] = useState<(typeof EMPLOYMENT_TYPES)[number]>('full_time');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [monthlySalary, setMonthlySalary] = useState('');
  const [depositCollectionCompanyId, setDepositCollectionCompanyId] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [createLogin, setCreateLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [businessRole, setBusinessRole] = useState('employee');
  const [companyScopeIds, setCompanyScopeIds] = useState<string[]>([]);
  const [teamScopeIds, setTeamScopeIds] = useState<string[]>([]);

  const template = useMemo(
    () => templates.find((t) => t.code === businessRole),
    [templates, businessRole],
  );

  const activeCompanyIds = useMemo(
    () => [companyId, ...additionalCompanyIds.filter((id) => id && id !== companyId)].filter(Boolean),
    [companyId, additionalCompanyIds],
  );

  const activeCompanyCount = companies.length;

  const isSharedPayroll = useMemo(() => {
    const primaryDept = companyOrgById[companyId]?.department ?? '';
    const SHARED_DEPTS = ['Admin', 'เลขา', 'HR', 'Finance'];
    const SHARED_POSITIONS = ['แอดมิน', 'เลขา', 'Telesales', 'เทเรเซล', 'telesales'];
    const SHARED_ROLES = ['secretary', 'admin', 'admin_manager'];
    if (primaryDept === 'Marketing' && businessRole !== 'secretary') return false;
    if (SHARED_ROLES.includes(businessRole)) return true;
    if (SHARED_DEPTS.includes(primaryDept)) return true;
    if (SHARED_POSITIONS.includes(position)) return true;
    const pos = position.toLowerCase();
    return pos.includes('telesale') || pos.includes('เทเรเซล');
  }, [companyOrgById, companyId, position, businessRole]);

  const sharedSalaryPreview = useMemo(() => {
    const amount = Math.round(Number(monthlySalary));
    if (!isSharedPayroll || !Number.isFinite(amount) || amount < 1 || activeCompanyCount < 2) return null;
    const perCompany = Math.round((amount / activeCompanyCount) * 100) / 100;
    return { master: amount, perCompany, companyCount: activeCompanyCount };
  }, [isSharedPayroll, monthlySalary, activeCompanyCount]);

  useEffect(() => {
    if (companyId && isSharedPayroll && !depositCollectionCompanyId) {
      setDepositCollectionCompanyId(companyId);
    }
  }, [companyId, isSharedPayroll, depositCollectionCompanyId]);

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
    void (async () => {
      setLoading(true);
      try {
        const [companyList, roleTemplates] = await Promise.all([
          fetchCompanies().catch(() => [] as CompanyOption[]),
          apiGet<RoleTemplate[]>('/access-control/role-templates').catch(() => [] as RoleTemplate[]),
        ]);
        setCompanies(companyList);
        setTemplates(roleTemplates);
        if (!companyId && companyList[0]) setCompanyId(companyList[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setCompanyScopeIds([companyId]);
    void apiGet<TeamOption[]>(`/organization/companies/${companyId}/teams`)
      .then((rows) => setTeams(rows ?? []))
      .catch(() => setTeams([]));
  }, [companyId]);

  useEffect(() => {
    if (phone && !username) setUsername(phone);
  }, [phone, username]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canAdd || !companyId) return;
    const salaryAmount = Math.round(Number(monthlySalary));
    if (!Number.isFinite(salaryAmount) || salaryAmount < 1) {
      setError('กรุณากรอกเงินเดือน (บาท/เดือน) เป็นจำนวนเต็มอย่างน้อย 1 บาท');
      return;
    }
    if (createLogin && password.trim().length < 8) {
      setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const primaryOrg = companyOrgById[companyId];
      const companyAssignments = activeCompanyIds.map((cid) => ({
        companyId: cid,
        department: companyOrgById[cid]?.department || undefined,
        teamId: companyOrgById[cid]?.teamId || undefined,
      }));
      const created = await onboardEmployee({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nickname: nickname.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        companyId,
        additionalCompanyIds: additionalCompanyIds.filter((id) => id !== companyId),
        companyAssignments,
        department: primaryOrg?.department || undefined,
        teamId: primaryOrg?.teamId || undefined,
        position: position.trim() || undefined,
        employmentType,
        startDate,
        monthlySalary: salaryAmount,
        depositCollectionCompanyId: isSharedPayroll
          ? (depositCollectionCompanyId || companyId)
          : undefined,
        dateOfBirth: dateOfBirth || undefined,
        createLogin,
        username: createLogin ? (username.trim() || phone.trim() || undefined) : undefined,
        password: createLogin ? password : undefined,
        businessRole: createLogin ? businessRole : undefined,
        companyScopeIds: template?.requiresCompanyScope ? companyScopeIds : [],
        teamScopeIds: template?.requiresTeamScope ? teamScopeIds : [],
      });
      navigate(`/hr/employees/${created.id}`, {
        replace: true,
        state: {
          flash: th.addEmployee.successFlash(created.globalId, created.username),
        },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!canAdd) {
    return (
      <WorkHQPage shell>
        <ErrorState error={new Error(th.addEmployee.noPermission)} />
      </WorkHQPage>
    );
  }

  if (loading) return <LoadingState label={th.addEmployee.loadingForm} />;

  return (
    <WorkHQPage shell>
      <Link to="/hr/employees" className="whq-back-link">{th.addEmployee.back}</Link>

      <WorkHQPageHeader
        title={th.addEmployee.title}
        subtitle={th.addEmployee.subtitle}
      />

      {error && <WorkHQAlert message={error} tone="error" autoDismissMs={0} />}

      <form className="whq-form-grid whq-form-grid--page" onSubmit={submit}>
        <WorkHQCard title={th.addEmployee.basicInfo}>
          <div className="whq-form-row">
            <WorkHQField label={th.addEmployee.firstName}>
              <WorkHQInput required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </WorkHQField>
            <WorkHQField label={th.addEmployee.lastName}>
              <WorkHQInput required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </WorkHQField>
          </div>
          <div className="whq-form-row">
            <WorkHQField label={th.addEmployee.nickname}>
              <WorkHQInput value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </WorkHQField>
            <WorkHQField label={th.addEmployee.phone}>
              <WorkHQInput value={phone} onChange={(e) => setPhone(e.target.value)} />
            </WorkHQField>
          </div>
          <div className="whq-form-row">
            <WorkHQField label={th.addEmployee.email}>
              <WorkHQInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </WorkHQField>
            <WorkHQField label={th.addEmployee.dateOfBirth}>
              <WorkHQDateInput value={dateOfBirth} onChange={setDateOfBirth} />
            </WorkHQField>
          </div>
        </WorkHQCard>

        <WorkHQCard title={th.addEmployee.employmentInfo}>
          <div className="whq-form-row">
            <WorkHQField label={th.addEmployee.company}>
              <WorkHQSelect required value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">{th.nav.selectCompany}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </WorkHQSelect>
            </WorkHQField>
            <WorkHQField label={th.addEmployee.startDate}>
              <WorkHQDateInput required value={startDate} onChange={setStartDate} />
            </WorkHQField>
          </div>

          {companies.length > 1 && (
            <WorkHQField label="บริษัทเพิ่มเติม (ถ้าทำงานหลายบริษัท)">
              <div className="whq-checkbox-group whq-checkbox-group--inline">
                {companies.filter((c) => c.id !== companyId).map((c) => (
                  <label key={c.id} className="whq-checkbox-row">
                    <input
                      type="checkbox"
                      checked={additionalCompanyIds.includes(c.id)}
                      onChange={(e) => {
                        setAdditionalCompanyIds((prev) => (
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter((id) => id !== c.id)
                        ));
                      }}
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            </WorkHQField>
          )}

          <EmployeePerCompanyOrgFields
            companyIds={activeCompanyIds}
            companies={companies}
            value={companyOrgById}
            onChange={updateCompanyOrg}
            position={position}
            onPositionChange={setPosition}
          />
          <div className="whq-form-row">
            <WorkHQField label={th.addEmployee.employmentType}>
              <WorkHQSelect value={employmentType} onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)}>
                <option value="full_time">{th.employmentType.full_time}</option>
                <option value="part_time">{th.employmentType.part_time}</option>
                <option value="probation">{th.employmentType.probation}</option>
              </WorkHQSelect>
              <p className="whq-field-hint">
                ประจำ/พาร์ทไทม์ = สถานะ &quot;ทำงานอยู่&quot; · ทดลองงาน = อยู่ช่วงทดลอง 90 วัน
              </p>
            </WorkHQField>
            <WorkHQField label={isSharedPayroll ? th.addEmployee.sharedMonthlySalary : th.addEmployee.monthlySalary}>
              <WorkHQInput
                type="number"
                min={1}
                required
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(e.target.value)}
                placeholder="11000"
              />
              {sharedSalaryPreview ? (
                <p className="whq-muted whq-text-sm whq-mt-sm">
                  {th.addEmployee.sharedMonthlySalaryHint(
                    sharedSalaryPreview.master,
                    sharedSalaryPreview.perCompany,
                    sharedSalaryPreview.companyCount,
                  )}
                </p>
              ) : (
                <p className="whq-muted whq-text-sm whq-mt-sm">{th.addEmployee.monthlySalaryHint}</p>
              )}
            </WorkHQField>
          </div>
          {isSharedPayroll && (
            <WorkHQField label={th.addEmployee.depositCollectionCompany}>
              <WorkHQSelect
                required
                value={depositCollectionCompanyId || companyId}
                onChange={(e) => setDepositCollectionCompanyId(e.target.value)}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </WorkHQSelect>
              <p className="whq-muted whq-text-sm whq-mt-sm">{th.addEmployee.depositCollectionCompanyHint}</p>
            </WorkHQField>
          )}
        </WorkHQCard>

        <WorkHQCard title={th.addEmployee.loginAccess}>
          <label className="whq-checkbox-row">
            <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} />
            <span>{th.addEmployee.createLogin}</span>
          </label>
          {createLogin && (
            <div className="whq-stack" style={{ marginTop: '1rem' }}>
              <div className="whq-form-row">
                <WorkHQField label={th.addEmployee.username}>
                  <WorkHQInput
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={th.addEmployee.usernamePlaceholder}
                  />
                </WorkHQField>
                <WorkHQField label={th.addEmployee.tempPassword}>
                  <WorkHQInput
                    type="password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="อย่างน้อย 8 ตัวอักษร"
                  />
                </WorkHQField>
              </div>
              <BusinessRoleScopeFields
                templates={templates}
                businessRole={businessRole}
                onRoleChange={setBusinessRole}
                companies={companies}
                teams={teams}
                companyScopeIds={companyScopeIds}
                teamScopeIds={teamScopeIds}
                onCompanyScopeChange={setCompanyScopeIds}
                onTeamScopeChange={setTeamScopeIds}
              />
              <p className="whq-muted">{th.addEmployee.accessHint}</p>
            </div>
          )}
        </WorkHQCard>

        <div className="whq-form-actions whq-form-actions--end">
          <WorkHQButton to="/hr/employees" variant="secondary">{th.addEmployee.cancel}</WorkHQButton>
          <WorkHQButton type="submit" variant="primary" disabled={saving || !companyId}>
            {saving ? th.addEmployee.submitting : th.addEmployee.submit}
          </WorkHQButton>
        </div>
      </form>
    </WorkHQPage>
  );
}
