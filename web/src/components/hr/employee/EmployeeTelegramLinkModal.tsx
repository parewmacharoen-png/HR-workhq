import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  createEmployeeTelegramLink,
  getEmployeeTelegramLink,
  regenerateEmployeeTelegramLink,
  buildTelegramLinkMessage,
  type EmployeeTelegramUiStatus,
} from '../../../api/employee-telegram-link';
import { WorkHQErrorState } from '../../workhq/states/WorkHQErrorState';
import { WorkHQBadge, WorkHQButton } from '../../ui';

interface EmployeeTelegramLinkModalProps {
  employeeId: string;
  employeeName: string;
  companyId: string;
  uiStatus: EmployeeTelegramUiStatus;
  onClose: () => void;
  onStatusChange?: () => void;
}

function qrUrl(deepLink: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(deepLink)}`;
}

function isAlreadyLinkedError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('already has active telegram') || msg.includes('เชื่อมแล้ว');
}

export function EmployeeTelegramLinkModal({
  employeeId,
  employeeName,
  companyId,
  uiStatus,
  onClose,
  onStatusChange,
}: EmployeeTelegramLinkModalProps) {
  const [inviteLink, setInviteLink] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [linked, setLinked] = useState(uiStatus === 'LINKED');
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);

  const applyLinkResponse = useCallback((res: {
    deepLink: string;
    expiresAt: string;
  }) => {
    setInviteLink(res.deepLink);
    setExpiresAt(res.expiresAt);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (uiStatus === 'LINKED') {
        setLinked(true);
        setInviteLink('');
        return;
      }

      const existing = await getEmployeeTelegramLink(employeeId).catch(() => null);
      if (existing?.status === 'ACTIVE' && existing.deepLink) {
        applyLinkResponse(existing);
        return;
      }

      const created = await createEmployeeTelegramLink(employeeId, companyId);
      if (!created.deepLink) {
        throw new Error('ไม่สามารถสร้างลิงก์ได้ — กรุณาลองสร้างใหม่');
      }
      applyLinkResponse(created);
      onStatusChange?.();
    } catch (e) {
      if (isAlreadyLinkedError(e)) {
        setLinked(true);
        setInviteLink('');
        onStatusChange?.();
        return;
      }
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [applyLinkResponse, companyId, employeeId, onStatusChange, uiStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRegenerate() {
    setBusy(true);
    setError(null);
    setCopied(null);
    try {
      const next = await regenerateEmployeeTelegramLink(employeeId, companyId);
      if (!next.deepLink) {
        throw new Error('ไม่สามารถสร้างลิงก์ใหม่ได้');
      }
      applyLinkResponse(next);
      onStatusChange?.();
    } catch (e) {
      if (isAlreadyLinkedError(e)) {
        setLinked(true);
        setInviteLink('');
        onStatusChange?.();
        return;
      }
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, kind: 'link' | 'message') {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }

  const expiryText = expiresAt
    ? new Date(expiresAt).toLocaleString('th-TH')
    : '—';
  const telegramShareUrl = inviteLink
    ? `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('ลิงก์เชิญเข้าระบบ WorkHQ')}`
    : '';

  return (
    <div className="whq-modal-backdrop" role="dialog" aria-modal="true">
      <div className="whq-modal whq-card whq-telegram-link-modal">
        <h3>ส่งลิงก์เชิญ Telegram</h3>

        <p className="whq-muted">
          พนักงาน: <strong>{employeeName}</strong>
          {' · '}กดลิงก์แล้วกรอกข้อมูลใน Telegram
        </p>

        {linked ? (
          <div className="whq-telegram-link-linked">
            <WorkHQBadge status="active" label="เชื่อมแล้ว" />
            <p className="whq-muted">บัญชี Telegram ของพนักงานเชื่อมกับระบบแล้ว</p>
          </div>
        ) : loading ? (
          <p className="whq-muted">กำลังสร้างลิงก์…</p>
        ) : error ? (
          <WorkHQErrorState onRetry={() => void load()} />
        ) : inviteLink ? (
          <>
            <p className="whq-muted">หมดอายุ: {expiryText} · ใช้ครั้งเดียว</p>
            <div className="whq-telegram-link-qr">
              <img
                src={qrUrl(inviteLink)}
                alt={`QR code สำหรับ ${employeeName}`}
                width={180}
                height={180}
              />
            </div>
            <div className="whq-invite-link-box">{inviteLink.replace(/^https:\/\//, '')}</div>
            <div className="whq-modal-actions whq-telegram-link-actions">
              <WorkHQButton
                type="button"
                variant="primary"
                onClick={() => void copyText(inviteLink, 'link')}
              >
                {copied === 'link' ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
              </WorkHQButton>
              <WorkHQButton
                type="button"
                variant="secondary"
                onClick={() => void copyText(buildTelegramLinkMessage(inviteLink), 'message')}
              >
                {copied === 'message' ? 'คัดลอกแล้ว ✓' : 'คัดลอกข้อความ'}
              </WorkHQButton>
              {telegramShareUrl && (
                <a href={telegramShareUrl} className="whq-btn whq-btn-secondary" target="_blank" rel="noreferrer">
                  แชร์ผ่าน Telegram
                </a>
              )}
              <WorkHQButton
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void handleRegenerate()}
              >
                {busy ? 'กำลังสร้าง…' : 'สร้างลิงก์ใหม่'}
              </WorkHQButton>
            </div>
          </>
        ) : (
          <WorkHQButton type="button" variant="primary" disabled={busy} onClick={() => void load()}>
            สร้างลิงก์เชิญ
          </WorkHQButton>
        )}

        <div className="whq-modal-actions">
          <WorkHQButton type="button" variant="ghost" onClick={onClose}>
            ปิด
          </WorkHQButton>
        </div>
      </div>
    </div>
  );
}
