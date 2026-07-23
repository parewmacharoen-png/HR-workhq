import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiPost, ApiError } from '../../api/client';
import { fetchEmployeeList } from '../../api/employees';
import { listRequestTypes } from '../../api/request-platform';
import { useAuth } from '../../context/AuthContext';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import {
  AppPageLayout,
  WorkHQPageState,
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPermissionDenied,
} from '../../components/workhq';
import {
  WorkHQButton,
  WorkHQCard,
  WorkHQField,
  WorkHQInput,
  WorkHQDateInput,
  WorkHQSelect,
} from '../../components/ui';
import { WorkHQPracticalErrorState } from '../../components/ui/WorkHQPracticalErrorState';

type CreateMode = 'self' | 'employee' | 'hr_manual';

export default function CreateRequestPage() {
  const { user, can } = useAuth();
  const { companyId, isAllCompanies: allCompanies, hasCompanyScope } = useCompanyScope();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preTypeId = searchParams.get('typeId') ?? '';
  const preEmployeeId = searchParams.get('employeeId') ?? '';
  const preTypeKey = searchParams.get('typeKey') ?? '';
  const preMode = searchParams.get('mode') as CreateMode | null;

  const [mode, setMode] = useState<CreateMode>(
    preMode === 'employee' || preMode === 'hr_manual' || preEmployeeId ? 'hr_manual' : 'self',
  );
  const [employees, setEmployees] = useState<Array<{ id: string; label: string }>>([]);
  const [types, setTypes] = useState<Array<{ id: string; nameTh: string; key: string }>>([]);
  const [employeeId, setEmployeeId] = useState(preEmployeeId);
  const [typeId, setTypeId] = useState(preTypeId);
  const [reason, setReason] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const canCreate = can('workflow:read');

  useEffect(() => {
    if (!companyId || allCompanies) return;
    void (async () => {
      setLoading(true);
      try {
        const [empRes, typeRows] = await Promise.all([
          fetchEmployeeList({ companyId, status: 'active' }),
          listRequestTypes(companyId),
        ]);
        setEmployees(empRes.items.map((e) => ({
          id: e.id,
          label: `${e.globalId} ${e.firstName} ${e.lastName}`,
        })));
        setTypes(typeRows.map((t) => ({
          id: String(t.id),
          nameTh: String(t.nameTh ?? t.name ?? '—'),
          key: String((t as { key?: string }).key ?? ''),
        })));
        if (preTypeKey) {
          const match = typeRows.find((t) => String((t as { key?: string }).key ?? '') === preTypeKey);
          if (match) setTypeId(String(match.id));
        }
        if (preEmployeeId) setEmployeeId(preEmployeeId);
        setError(null);
      } catch (e) {
        setError(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, allCompanies, preEmployeeId, preTypeKey]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!companyId || allCompanies || !typeId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const draft = await apiPost<{ id: string }>(
        `/request-types/${typeId}/requests/draft?companyId=${encodeURIComponent(companyId)}`,
        {},
      );
      navigate(`/requests/${draft.id}`);
    } catch (err) {
      setSubmitError(err);
    } finally {
      setSubmitting(false);
    }
  }

  const pageState = !canCreate
    ? 'permissionDenied' as const
    : !hasCompanyScope || allCompanies
      ? 'empty' as const
      : loading
        ? 'loading' as const
        : error
          ? 'error' as const
          : 'success' as const;


  return (
    <AppPageLayout
      breadcrumb={[
        { label: 'คำขอ', href: '/requests' },
        { label: 'สร้างคำขอ' },
      ]}
      title="➕ สร้างคำขอ"
      description="เลือกประเภทและผู้เกี่ยวข้อง — ระบบจะเลือกเส้นทางอนุมัติให้อัตโนมัติ"
      primaryAction={<WorkHQButton to="/requests" variant="secondary">กลับ</WorkHQButton>}
    >
      <WorkHQPageState
        state={pageState}
        permissionDenied={<WorkHQPermissionDenied title="ไม่มีสิทธิ์สร้างคำขอ" />}
        empty={(
          <WorkHQEmptyState
            icon="🏢"
            title="เลือกบริษัท"
            description="เลือกบริษัทจากด้านบนก่อนสร้างคำขอ"
          />
        )}
        error={<WorkHQPracticalErrorState error={error} />}
      >
        <WorkHQCard>
          <div className="whq-tab-nav" style={{ marginBottom: '1.25rem' }}>
            {([
              ['self', 'สร้างให้ตัวเอง'],
              ['employee', 'สร้างให้พนักงาน'],
              ['hr_manual', 'HR สร้างแทน'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`whq-tab-nav-item${mode === id ? ' active' : ''}`}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="whq-form-grid whq-form-grid--narrow">
            {(mode === 'employee' || mode === 'hr_manual') && (
              <WorkHQField label="พนักงาน *">
                <WorkHQSelect value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                  <option value="">— เลือกพนักงาน —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.label}</option>
                  ))}
                </WorkHQSelect>
              </WorkHQField>
            )}

            <WorkHQField label="ประเภทคำขอ *">
              <WorkHQSelect value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
                <option value="">— เลือกประเภท —</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.nameTh}</option>
                ))}
              </WorkHQSelect>
            </WorkHQField>

            <WorkHQField label="วันที่ / เวลา">
              <WorkHQDateInput value={eventDate} onChange={setEventDate} />
            </WorkHQField>

            <WorkHQField label="เหตุผล / รายละเอียด">
              <WorkHQInput
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="อธิบายเหตุผลโดยย่อ"
              />
            </WorkHQField>

            <WorkHQField label="ไฟล์แนบ">
              <WorkHQInput type="file" disabled />
              <span className="whq-muted" style={{ fontSize: '0.85rem' }}>อัปโหลดได้ในหน้ารายละเอียดคำขอ</span>
            </WorkHQField>

            <p className="whq-muted" style={{ fontSize: '0.9rem' }}>
              เส้นทางอนุมัติ: ระบบเลือกตามประเภทคำขอและโครงสร้างทีมอัตโนมัติ
              {mode === 'self' && user?.employeeId && ` · ผู้ขอ: ${user.displayName ?? user.username}`}
            </p>

            {submitError != null && (
              <WorkHQErrorState
                referenceCode={submitError instanceof ApiError ? submitError.requestId : undefined}
                onRetry={() => setSubmitError(null)}
              />
            )}

            <div className="whq-action-row" style={{ justifyContent: 'flex-start' }}>
              <WorkHQButton type="submit" variant="primary" disabled={submitting || !typeId}>
                {submitting ? 'กำลังสร้าง…' : 'สร้างคำขอและกรอกรายละเอียด'}
              </WorkHQButton>
              <WorkHQButton to="/requests" variant="secondary">ยกเลิก</WorkHQButton>
            </div>
          </form>
        </WorkHQCard>
      </WorkHQPageState>
    </AppPageLayout>
  );
}
