import { useEffect, useState } from 'react';
import { listReferralPrograms, updateReferralProgram } from '../../api/request-platform';
import { useCompanyId } from '../../context/AuthContext';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';

export default function ReferralProgramsPage() {
  const companyId = useCompanyId();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listReferralPrograms(companyId ?? undefined).then(setRows).finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <LoadingState />;

  return (
    <div className="card">
      <h1>โปรแกรมโบนัสแนะนำคน</h1>
      <table>
        <thead><tr><th>ชื่อ</th><th>จำนวน</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r.id)}>
              <td>{String(r.name)}</td>
              <td>{String(r.bonusAmount)} {String(r.currency)}</td>
              <td>{String(r.status)}</td>
              <td>
                {r.status !== 'active' && (
                  <button type="button" onClick={() => updateReferralProgram(String(r.id), { status: 'active' }).then(() => window.location.reload())}>
                    เปิดใช้
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <EmptyState title="ยังไม่มีโปรแกรม — สร้างผ่าน API" />}
    </div>
  );
}
