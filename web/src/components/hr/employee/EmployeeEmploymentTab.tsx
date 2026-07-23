import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../api/client';
import { fetchCompanies, type CompanyOption } from '../../../api/client';
import { fetchEmployeeList } from '../../../api/employees';
import {
  fetchEmployeeEmployment,
  isEmploymentRoleEditorEnabled,
  updateEmployeeEmployment,
  type EmployeeCompanyAssignment,
  type EmployeeEmploymentData,
  type EmployeeEmploymentResponse,
  type UpdateEmployeeEmploymentPayload,
} from '../../../api/employee-employment';
import {
  employmentStatusLabel,
  employmentTypeLabel,
  adminCommissionOfficeTypeLabel,
  roleLabel,
  workCategoryLabel,
} from '../../../i18n/th-labels';
import { formatThaiDate, NO_DATA } from '../../../lib/employee-date-utils';
import { formatEmployeeDateDdMmYyyy } from '../../../i18n/employee-dates';
import {
  EMPLOYEE_POSITION_OPTIONS,
  departmentLabel,
  positionLabel,
} from '../../../lib/employee-org-options';
import {
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQLoadingState,
  WorkHQPageState,
} from '../../workhq';
import { WorkHQButton, WorkHQCard, WorkHQField, WorkHQInput, WorkHQSelect } from '../../ui';
import { WorkHQDateInput } from '../../ui/WorkHQDateInput';
import { EmployeeShiftScheduleCard } from './EmployeeShiftScheduleCard';
import { EmployeeBusinessRoleEditor } from './EmployeeBusinessRoleEditor';
import {
  EmployeePerCompanyOrgFields,
  type CompanyOrgSelection,
} from '../EmployeePerCompanyOrgFields';

const EMPLOYMENT_STATUSES = ['probation', 'active', 'suspended', 'terminated'] as const;
const EMPLOYMENT_TYPES = ['permanent', 'full_time', 'probation', 'contract', 'part_time'] as const;
const WORK_LOCATIONS = ['office', 'wfh'] as const;
const SHIFTS = ['day', 'night'] as const;
const OFFICE_TYPES = ['front_office', 'back_office'] as const;

function showAdminCommissionOfficeType(department: string | null | undefined): boolean {
  return (department ?? '').trim().toLowerCase() === 'admin';
}

type EmploymentFormState = EmployeeEmploymentData & {
  supervisorId: string;
};

function buildCompanyOrgState(
  employment: EmployeeEmploymentResponse,
): { companyIds: string[]; orgById: Record<string, CompanyOrgSelection> } {
  const rows: EmployeeCompanyAssignment[] = employment.companyAssignments?.length
    ? employment.companyAssignments
    : employment.employment.companyId
      ? [{
          companyId: employment.employment.companyId,
          companyName: employment.employment.companyName ?? '',
          companyCode: '',
          teamId: employment.employment.teamId,
          teamName: employment.employment.teamName,
          isPrimary: true,
        }]
      : [];
  const department = employment.employment.department ?? '';
  return {
    companyIds: rows.map((row) => row.companyId),
    orgById: Object.fromEntries(rows.map((row) => [
      row.companyId,
      { department, teamId: row.teamId ?? '' },
    ])),
  };
}

function companyAssignmentsLabel(
  rows: EmployeeCompanyAssignment[] | undefined,
  fallbackName: string | null,
): string {
  if (rows?.length) {
    return rows.map((row) => {
      const team = row.teamName ? ` · ${row.teamName.replace(/^Team /, 'ทีม ')}` : '';
      const primary = row.isPrimary ? ' (หลัก)' : '';
      return `${row.companyName}${primary}${team}`;
    }).join(' · ');
  }
  return fallbackName ?? NO_DATA;
}

function toFormState(response: EmployeeEmploymentResponse): EmploymentFormState {
  return {
    ...response.employment,
    supervisorId: response.supervisor?.id ?? '',
  };
}

function refLabel(ref: { globalId: string; name: string } | null | undefined): string {
  if (!ref) return NO_DATA;
  return `${ref.name} (${ref.globalId})`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="whq-info-row">
      <span className="whq-info-label">{label}</span>
      <span className="whq-info-value">{value || NO_DATA}</span>
    </div>
  );
}

function FieldInput({
  label,
  value,
  editing,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  if (!editing) {
    const display = type === 'date' && value ? formatEmployeeDateDdMmYyyy(value) : value;
    return <InfoRow label={label} value={display} />;
  }
  if (type === 'date') {
    return (
      <WorkHQField label={label}>
        <WorkHQDateInput value={value} disabled={disabled} onChange={onChange} />
      </WorkHQField>
    );
  }
  return (
    <WorkHQField label={label}>
      <WorkHQInput
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </WorkHQField>
  );
}

interface EmployeeEmploymentTabProps {
  employeeId: string;
  companyId: string;
  canEdit: boolean;
  viewerBusinessRole?: string | null;
  onReload: () => void;
}

export function EmployeeEmploymentTab({
  employeeId,
  companyId,
  canEdit,
  viewerBusinessRole,
  onReload,
}: EmployeeEmploymentTabProps) {
  const [data, setData] = useState<EmployeeEmploymentResponse | null>(null);
  const [form, setForm] = useState<EmploymentFormState | null>(null);
  const [baseline, setBaseline] = useState<EmploymentFormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [supervisorOptions, setSupervisorOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [activeCompanyIds, setActiveCompanyIds] = useState<string[]>([]);
  const [companyOrgById, setCompanyOrgById] = useState<Record<string, CompanyOrgSelection>>({});
  const [companyOrgBaseline, setCompanyOrgBaseline] = useState<Record<string, CompanyOrgSelection>>({});
  const [activeCompanyBaseline, setActiveCompanyBaseline] = useState<string[]>([]);

  const canEditBusinessRole = isEmploymentRoleEditorEnabled(data?.roleEditor, viewerBusinessRole);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const employment = await fetchEmployeeEmployment(employeeId, companyId);
      setData(employment);
      const nextForm = toFormState(employment);
      setForm(nextForm);
      setBaseline(nextForm);
      const orgState = buildCompanyOrgState(employment);
      const ids = orgState.companyIds.length ? orgState.companyIds : [companyId];
      setActiveCompanyIds(ids);
      setActiveCompanyBaseline(ids);
      setCompanyOrgById(orgState.orgById);
      setCompanyOrgBaseline(orgState.orgById);
    } catch (err) {
      setError(err);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [employeeId, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!editing || !form) return;
    void fetchCompanies()
      .then(setCompanies)
      .catch(() => setCompanies([]));
    void fetchEmployeeList({ companyId })
      .then((res) => setSupervisorOptions(
        res.items
          .filter((e) => e.id !== employeeId)
          .map((e) => ({ id: e.id, label: `${e.globalId} — ${e.firstName} ${e.lastName}` })),
      ))
      .catch(() => setSupervisorOptions([]));
  }, [editing, companyId, employeeId, form]);

  const primaryCompanyId = form?.companyId ?? companyId;

  const orderedActiveCompanyIds = useMemo(() => {
    const ids = [...activeCompanyIds];
    if (primaryCompanyId && !ids.includes(primaryCompanyId)) {
      ids.unshift(primaryCompanyId);
    }
    return ids;
  }, [activeCompanyIds, primaryCompanyId]);

  function updateCompanyOrg(cid: string, patch: Partial<CompanyOrgSelection>) {
    setCompanyOrgById((prev) => {
      const current = prev[cid] ?? { department: '', teamId: '' };
      const next = { ...current, ...patch };
      if (patch.department !== undefined && cid === primaryCompanyId) {
        setForm((f) => (f ? { ...f, department: patch.department || null, teamId: patch.teamId ?? f.teamId } : f));
      }
      if (patch.teamId !== undefined && cid === primaryCompanyId) {
        setForm((f) => (f ? { ...f, teamId: patch.teamId || null } : f));
      }
      return { ...prev, [cid]: next };
    });
  }

  function toggleAdditionalCompany(cid: string, checked: boolean) {
    if (cid === primaryCompanyId) return;
    setActiveCompanyIds((prev) => {
      if (checked) return prev.includes(cid) ? prev : [...prev, cid];
      return prev.filter((id) => id !== cid);
    });
    if (checked) {
      setCompanyOrgById((prev) => ({
        ...prev,
        [cid]: prev[cid] ?? { department: form?.department ?? '', teamId: '' },
      }));
    }
  }

  const dirty = useMemo(
    () => editing && baseline && form && (
      JSON.stringify(form) !== JSON.stringify(baseline)
      || JSON.stringify(activeCompanyIds) !== JSON.stringify(activeCompanyBaseline)
      || JSON.stringify(companyOrgById) !== JSON.stringify(companyOrgBaseline)
    ),
    [editing, baseline, form, activeCompanyIds, activeCompanyBaseline, companyOrgById, companyOrgBaseline],
  );

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function updateField<K extends keyof EmploymentFormState>(key: K, value: EmploymentFormState[K]) {
    setForm((prev) => {
      if (!prev) return prev;
      if (key === 'department' && value !== prev.department) {
        return { ...prev, department: value as EmploymentFormState['department'], teamId: null };
      }
      return { ...prev, [key]: value };
    });
  }

  function startEdit() {
    if (!form || !data) return;
    const orgState = buildCompanyOrgState(data);
    const ids = orgState.companyIds.length ? orgState.companyIds : [companyId];
    setActiveCompanyIds(ids);
    setActiveCompanyBaseline(ids);
    setCompanyOrgById(orgState.orgById);
    setCompanyOrgBaseline(orgState.orgById);
    setBaseline(form);
    setEditing(true);
    setSaveError(null);
  }

  function cancelEdit() {
    if (dirty && !window.confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการยกเลิกหรือไม่?')) {
      return;
    }
    if (baseline) setForm(baseline);
    setActiveCompanyIds(activeCompanyBaseline);
    setCompanyOrgById(companyOrgBaseline);
    setEditing(false);
    setSaveError(null);
  }

  async function saveEmployment() {
    if (!form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const primaryOrg = companyOrgById[primaryCompanyId];
      const companyAssignments = orderedActiveCompanyIds.map((cid) => ({
        companyId: cid,
        department: companyOrgById[cid]?.department || undefined,
        teamId: companyOrgById[cid]?.teamId || null,
      }));
      const updated = await updateEmployeeEmployment(employeeId, {
        companyAssignments,
        department: primaryOrg?.department || form.department || undefined,
        teamId: primaryOrg?.teamId || form.teamId || undefined,
        position: form.position || undefined,
        employmentType: form.employmentType || undefined,
        employmentStatus: form.employmentStatus as UpdateEmployeeEmploymentPayload['employmentStatus'],
        joinDate: form.joinDate || undefined,
        probationEndDate: form.probationEndDate || undefined,
        resignDate: form.resignDate || undefined,
        supervisorId: form.supervisorId || undefined,
        workLocation: (form.workLocation as 'office' | 'wfh' | null) ?? undefined,
        shift: (form.shift as 'day' | 'night' | null) ?? undefined,
        officeType: (form.officeType as 'front_office' | 'back_office' | null) ?? undefined,
      }, companyId);
      setData(updated);
      const nextForm = toFormState(updated);
      setForm(nextForm);
      setBaseline(nextForm);
      const orgState = buildCompanyOrgState(updated);
      const ids = orgState.companyIds.length ? orgState.companyIds : [companyId];
      setActiveCompanyIds(ids);
      setActiveCompanyBaseline(ids);
      setCompanyOrgById(orgState.orgById);
      setCompanyOrgBaseline(orgState.orgById);
      setEditing(false);
      onReload();
    } catch {
      setSaveError('ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  }

  async function refetchEmployment() {
    await load({ silent: true });
    onReload();
  }

  const pageState = loading
    ? 'loading' as const
    : error
      ? 'error' as const
      : !data || !form
        ? 'empty' as const
        : 'success' as const;

  return (
    <WorkHQPageState
      state={pageState}
      loading={<WorkHQLoadingState label="กำลังโหลดข้อมูลการทำงาน…" />}
      error={(
        <WorkHQErrorState
          referenceCode={error instanceof ApiError ? error.requestId : undefined}
          onRetry={() => void load()}
        />
      )}
      empty={<WorkHQEmptyState title={NO_DATA} description="ไม่พบข้อมูลการทำงาน" />}
    >
      {data && form && (
        <div className="whq-employment-tab" data-testid="employment-tab">
          {canEditBusinessRole && (
            <WorkHQCard title="บทบาทในระบบ" className="whq-detail-card whq-role-card">
              <EmployeeBusinessRoleEditor
                employeeId={employeeId}
                companyId={companyId}
                currentRole={data.employment.businessRole}
                canAssignOwnerRole={data.roleEditor?.canAssignOwnerRole === true || viewerBusinessRole === 'owner'}
                onSaved={refetchEmployment}
              />
            </WorkHQCard>
          )}

          <WorkHQCard title="ข้อมูลการทำงาน" className="whq-detail-card">
            <div className="whq-employment-card-toolbar">
              {canEdit && !editing && (
                <WorkHQButton type="button" variant="primary" data-testid="employment-edit-button" onClick={startEdit}>
                  แก้ไข
                </WorkHQButton>
              )}
              {canEdit && editing && (
                <>
                  <WorkHQButton
                    type="button"
                    variant="primary"
                    disabled={saving}
                    data-testid="employment-save-button"
                    onClick={() => void saveEmployment()}
                  >
                    บันทึก
                  </WorkHQButton>
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    disabled={saving}
                    data-testid="employment-cancel-button"
                    onClick={cancelEdit}
                  >
                    ยกเลิก
                  </WorkHQButton>
                </>
              )}
            </div>
            {saveError && <p className="whq-error">{saveError}</p>}

            <div className="whq-detail-grid whq-detail-grid--employment">
              <section className="whq-employment-section">
                <h3 className="whq-employment-section-title">องค์กร</h3>
                <InfoRow label="รหัสพนักงาน" value={form.employeeCode} />
                {editing ? (
                  <>
                    <InfoRow
                      label="บริษัทหลัก"
                      value={companies.find((c) => c.id === primaryCompanyId)?.name ?? form.companyName ?? NO_DATA}
                    />
                    {companies.length > 1 && (
                      <WorkHQField label="บริษัทเพิ่มเติม (ถ้าทำงานหลายบริษัท)">
                        <div className="whq-checkbox-group whq-checkbox-group--inline">
                          {companies.filter((c) => c.id !== primaryCompanyId).map((c) => (
                            <label key={c.id} className="whq-checkbox-row">
                              <input
                                type="checkbox"
                                checked={activeCompanyIds.includes(c.id)}
                                onChange={(e) => toggleAdditionalCompany(c.id, e.target.checked)}
                              />
                              <span>{c.name}</span>
                            </label>
                          ))}
                        </div>
                      </WorkHQField>
                    )}
                    <EmployeePerCompanyOrgFields
                      companyIds={orderedActiveCompanyIds}
                      companies={companies}
                      value={companyOrgById}
                      onChange={updateCompanyOrg}
                      position={form.position ?? ''}
                      onPositionChange={(v) => updateField('position', v || null)}
                    />
                  </>
                ) : (
                  <>
                    <InfoRow
                      label="บริษัท"
                      value={companyAssignmentsLabel(data.companyAssignments, form.companyName)}
                    />
                    <InfoRow label="แผนก" value={departmentLabel(form.department ?? '') || form.department || NO_DATA} />
                    <InfoRow label="ทีม" value={form.teamName ?? NO_DATA} />
                    <InfoRow label="ตำแหน่ง" value={positionLabel(form.position ?? '') || form.position || NO_DATA} />
                  </>
                )}
                {!canEditBusinessRole && !editing && (
                  <InfoRow
                    label="บทบาท"
                    value={data.employment.businessRole ? roleLabel(data.employment.businessRole) : NO_DATA}
                  />
                )}
              </section>

              <section className="whq-employment-section">
                <h3 className="whq-employment-section-title">สัญญาจ้าง</h3>
                {editing ? (
                  <WorkHQField label="ประเภทการจ้าง">
                    <WorkHQSelect
                      value={form.employmentType ?? ''}
                      onChange={(e) => updateField('employmentType', e.target.value || null)}
                    >
                      <option value="">{NO_DATA}</option>
                      {EMPLOYMENT_TYPES.map((t) => (
                        <option key={t} value={t}>{employmentTypeLabel(t)}</option>
                      ))}
                    </WorkHQSelect>
                  </WorkHQField>
                ) : (
                  <InfoRow label="ประเภทการจ้าง" value={employmentTypeLabel(form.employmentType)} />
                )}
                {editing ? (
                  <WorkHQField label="สถานะการจ้าง">
                    <WorkHQSelect
                      value={form.employmentStatus}
                      onChange={(e) => updateField('employmentStatus', e.target.value)}
                    >
                      {EMPLOYMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>{employmentStatusLabel(s)}</option>
                      ))}
                    </WorkHQSelect>
                  </WorkHQField>
                ) : (
                  <InfoRow label="สถานะการจ้าง" value={employmentStatusLabel(form.employmentStatus)} />
                )}
                <FieldInput
                  label="วันเริ่มงาน"
                  value={form.joinDate}
                  editing={editing}
                  type="date"
                  onChange={(v) => updateField('joinDate', v)}
                />
                <FieldInput
                  label="วันสิ้นสุดทดลองงาน"
                  value={form.probationEndDate ?? ''}
                  editing={editing}
                  type="date"
                  onChange={(v) => updateField('probationEndDate', v || null)}
                />
                <InfoRow
                  label="วันยืนยันพนักงาน"
                  value={form.confirmedDate ? formatThaiDate(form.confirmedDate) : NO_DATA}
                />
                <FieldInput
                  label="วันลาออก"
                  value={form.resignDate ?? ''}
                  editing={editing}
                  type="date"
                  onChange={(v) => updateField('resignDate', v || null)}
                />
              </section>

              <section className="whq-employment-section">
                <h3 className="whq-employment-section-title">สายงาน & กะ</h3>
                {editing ? (
                  <WorkHQField label="ผู้บังคับบัญชา">
                    <WorkHQSelect
                      value={form.supervisorId}
                      onChange={(e) => updateField('supervisorId', e.target.value)}
                    >
                      <option value="">{NO_DATA}</option>
                      {supervisorOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </WorkHQSelect>
                  </WorkHQField>
                ) : (
                  <InfoRow label="ผู้บังคับบัญชา" value={refLabel(data.supervisor)} />
                )}
                <InfoRow label="หัวหน้าใหญ่" value={refLabel(data.bigLeader)} />
                <InfoRow label="หัวหน้าย่อย" value={refLabel(data.subLeader)} />
                {editing ? (
                  <WorkHQField label="กะงาน">
                    <WorkHQSelect
                      value={form.shift ?? ''}
                      onChange={(e) => updateField('shift', e.target.value || null)}
                    >
                      <option value="">{NO_DATA}</option>
                      {SHIFTS.map((s) => (
                        <option key={s} value={s}>{s === 'day' ? 'กลางวัน' : 'กลางคืน'}</option>
                      ))}
                    </WorkHQSelect>
                  </WorkHQField>
                ) : (
                  <InfoRow label="กะงาน" value={form.shift ? (form.shift === 'day' ? 'กลางวัน' : 'กลางคืน') : NO_DATA} />
                )}
                {showAdminCommissionOfficeType(form.department) && (
                  editing ? (
                    <WorkHQField label="ค่าคอมแอดมิน (Front/Back)">
                      <WorkHQSelect
                        value={form.officeType ?? 'front_office'}
                        onChange={(e) => updateField(
                          'officeType',
                          e.target.value as EmploymentFormState['officeType'],
                        )}
                      >
                        {OFFICE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {adminCommissionOfficeTypeLabel(type)}
                          </option>
                        ))}
                      </WorkHQSelect>
                      <p className="whq-muted" style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
                        Front = แบ่ง Pool B · Back = รับเฉพาะ Pool A (หลังบ้าน)
                      </p>
                    </WorkHQField>
                  ) : (
                    <InfoRow
                      label="ค่าคอมแอดมิน (Front/Back)"
                      value={adminCommissionOfficeTypeLabel(form.officeType)}
                    />
                  )
                )}
                {editing ? (
                  <WorkHQField label="สถานที่ทำงาน (ค่าเริ่มต้น)">
                    <WorkHQSelect
                      value={form.workLocation ?? ''}
                      onChange={(e) => updateField('workLocation', e.target.value || null)}
                    >
                      <option value="">{NO_DATA}</option>
                      {WORK_LOCATIONS.map((loc) => (
                        <option key={loc} value={loc}>{workCategoryLabel(loc)}</option>
                      ))}
                    </WorkHQSelect>
                    <p className="whq-muted" style={{ marginTop: '0.35rem', fontSize: '0.85rem' }}>
                      ใช้เป็นค่าเริ่มต้นตอนเช็กอิน · ค่าอาหารและค่าข้ามนับจากวันออฟฟิศจริง (WFH ไม่ได้)
                    </p>
                  </WorkHQField>
                ) : (
                  <InfoRow label="สถานที่ทำงาน (ค่าเริ่มต้น)" value={workCategoryLabel(form.workLocation)} />
                )}
              </section>
            </div>
          </WorkHQCard>

          <EmployeeShiftScheduleCard
            employeeId={employeeId}
            companyId={companyId}
            canEdit={canEdit}
          />
        </div>
      )}
    </WorkHQPageState>
  );
}
