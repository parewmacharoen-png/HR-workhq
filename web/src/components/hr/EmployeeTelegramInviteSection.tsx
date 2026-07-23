import { useState } from 'react';
import { createTelegramInvite } from '../../api/employee-onboarding';
import { WorkHQButton, WorkHQCard } from '../../components/ui';

interface Props {
  employeeId: string;
  companyId: string;
  telegramStatus?: string;
}

export function EmployeeTelegramInviteSection({ employeeId, companyId, telegramStatus }: Props) {
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function sendInvite() {
    setLoading(true);
    setError('');
    try {
      const res = await createTelegramInvite(employeeId, companyId);
      setInviteLink(res.inviteLink);
      setExpiresAt(res.expiresAt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <WorkHQCard title="Telegram Invite" className="whq-detail-card">
      <p>สถานะ Telegram: <strong>{telegramStatus ?? 'unknown'}</strong></p>
      <WorkHQButton disabled={loading} onClick={() => void sendInvite()}>
        ส่งลิงก์เชิญ Telegram
      </WorkHQButton>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {inviteLink && (
        <div style={{ marginTop: 12 }}>
          <p><strong>ลิงก์ (แสดงครั้งเดียว — ส่งให้พนักงานทางช่องทางปลอดภัย):</strong></p>
          <code>{inviteLink}</code>
          {expiresAt && <p className="whq-muted">หมดอายุ: {new Date(expiresAt).toLocaleString('th-TH')}</p>}
        </div>
      )}
    </WorkHQCard>
  );
}
