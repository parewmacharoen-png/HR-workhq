import { useEffect, useState } from 'react';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import {
  listMyAnnouncements,
  listAnnouncements,
  getAnnouncementDashboard,
  acknowledgeAnnouncementDelivery,
} from '../../api/announcement';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';

interface AnnouncementItem {
  id: string;
  title: string;
  body?: string;
  status: string;
  publishedAt?: string;
  delivery?: {
    id: string;
    acknowledgedAt?: string;
  };
}

export default function AnnouncementsPage() {
  const companyId = useCompanyId();
  const { can } = useAuth();
  const [mine, setMine] = useState<AnnouncementItem[]>([]);
  const [all, setAll] = useState<AnnouncementItem[]>([]);
  const [stats, setStats] = useState<{ published: number; draft: number; unacknowledged: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      const [myItems, hrItems, dashboard] = await Promise.all([
        listMyAnnouncements(),
        can('document:write') ? listAnnouncements({ companyId }) : Promise.resolve([]),
        can('document:read') ? getAnnouncementDashboard(companyId) : Promise.resolve(null),
      ]);
      setMine(myItems);
      setAll(hrItems);
      setStats(dashboard);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function ack(deliveryId: string) {
    await acknowledgeAnnouncementDelivery(deliveryId);
    await load();
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>ประกาศ</h1>
        <button type="button" className="secondary" onClick={load}>Refresh</button>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card"><span>เผยแพร่แล้ว</span><strong>{stats.published}</strong></div>
          <div className="stat-card"><span>ฉบับร่าง</span><strong>{stats.draft}</strong></div>
          <div className="stat-card"><span>ยังไม่รับทราบ</span><strong>{stats.unacknowledged}</strong></div>
        </div>
      )}

      <h2>ประกาศของฉัน</h2>
      {!mine.length ? (
        <EmptyState title="ไม่มีประกาศ" />
      ) : (
        <table>
          <thead>
            <tr><th>หัวข้อ</th><th>สถานะ</th><th>เผยแพร่</th><th>การดำเนินการ</th></tr>
          </thead>
          <tbody>
            {mine.map((a) => (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>
                  <StatusBadge status={a.delivery?.acknowledgedAt ? 'approved' : 'pending'} />
                </td>
                <td>{a.publishedAt ? new Date(a.publishedAt).toLocaleString() : '—'}</td>
                <td>
                  {a.delivery && !a.delivery.acknowledgedAt && (
                    <button type="button" onClick={() => ack(a.delivery!.id)}>รับทราบ</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {can('document:write') && (
        <>
          <h2 style={{ marginTop: '2rem' }}>ประกาศทั้งหมด (HR)</h2>
          <table>
            <thead>
              <tr><th>หัวข้อ</th><th>สถานะ</th><th>เผยแพร่</th></tr>
            </thead>
            <tbody>
              {all.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>{a.publishedAt ? new Date(a.publishedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
