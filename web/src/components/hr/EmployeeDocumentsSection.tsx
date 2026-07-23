import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { previewEmployeeDocument } from '../../api/document-center';
import { NO_DATA } from '../../lib/employee-date-utils';
import type { EmployeeDetailTabId } from './employee-detail/employee-detail-tabs';
import { WorkHQButton, WorkHQCard } from '../ui';

interface DocSummary {
  documents: Array<{ id: string; fileName: string; docType: string; expiresAt?: string }>;
  requiredMissing: string[];
  expiring: Array<{ id: string; fileName: string; expiresAt?: string }>;
  downloadHistory: Array<{ documentId: string | null; action: string; occurredAt: string }>;
}

interface EmployeeDocumentsSectionProps {
  employeeId: string;
  canEdit?: boolean;
  onTabChange?: (tab: EmployeeDetailTabId) => void;
  onOpenTelegram?: () => void;
}

const DOC_TYPE_TH: Record<string, string> = {
  national_id: 'บัตรประชาชน',
  passport: 'หนังสือเดินทาง',
  contract: 'สัญญาจ้าง',
  resume: 'ประวัติการทำงาน',
};

function docTypeLabel(type: string): string {
  return DOC_TYPE_TH[type] ?? type;
}

export function EmployeeDocumentsSection({
  employeeId,
  canEdit = false,
  onTabChange,
  onOpenTelegram,
}: EmployeeDocumentsSectionProps) {
  const [summary, setSummary] = useState<DocSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void apiGet<DocSummary>(`/documents/employees/${employeeId}/summary`)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading) {
    return <p className="whq-muted">กำลังโหลดเอกสาร…</p>;
  }

  if (!summary) {
    return <p className="whq-muted">ไม่สามารถโหลดข้อมูลเอกสารได้</p>;
  }

  return (
    <div className="whq-documents-tab">
      {(canEdit && (onTabChange || onOpenTelegram)) && (
        <div className="whq-tab-toolbar">
          {onTabChange && (
            <WorkHQButton type="button" variant="primary" onClick={() => onTabChange('personal')}>
              อัปโหลดบัตร / หนังสือเดินทาง
            </WorkHQButton>
          )}
          {onOpenTelegram && (
            <WorkHQButton type="button" variant="secondary" onClick={onOpenTelegram}>
              เชื่อม Telegram
            </WorkHQButton>
          )}
        </div>
      )}

      <div className="whq-detail-grid">
        <WorkHQCard title="เอกสารทั้งหมด" className="whq-detail-card">
          {summary.documents.length === 0 ? (
            <p className="whq-muted">ยังไม่มีเอกสาร — อัปโหลดได้ที่แท็บข้อมูลส่วนตัว</p>
          ) : (
            <ul className="whq-doc-list">
              {summary.documents.slice(0, 12).map((d) => (
                <li key={d.id}>
                  <WorkHQButton
                    type="button"
                    variant="ghost"
                    className="whq-doc-link-btn"
                    onClick={() => {
                      setPreviewError(null);
                      void previewEmployeeDocument(d.id).catch(() => {
                        setPreviewError('เปิดไฟล์ไม่สำเร็จ กรุณาลองใหม่');
                      });
                    }}
                  >
                    {d.fileName}
                  </WorkHQButton>
                  <span className="whq-muted"> · {docTypeLabel(d.docType)}</span>
                  {d.expiresAt && (
                    <span className="whq-muted"> · หมดอายุ {d.expiresAt.slice(0, 10)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {previewError && <p className="whq-error">{previewError}</p>}
        </WorkHQCard>

        <WorkHQCard title="เอกสารที่ยังขาด" className="whq-detail-card">
          {summary.requiredMissing.length === 0 ? (
            <p className="whq-muted">ครบเอกสารที่จำเป็นแล้ว</p>
          ) : (
            <ul className="whq-doc-list">
              {summary.requiredMissing.map((t) => (
                <li key={t}>{docTypeLabel(t)}</li>
              ))}
            </ul>
          )}
          {canEdit && summary.requiredMissing.length > 0 && onTabChange && (
            <WorkHQButton
              type="button"
              variant="secondary"
              style={{ marginTop: '0.75rem' }}
              onClick={() => onTabChange('personal')}
            >
              ไปอัปโหลดเอกสาร
            </WorkHQButton>
          )}
        </WorkHQCard>

        <WorkHQCard title="ใกล้หมดอายุ" className="whq-detail-card">
          {summary.expiring.length === 0 ? (
            <p className="whq-muted">ไม่มีเอกสารใกล้หมดอายุ</p>
          ) : (
            <ul className="whq-doc-list">
              {summary.expiring.map((d) => (
                <li key={d.id}>
                  {d.fileName} — {d.expiresAt?.slice(0, 10) ?? NO_DATA}
                </li>
              ))}
            </ul>
          )}
        </WorkHQCard>

        <WorkHQCard title="ประวัติการดาวน์โหลด" className="whq-detail-card">
          {summary.downloadHistory.length === 0 ? (
            <p className="whq-muted">ยังไม่มีประวัติ</p>
          ) : (
            <ul className="whq-doc-list">
              {summary.downloadHistory.slice(0, 10).map((h, i) => (
                <li key={`${h.documentId}-${i}`}>
                  {h.action} · {new Date(h.occurredAt).toLocaleString('th-TH')}
                </li>
              ))}
            </ul>
          )}
        </WorkHQCard>
      </div>
    </div>
  );
}
