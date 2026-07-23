import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPut } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useScopedCompanyId } from '../../hooks/useScopedCompanyId';
import { CompanyScopePicker, WorkHQSelectCompanyState } from '../../components/workhq';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';

interface SettingRow {
  id: string;
  key: string;
  value: unknown;
  companyId: string | null;
  updatedAt: string;
}

interface HistoryRow {
  id: string;
  previousValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  system: 'ตั้งค่าทั่วไป',
  attendance: 'เวลาเข้างาน',
  leave: 'การลา',
  payroll: 'เงินเดือน',
  referral: 'แนะนำเพื่อน',
  deposit: 'เงินประกัน',
  workflow: 'เวิร์กโฟลว์',
  performance: 'ผลงาน',
};

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export default function SettingsCategoryPage() {
  const { category = 'system' } = useParams<{ category: string }>();
  const {
    companyId,
    hasCompanyScope,
    needsLocalPicker,
    setLocalCompanyId,
    companies,
    scopedCompanyIds,
  } = useScopedCompanyId();
  const { can } = useAuth();
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const apiCategory = category === 'general' ? 'system' : category;
  const title = CATEGORY_LABELS[apiCategory] ?? category;

  async function load() {
    if (!companyId && apiCategory !== 'system') return;
    setLoading(true);
    try {
      const query = apiCategory === 'system'
        ? { companyId: 'system' }
        : { companyId };
      const list = await apiGet<SettingRow[]>(`/settings/${apiCategory}`, query);
      setRows(list);
      try {
        const hist = await apiGet<HistoryRow[]>('/settings/history', {
          ...query,
          category: apiCategory,
          limit: '10',
        });
        setHistory(hist);
      } catch {
        setHistory([]);
      }
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [companyId, apiCategory]);

  const canWrite = can('settings:write');

  async function saveKey(key: string, rawValue: string) {
    let parsed: unknown = rawValue;
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      parsed = rawValue;
    }
    const query = apiCategory === 'system'
      ? { companyId: 'system' }
      : { companyId };
    await apiPut(`/settings/${apiCategory}/${encodeURIComponent(key)}`, { value: parsed }, query);
    await load();
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!newKey.trim()) return;
    await saveKey(newKey.trim(), newValue);
    setNewKey('');
    setNewValue('');
  }

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.key.localeCompare(b.key)),
    [rows],
  );

  if (apiCategory !== 'system' && !hasCompanyScope) {
    return <WorkHQSelectCompanyState />;
  }
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="page-header">
        <div>
          <Link to="/settings">← ตั้งค่า</Link>
          <h1>{title}</h1>
        </div>
      </div>
      {apiCategory !== 'system' && needsLocalPicker ? (
        <CompanyScopePicker
          companies={companies}
          companyIds={scopedCompanyIds}
          value={companyId}
          onChange={setLocalCompanyId}
        />
      ) : null}

      <section>
        <h2>รายการตั้งค่า</h2>
        {sortedRows.length === 0 ? (
          <p className="muted">ยังไม่มีการตั้งค่าในหมวดนี้</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>คีย์</th>
                <th>ค่า</th>
                <th>อัปเดตล่าสุด</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <SettingEditRow
                  key={row.id}
                  row={row}
                  canWrite={canWrite}
                  onSave={(value) => saveKey(row.key, value)}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {canWrite && (
        <section>
          <h2>เพิ่มการตั้งค่า</h2>
          <form className="form-grid settings-grid" onSubmit={onCreate}>
            <label>
              คีย์
              <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="reward_amount" />
            </label>
            <label>
              ค่า (JSON หรือข้อความ)
              <input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="2000" />
            </label>
            <button type="submit">บันทึก</button>
          </form>
        </section>
      )}

      <section>
        <h2>ประวัติการเปลี่ยนแปลง</h2>
        {history.length === 0 ? (
          <p className="muted">ยังไม่มีประวัติ</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>เวลา</th>
                <th>ค่าเดิม</th>
                <th>ค่าใหม่</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.changedAt).toLocaleString('th-TH')}</td>
                  <td><code>{formatValue(h.previousValue)}</code></td>
                  <td><code>{formatValue(h.newValue)}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function SettingEditRow({
  row,
  canWrite,
  onSave,
}: {
  row: SettingRow;
  canWrite: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formatValue(row.value));

  return (
    <tr>
      <td><code>{row.key}</code></td>
      <td>
        {editing ? (
          <input value={value} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <code>{formatValue(row.value)}</code>
        )}
      </td>
      <td>{new Date(row.updatedAt).toLocaleString('th-TH')}</td>
      {canWrite && (
        <td>
          {editing ? (
            <>
              <button type="button" onClick={async () => { await onSave(value); setEditing(false); }}>บันทึก</button>
              <button type="button" className="secondary" onClick={() => setEditing(false)}>ยกเลิก</button>
            </>
          ) : (
            <button type="button" className="secondary" onClick={() => setEditing(true)}>แก้ไข</button>
          )}
        </td>
      )}
    </tr>
  );
}
