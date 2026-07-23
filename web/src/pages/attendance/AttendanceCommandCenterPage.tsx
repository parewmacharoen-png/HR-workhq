import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchAttendanceCommandCenter,
  fetchWorkforceRisk,
  type AttendanceCommandCenterDto,
  type WorkforceRiskResult,
  type WorkDayDto,
} from '../../api/workday';
import {
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQLoadingState,
} from '../../components/workhq';
import { WorkHQButton, WorkHQCard, WorkHQDateInput } from '../../components/ui';
import { useCompanyScope } from '../../hooks/useCompanyScope';
import { fetchForEachCompany } from '../../utils/multi-company';

type WidgetKey = keyof AttendanceCommandCenterDto['widgets'];

const WIDGETS: Array<{
  key: WidgetKey;
  label: string;
  tone: 'green' | 'warm' | 'cool' | 'lavender';
  icon: string;
}> = [
  { key: 'working', label: 'ทำงานอยู่', tone: 'green', icon: '💼' },
  { key: 'late', label: 'สาย', tone: 'warm', icon: '⏰' },
  { key: 'notCheckedIn', label: 'ยังไม่เข้างาน', tone: 'lavender', icon: '📵' },
  { key: 'onBreak', label: 'พักอยู่', tone: 'cool', icon: '☕' },
  { key: 'ot', label: 'ล่วงเวลา (OT)', tone: 'cool', icon: '🌙' },
  { key: 'offDay', label: 'วันหยุด', tone: 'lavender', icon: '🏖️' },
  { key: 'onLeave', label: 'ลา', tone: 'warm', icon: '📝' },
  { key: 'needsAction', label: 'ต้องจัดการ', tone: 'warm', icon: '⚠️' },
];

const RISK_LABELS: Record<string, string> = {
  GREEN: 'ปกติ',
  YELLOW: 'เฝ้าระวัง',
  ORANGE: 'เสี่ยง',
  RED: 'วิกฤต',
};

function mergeCommandCenters(rows: AttendanceCommandCenterDto[]): AttendanceCommandCenterDto | null {
  if (!rows.length) return null;
  const first = rows[0];
  const widgets = {} as AttendanceCommandCenterDto['widgets'];
  for (const key of Object.keys(first.widgets) as WidgetKey[]) {
    const seen = new Set<string>();
    widgets[key] = [];
    for (const row of rows) {
      for (const item of row.widgets[key]) {
        if (seen.has(item.employee.id)) continue;
        seen.add(item.employee.id);
        widgets[key].push(item);
      }
    }
  }

  const exceptionMap = new Map<string, AttendanceCommandCenterDto['exceptions'][number]>();
  for (const row of rows) {
    for (const bucket of row.exceptions) {
      const existing = exceptionMap.get(bucket.type);
      if (!existing) {
        exceptionMap.set(bucket.type, { ...bucket, items: [...bucket.items] });
        continue;
      }
      const ids = new Set(existing.items.map((i) => i.id));
      for (const item of bucket.items) {
        if (!ids.has(item.id)) existing.items.push(item);
      }
      existing.count = existing.items.length;
    }
  }

  return {
    date: first.date,
    companyId: first.companyId,
    summary: first.summary,
    widgets,
    exceptions: [...exceptionMap.values()],
  };
}

function mergeRisk(rows: WorkforceRiskResult[]): WorkforceRiskResult | null {
  if (!rows.length) return null;
  const levelRank = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };
  const overallLevel = rows.reduce(
    (max, r) => (levelRank[r.overallLevel] > levelRank[max] ? r.overallLevel : max),
    'GREEN' as WorkforceRiskResult['overallLevel'],
  );
  const teams = rows.flatMap((r) => r.teams);
  return {
    ...rows[0],
    overallLevel,
    atRiskCount: teams.filter((t) => t.level !== 'GREEN').length,
    teams,
  };
}

export default function AttendanceCommandCenterPage() {
  const { scopedCompanyIds, hasCompanyScope, companyLabel, isAllCompanies } = useCompanyScope();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<AttendanceCommandCenterDto | null>(null);
  const [risk, setRisk] = useState<WorkforceRiskResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [activeWidget, setActiveWidget] = useState<WidgetKey | null>(null);
  const [activeTab, setActiveTab] = useState<'today' | 'exceptions'>('today');

  const load = useCallback(async () => {
    if (!hasCompanyScope) return;
    setLoading(true);
    try {
      const [centerRows, riskRows] = await Promise.all([
        fetchForEachCompany(scopedCompanyIds, (id) => fetchAttendanceCommandCenter(id, date)),
        fetchForEachCompany(scopedCompanyIds, (id) => fetchWorkforceRisk(id, date)),
      ]);
      setData(mergeCommandCenters(centerRows.map((r) => r.result)));
      setRisk(mergeRisk(riskRows.map((r) => r.result)));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [hasCompanyScope, scopedCompanyIds, date]);

  useEffect(() => { void load(); }, [load]);

  const selectedList = useMemo(() => {
    if (!data || !activeWidget) return [];
    return data.widgets[activeWidget];
  }, [data, activeWidget]);

  const totalHeadcount = useMemo(() => {
    if (!data) return 0;
    return WIDGETS.reduce((sum, w) => sum + data.widgets[w.key].length, 0);
  }, [data]);

  if (!hasCompanyScope) {
    return (
      <div className="whq-page whq-att-cc">
        <header className="whq-att-cc-hero">
          <p className="whq-att-cc-eyebrow">เวลาเข้างาน</p>
          <h1 className="whq-att-cc-title">ศูนย์บัญชาการเข้างาน</h1>
          <p className="whq-att-cc-subtitle">ดูสถานะทีมวันนี้แบบรวมศูนย์</p>
        </header>
        <WorkHQEmptyState
          icon="🏢"
          title="เลือกบริษัทก่อน"
          description='เลือกบริษัทจากแถบด้านบน หรือเลือก "ทุกบริษัท" เพื่อดูภาพรวม'
        />
      </div>
    );
  }

  return (
    <div className="whq-page whq-att-cc">
      <header className="whq-att-cc-hero">
        <p className="whq-att-cc-eyebrow">เวลาเข้างาน › ศูนย์บัญชาการ</p>
        <h1 className="whq-att-cc-title">ศูนย์บัญชาการเข้างาน</h1>
        <p className="whq-att-cc-subtitle">
          กำลังดู: <strong>{companyLabel}</strong>
          {isAllCompanies ? ` (${scopedCompanyIds.length} บริษัท)` : ''}
        </p>
        <div className="whq-att-cc-toolbar">
          <label className="whq-att-cc-field">
            <span>วันที่</span>
            <WorkHQDateInput value={date} onChange={setDate} />
          </label>
          <WorkHQButton variant="secondary" onClick={() => void load()}>รีเฟรช</WorkHQButton>
        </div>
      </header>

      <div className="whq-att-cc-tabs" role="tablist" aria-label="มุมมองศูนย์บัญชาการ">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'today'}
          className={`whq-att-cc-tab${activeTab === 'today' ? ' whq-att-cc-tab--active' : ''}`}
          onClick={() => setActiveTab('today')}
        >
          สรุปวันนี้
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'exceptions'}
          className={`whq-att-cc-tab${activeTab === 'exceptions' ? ' whq-att-cc-tab--active' : ''}`}
          onClick={() => setActiveTab('exceptions')}
        >
          รายการต้องจัดการ
          {data && data.exceptions.length > 0 && (
            <span className="whq-att-cc-tab-badge">{data.exceptions.reduce((s, e) => s + e.count, 0)}</span>
          )}
        </button>
      </div>

      {loading && <WorkHQLoadingState />}
      {!loading && error != null && <WorkHQErrorState onRetry={() => void load()} />}
      {!loading && !error && data && (
        <>
          {activeTab === 'today' && (
            <>
              {risk && (
                <WorkHQCard className="whq-att-cc-risk-card">
                  <h2 className="whq-att-cc-section-title">วันนี้เสี่ยงคนไม่พอไหม?</h2>
                  <p className="whq-att-cc-risk-summary">
                    ระดับความเสี่ยงรวม{' '}
                    <span className={`whq-risk-badge whq-risk-badge--${risk.overallLevel}`}>
                      {RISK_LABELS[risk.overallLevel] ?? risk.overallLevel}
                    </span>
                    {risk.atRiskCount > 0 && ` · ${risk.atRiskCount} ทีมต้องจับตา`}
                  </p>
                  {risk.teams.filter((t) => t.level !== 'GREEN').map((team) => (
                    <div key={team.teamId ?? 'company'} className="whq-att-cc-risk-team">
                      <strong>{team.teamName ?? 'ไม่ระบุทีม'}</strong>
                      <span className={`whq-risk-badge whq-risk-badge--${team.level}`}>
                        {RISK_LABELS[team.level] ?? team.level}
                      </span>
                      <p className="whq-muted">
                        พร้อม {team.availableCount}/{team.requiredMinimum} คน
                        {team.shortage > 0 && ` — ขาด ${team.shortage} คน`}
                      </p>
                    </div>
                  ))}
                </WorkHQCard>
              )}

              <p className="whq-att-cc-hint">แตะการ์ดด้านล่างเพื่อดูรายชื่อ · รวม {totalHeadcount} รายการในสถานะต่างๆ</p>

              <div className="whq-att-cc-stat-grid">
                {WIDGETS.map((w) => {
                  const count = data.widgets[w.key].length;
                  const selected = activeWidget === w.key;
                  return (
                    <button
                      key={w.key}
                      type="button"
                      className={`whq-stat-card whq-stat-card--clickable whq-att-cc-stat${selected ? ' whq-stat-card--selected' : ''}`}
                      onClick={() => setActiveWidget((prev) => (prev === w.key ? null : w.key))}
                      aria-pressed={selected}
                    >
                      <div className={`whq-stat-icon whq-stat-icon-${w.tone}`} aria-hidden>{w.icon}</div>
                      <div className="whq-stat-value">{count}</div>
                      <div className="whq-stat-label">{w.label}</div>
                    </button>
                  );
                })}
              </div>

              {activeWidget && (
                <WorkHQCard className="whq-att-cc-detail">
                  <h2 className="whq-att-cc-section-title">
                    {WIDGETS.find((w) => w.key === activeWidget)?.label ?? ''}
                    {' '}
                    <span className="whq-muted">({selectedList.length})</span>
                  </h2>
                  {selectedList.length === 0 ? (
                    <p className="whq-muted">ไม่มีรายการในสถานะนี้</p>
                  ) : (
                    <ul className="whq-att-cc-employee-list">
                      {selectedList.map((row) => (
                        <EmployeeRow key={row.employee.id} row={row} />
                      ))}
                    </ul>
                  )}
                </WorkHQCard>
              )}
            </>
          )}

          {activeTab === 'exceptions' && (
            <div className="whq-att-cc-stack">
              {data.exceptions.length === 0 ? (
                <WorkHQCard>
                  <h2 className="whq-att-cc-section-title">ไม่มีรายการต้องจัดการ</h2>
                  <p className="whq-muted">ทุกอย่างเรียบร้อยสำหรับวันนี้</p>
                </WorkHQCard>
              ) : (
                data.exceptions.map((bucket) => (
                  <WorkHQCard key={bucket.type}>
                    <h2 className="whq-att-cc-section-title">{bucket.label} ({bucket.count})</h2>
                    <ul className="whq-att-cc-employee-list">
                      {bucket.items.map((emp) => (
                        <li key={emp.id}>
                          <Link to={`/hr/employees/${emp.id}`}>
                            {emp.firstName} {emp.lastName} ({emp.globalId})
                          </Link>
                          {emp.teamName && <span className="whq-muted"> — {emp.teamName}</span>}
                        </li>
                      ))}
                    </ul>
                    <div className="whq-att-cc-card-actions">
                      <WorkHQButton to="/approvals" variant="secondary">ไปศูนย์อนุมัติ</WorkHQButton>
                    </div>
                  </WorkHQCard>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmployeeRow({ row }: { row: WorkDayDto }) {
  const { employee, attendance, state } = row;
  return (
    <li>
      <Link to={`/hr/employees/${employee.id}`} className="whq-att-cc-employee-link">
        <strong>{employee.firstName} {employee.lastName}</strong>
        <span className="whq-muted"> {employee.globalId}</span>
      </Link>
      {employee.teamName && <span className="whq-muted"> · {employee.teamName}</span>}
      <span className="whq-att-cc-state-tag">{state}</span>
      {(attendance?.lateMinutes ?? 0) > 0 && (
        <span className="whq-att-cc-late-tag">สาย {attendance!.lateMinutes} นาที</span>
      )}
    </li>
  );
}
