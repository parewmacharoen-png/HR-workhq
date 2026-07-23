import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  approveRequest,
  cancelRequest,
  getRequest,
  patchRequestValues,
  rejectRequest,
  submitRequest,
  type OnboardingRequestPreview,
} from '../../api/request-platform';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  AppPageLayout,
  WorkHQErrorState,
  WorkHQPageState,
} from '../../components/workhq';
import { WorkHQButton, WorkHQCard, WorkHQInput } from '../../components/ui';
import { StatusBadge } from '../../components/StatusBadge';
import {
  RequestFormFieldRenderer,
  type DynamicFormField,
} from '../../components/requests/RequestFormFieldRenderer';

const ONBOARDING_LABEL = 'รับพนักงานใหม่';
const CANCELLABLE = new Set(['draft', 'submitted', 'in_review', 'approved']);
const NON_CANCELLABLE_TYPE_KEYS = new Set(['employee_onboarding', 'telegram_registration_review']);

function isOnboardingRequest(data: Record<string, unknown>): boolean {
  const type = data.requestType as { nameTh?: string; key?: string } | undefined;
  const name = type?.nameTh ?? '';
  return name === ONBOARDING_LABEL
    || type?.key === 'employee_onboarding'
    || type?.key === 'telegram_registration_review'
    || name.includes('รับพนักงาน');
}

function valuesFromRows(
  rows: Array<{ fieldKey: string; valueJson: unknown }> | undefined,
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const row of rows ?? []) {
    map[row.fieldKey] = row.valueJson;
  }
  return map;
}

function OnboardingPreviewCard({ preview }: { preview: OnboardingRequestPreview }) {
  const rows: Array<[string, string | null | undefined]> = [
    ['ชื่อ-นามสกุล', preview.fullName],
    ['ชื่อเล่น', preview.nickname],
    ['โทรศัพท์', preview.phone],
    ['อีเมล', preview.email],
    ['บริษัท', preview.companyName],
    ['แผนก', preview.departmentName],
    ['ทีม', preview.teamName],
    ['บทบาท', preview.businessRole],
    ['ตำแหน่ง', preview.position],
    ['ประเภทจ้าง', preview.employmentType],
    ['วันเริ่มงาน', preview.startDate],
    ['Telegram', preview.telegramUsername ? `@${preview.telegramUsername}` : preview.telegramUserId],
    ['ส่งเมื่อ', preview.submittedAt ? new Date(preview.submittedAt).toLocaleString('th-TH') : null],
  ];

  return (
    <WorkHQCard title={ONBOARDING_LABEL}>
      <dl className="whq-dl-rows">
        {rows.filter(([, v]) => v).map(([label, value]) => (
          <div key={label} className="whq-dl-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </WorkHQCard>
  );
}

export default function RequestDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [acting, setActing] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await getRequest(id);
      setData(row);
      setFormValues(valuesFromRows(row.values as Array<{ fieldKey: string; valueJson: unknown }>));
      setError(null);
      setEditing(row.status === 'draft');
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const formFields = useMemo(() => {
    const version = data?.requestTypeVersion as { formFields?: DynamicFormField[] } | undefined;
    return (version?.formFields ?? []).map((f) => ({
      ...f,
      optionsJson: Array.isArray(f.optionsJson) ? f.optionsJson : undefined,
    }));
  }, [data]);

  const status = String(data?.status ?? '');
  const typeKey = (data?.requestType as { key?: string } | undefined)?.key;
  const isDraft = status === 'draft';
  const canCancel = CANCELLABLE.has(status) && !NON_CANCELLABLE_TYPE_KEYS.has(typeKey ?? '');
  const canApprove = can('workflow:act') && status === 'in_review';
  const showOnboarding = data ? isOnboardingRequest(data) : false;

  async function handleSave() {
    if (!isDraft) return;
    setActing(true);
    setActionError(null);
    try {
      const updated = await patchRequestValues(id, formValues);
      setData(updated);
      setFormValues(valuesFromRows(updated.values as Array<{ fieldKey: string; valueJson: unknown }>));
    } catch (err) {
      setActionError(err);
    } finally {
      setActing(false);
    }
  }

  async function handleSubmit() {
    if (!isDraft) return;
    setActing(true);
    setActionError(null);
    try {
      await patchRequestValues(id, formValues);
      await submitRequest(id);
      await load();
      setEditing(false);
    } catch (err) {
      setActionError(err);
    } finally {
      setActing(false);
    }
  }

  async function handleCancel() {
    const label = status === 'draft'
      ? 'ลบแบบร่างนี้?'
      : status === 'approved'
        ? 'ยกเลิกคำขอที่อนุมัติแล้ว? ระบบจะคืนวันลา/ยกเลิก OT ที่เกี่ยวข้อง'
        : 'ยกเลิกคำขอนี้?';
    if (!window.confirm(`${label} การดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setActing(true);
    setActionError(null);
    try {
      const reason = status === 'approved'
        ? 'ยกเลิกหลังอนุมัติ — แผนเปลี่ยน'
        : status === 'draft'
          ? 'ยกเลิกแบบร่าง'
          : 'ยกเลิกคำขอ';
      await cancelRequest(id, reason);
      navigate('/requests');
    } catch (err) {
      setActionError(err);
    } finally {
      setActing(false);
    }
  }

  const pageState = loading
    ? 'loading' as const
    : error
      ? 'error' as const
      : 'success' as const;

  const referenceCode = error instanceof ApiError ? error.requestId : undefined;
  const actionReferenceCode = actionError instanceof ApiError ? actionError.requestId : undefined;

  const values = (data?.values as Array<{ fieldLabelSnapshot: string; valueText?: string; valueJson: unknown }>) ?? [];
  const steps = (data?.approvalSteps as Array<{ stepOrder: number; status: string; note?: string }>) ?? [];
  const timeline = (data?.timelineEvents as Array<{ eventType: string; message?: string; createdAt: string }>) ?? [];
  const onboardingPreview = data?.onboardingPreview as OnboardingRequestPreview | null | undefined;
  const requester = data?.requesterEmployee as { firstName?: string; lastName?: string; globalId?: string } | undefined;

  return (
    <AppPageLayout
      breadcrumb={[
        { label: 'คำขอ', href: '/requests' },
        { label: data ? String(data.title) : 'รายละเอียด' },
      ]}
      title={showOnboarding ? ONBOARDING_LABEL : String(data?.title ?? 'รายละเอียดคำขอ')}
      description={
        requester
          ? `ผู้ขอ: ${requester.firstName ?? ''} ${requester.lastName ?? ''}${requester.globalId ? ` (${requester.globalId})` : ''}`
          : undefined
      }
      primaryAction={data ? <StatusBadge status={status} /> : undefined}
      secondaryActions={(
        <WorkHQButton to="/requests" variant="secondary">กลับรายการ</WorkHQButton>
      )}
    >
      <WorkHQPageState
        state={pageState}
        error={<WorkHQErrorState referenceCode={referenceCode} onRetry={() => void load()} />}
      >
        {data && (
          <>
            {actionError != null && (
              <WorkHQErrorState
                referenceCode={actionReferenceCode}
                onRetry={() => setActionError(null)}
              />
            )}

            {showOnboarding && onboardingPreview && (
              <OnboardingPreviewCard preview={onboardingPreview} />
            )}

            {!showOnboarding && (
              <WorkHQCard title="ข้อมูลคำร้อง">
                {isDraft && editing && formFields.length > 0 ? (
                  <div className="whq-form-grid whq-form-grid--narrow">
                    {formFields.map((field) => (
                      <RequestFormFieldRenderer
                        key={field.key}
                        field={field}
                        value={formValues[field.key]}
                        onChange={(key, value) => setFormValues((prev) => ({ ...prev, [key]: value }))}
                      />
                    ))}
                  </div>
                ) : (
                  <ul className="whq-value-list">
                    {values.length === 0 && <li className="whq-muted">ยังไม่มีข้อมูล — กดแก้ไขเพื่อกรอก</li>}
                    {values.map((v, i) => (
                      <li key={i}>
                        <strong>{v.fieldLabelSnapshot}:</strong>{' '}
                        {v.valueText ?? JSON.stringify(v.valueJson)}
                      </li>
                    ))}
                  </ul>
                )}
              </WorkHQCard>
            )}

            {steps.length > 0 && (
              <WorkHQCard title="ขั้นตอนอนุมัติ">
                <ol>
                  {steps.map((s) => (
                    <li key={s.stepOrder}>
                      ขั้น {s.stepOrder} — {s.status}{s.note ? `: ${s.note}` : ''}
                    </li>
                  ))}
                </ol>
              </WorkHQCard>
            )}

            {timeline.length > 0 && (
              <WorkHQCard title="ไทม์ไลน์">
                <ul className="whq-timeline-list">
                  {timeline.map((t, i) => (
                    <li key={i}>
                      {new Date(t.createdAt).toLocaleString('th-TH')} — {t.message ?? t.eventType}
                    </li>
                  ))}
                </ul>
              </WorkHQCard>
            )}

            <div className="whq-action-row" style={{ marginTop: '1rem', flexWrap: 'wrap' }}>
              {isDraft && (
                <>
                  {editing ? (
                    <>
                      <WorkHQButton
                        type="button"
                        variant="primary"
                        disabled={acting}
                        onClick={() => void handleSave()}
                      >
                        บันทึก
                      </WorkHQButton>
                      <WorkHQButton
                        type="button"
                        variant="primary"
                        disabled={acting}
                        onClick={() => void handleSubmit()}
                      >
                        ส่งคำขอ
                      </WorkHQButton>
                      {formFields.length > 0 && (
                        <WorkHQButton
                          type="button"
                          variant="secondary"
                          disabled={acting}
                          onClick={() => {
                            setEditing(false);
                            setFormValues(valuesFromRows(data.values as Array<{ fieldKey: string; valueJson: unknown }>));
                          }}
                        >
                          ยกเลิกการแก้ไข
                        </WorkHQButton>
                      )}
                    </>
                  ) : (
                    <WorkHQButton
                      type="button"
                      variant="secondary"
                      disabled={acting}
                      onClick={() => setEditing(true)}
                    >
                      แก้ไข
                    </WorkHQButton>
                  )}
                </>
              )}

              {canCancel && (
                <WorkHQButton
                  type="button"
                  variant="secondary"
                  disabled={acting}
                  onClick={() => void handleCancel()}
                >
                  {status === 'draft' ? 'ลบแบบร่าง' : 'ยกเลิกคำขอ'}
                </WorkHQButton>
              )}

              {canApprove && (
                <>
                  <WorkHQButton
                    type="button"
                    variant="primary"
                    disabled={acting}
                    onClick={async () => {
                      setActing(true);
                      try {
                        await approveRequest(id);
                        await load();
                      } finally {
                        setActing(false);
                      }
                    }}
                  >
                    อนุมัติ
                  </WorkHQButton>
                  <WorkHQInput
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="เหตุผลไม่อนุมัติ (อย่างน้อย 3 ตัวอักษร)"
                  />
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    disabled={acting || rejectNote.trim().length < 3}
                    onClick={async () => {
                      setActing(true);
                      try {
                        await rejectRequest(id, rejectNote.trim());
                        await load();
                      } finally {
                        setActing(false);
                      }
                    }}
                  >
                    ไม่อนุมัติ
                  </WorkHQButton>
                </>
              )}
            </div>

            {status === 'approved' && canCancel && (
              <p className="whq-muted" style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                หากแผนเปลี่ยน (เช่น ไม่ลา/ไม่ทำ OT แล้ว) สามารถกดยกเลิกคำขอได้ — OT ที่รวมในเงินเดือนแล้วต้องติดต่อ HR
              </p>
            )}
          </>
        )}
      </WorkHQPageState>
    </AppPageLayout>
  );
}
