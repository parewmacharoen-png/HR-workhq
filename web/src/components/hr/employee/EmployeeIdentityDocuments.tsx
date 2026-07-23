import { useRef, useState } from 'react';
import {
  deleteEmployeeDocument,
  downloadEmployeeDocument,
  previewEmployeeDocument,
  uploadEmployeeDocumentMultipart,
  type IdentityDocumentType,
} from '../../../api/document-center';
import type { EmployeeIdentityDocument } from '../../../api/employee-personal';
import { NO_DATA } from '../../../lib/employee-date-utils';
import { WorkHQButton } from '../../ui';

interface IdentitySlotConfig {
  key: 'idCard' | 'passport';
  docType: IdentityDocumentType;
  label: string;
  testId: string;
}

const IDENTITY_SLOTS: IdentitySlotConfig[] = [
  { key: 'idCard', docType: 'national_id', label: 'บัตรประชาชน', testId: 'identity-doc-slot-id-card' },
  { key: 'passport', docType: 'passport', label: 'หนังสือเดินทาง', testId: 'identity-doc-slot-passport' },
];

interface EmployeeIdentityDocumentsProps {
  employeeId: string;
  documents: {
    idCard: EmployeeIdentityDocument | null;
    passport: EmployeeIdentityDocument | null;
  };
  canManage: boolean;
  onChanged: () => void;
}

export function EmployeeIdentityDocuments({
  employeeId,
  documents,
  canManage,
  onChanged,
}: EmployeeIdentityDocumentsProps) {
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function handleUpload(slot: IdentitySlotConfig, file: File) {
    setBusySlot(slot.key);
    setError(null);
    try {
      await uploadEmployeeDocumentMultipart(employeeId, slot.docType, file);
      onChanged();
    } catch {
      setError('ไม่สามารถอัปโหลดเอกสารได้ กรุณาลองใหม่');
    } finally {
      setBusySlot(null);
    }
  }

  async function handleDelete(doc: EmployeeIdentityDocument, slotKey: string) {
    if (!window.confirm('ลบเอกสารนี้?')) return;
    setBusySlot(slotKey);
    setError(null);
    try {
      await deleteEmployeeDocument(doc.id);
      onChanged();
    } catch {
      setError('ไม่สามารถลบเอกสารได้');
    } finally {
      setBusySlot(null);
    }
  }

  return (
    <div className="whq-detail-card-body">
      {error && <p className="whq-error">{error}</p>}
      {IDENTITY_SLOTS.map((slot) => {
        const doc = documents[slot.key];
        const busy = busySlot === slot.key;
        return (
          <div key={slot.key} className="whq-identity-doc-slot" data-testid={slot.testId}>
            <div className="whq-info-row">
              <span className="whq-info-label">{slot.label}</span>
              <span className="whq-info-value">{doc?.fileName ?? NO_DATA}</span>
            </div>
            {doc && (
              <p className="whq-muted">
                อัปโหลด {new Date(doc.uploadedAt).toLocaleString()}
                {doc.currentVersion > 1 ? ` · เวอร์ชัน ${doc.currentVersion}` : ''}
              </p>
            )}
            <div className="whq-personal-list-actions">
              {doc && (
                <>
                  <WorkHQButton
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void previewEmployeeDocument(doc.id)}
                  >
                    ดูตัวอย่าง
                  </WorkHQButton>
                  <WorkHQButton
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void downloadEmployeeDocument(doc.id, doc.fileName)}
                  >
                    ดาวน์โหลด
                  </WorkHQButton>
                </>
              )}
              {canManage && (
                <>
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => fileInputs.current[slot.key]?.click()}
                  >
                    {doc ? 'แทนที่' : 'อัปโหลด'}
                  </WorkHQButton>
                  {doc && (
                    <WorkHQButton
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void handleDelete(doc, slot.key)}
                    >
                      ลบ
                    </WorkHQButton>
                  )}
                  <input
                    ref={(el) => { fileInputs.current[slot.key] = el; }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void handleUpload(slot, file);
                    }}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
