import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../../api/client';
import {
  fetchEmployeePerformance,
  type EmployeePerformanceResponse,
  type EmployeePerformanceReviewHistoryItem,
} from '../../../api/employee-performance';
import { formatThaiDate, NO_DATA } from '../../../lib/employee-date-utils';
import {
  filterPerformanceReviewHistory,
  formatPerformanceScore,
  kpiGoalStatusLabel,
  performanceReviewStatusLabel,
  performanceReviewStatusVariant,
  performanceReviewTypeLabel,
  performanceYearOptions,
} from '../../../lib/employee-performance-utils';
import {
  WorkHQEmptyState,
  WorkHQErrorState,
  WorkHQPageState,
} from '../../workhq';
import { WorkHQBadge, WorkHQCard, WorkHQField, WorkHQInput, WorkHQSelect } from '../../ui';

function PerformanceSummarySkeleton() {
  return (
    <div className="whq-stat-grid whq-employee-performance-summary-skeleton" data-testid="employee-performance-summary-skeleton">
      {Array.from({ length: 9 }, (_, index) => (
        <div key={index} className="whq-stat-card whq-stat-card--skeleton" />
      ))}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="whq-stat-card" data-testid={`performance-summary-${tone}`}>
      <div className="whq-stat-value">{value}</div>
      <div className="whq-stat-label">{label}</div>
    </div>
  );
}

interface EmployeePerformanceTabProps {
  employeeId: string;
  companyId: string;
}

export function EmployeePerformanceTab({ employeeId, companyId }: EmployeePerformanceTabProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<EmployeePerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [year, setYear] = useState('');
  const [reviewType, setReviewType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchEmployeePerformance(employeeId, companyId));
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => performanceYearOptions(data?.reviewHistory ?? [], currentYear),
    [currentYear, data?.reviewHistory],
  );

  useEffect(() => {
    if (!year && yearOptions.length) setYear(yearOptions[0]);
  }, [year, yearOptions]);

  const filteredHistory = useMemo(
    () => filterPerformanceReviewHistory(data?.reviewHistory ?? [], { year, reviewType, status, search }),
    [data?.reviewHistory, year, reviewType, status, search],
  );

  const tableState = loading
    ? 'loading' as const
    : error
      ? 'error' as const
      : !data || data.reviewHistory.length === 0
        ? 'empty' as const
        : filteredHistory.length === 0
          ? 'empty' as const
          : 'success' as const;

  const summary = data?.summary;
  const reviewStatusVariant = summary?.reviewStatus
    ? performanceReviewStatusVariant(summary.reviewStatus)
    : 'neutral';

  function openReview(row: EmployeePerformanceReviewHistoryItem) {
    navigate(`/hr/performance/reviews/${row.cycleId}`);
  }

  return (
    <div className="whq-employee-performance-tab" data-testid="employee-performance-tab">
      <WorkHQPageState
        state={loading ? 'loading' : error ? 'error' : 'success'}
        loading={<PerformanceSummarySkeleton />}
        error={(
          <WorkHQErrorState
            referenceCode={error instanceof ApiError ? error.requestId : undefined}
            onRetry={() => void load()}
          />
        )}
      >
        {summary && (
          <div className="whq-stat-grid whq-employee-performance-summary" data-testid="employee-performance-summary">
            <SummaryCard label="คะแนน KPI ปัจจุบัน" value={formatPerformanceScore(summary.currentKpiScore)} tone="current-kpi-score" />
            <SummaryCard label="คะแนนประเมินล่าสุด" value={formatPerformanceScore(summary.latestReviewScore)} tone="latest-review-score" />
            <SummaryCard label="รอบประเมินล่าสุด" value={summary.latestReviewPeriod ?? NO_DATA} tone="latest-review-period" />
            <div className="whq-stat-card" data-testid="performance-summary-review-status">
              <div className="whq-stat-value">
                {summary.reviewStatus ? (
                  <span className={`whq-badge whq-badge-${reviewStatusVariant}`}>
                    {performanceReviewStatusLabel(summary.reviewStatus)}
                  </span>
                ) : NO_DATA}
              </div>
              <div className="whq-stat-label">สถานะประเมิน</div>
            </div>
            <SummaryCard label="สถานะทดลองงาน" value={summary.probationStatus} tone="probation-status" />
            <SummaryCard
              label="ครบกำหนดประเมินถัดไป"
              value={summary.nextReviewDue ? formatThaiDate(summary.nextReviewDue) : NO_DATA}
              tone="next-review-due"
            />
            <SummaryCard label="เป้าหมายสำเร็จ" value={summary.goalsCompleted} tone="goals-completed" />
            <SummaryCard label="เป้าหมายค้าง" value={summary.goalsPending} tone="goals-pending" />
            <SummaryCard label="ข้อควรปรับปรุง" value={summary.warningsCount} tone="warnings-count" />
          </div>
        )}
      </WorkHQPageState>

      <WorkHQCard title="เป้าหมาย / KPI ปัจจุบัน" className="whq-detail-card whq-detail-card--wide">
        <WorkHQPageState
          state={loading ? 'loading' : error ? 'error' : !data?.currentGoals.length ? 'empty' : 'success'}
          loading={<PerformanceSummarySkeleton />}
          error={(
            <WorkHQErrorState
              referenceCode={error instanceof ApiError ? error.requestId : undefined}
              onRetry={() => void load()}
            />
          )}
          empty={(
            <WorkHQEmptyState
              title="ยังไม่มีเป้าหมาย KPI"
              description="เป้าหมาย KPI ที่กำลังดำเนินการจะแสดงที่นี่"
            />
          )}
        >
          <div className="whq-table-wrap">
            <table className="whq-table whq-employee-performance-goals-table" data-testid="employee-performance-goals-table">
              <thead>
                <tr>
                  <th>เป้าหมาย / KPI</th>
                  <th>เป้าหมาย</th>
                  <th>ผลจริง</th>
                  <th>ความคืบหน้า</th>
                  <th>น้ำหนัก</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {data?.currentGoals.map((goal) => (
                  <tr key={goal.id}>
                    <td>{goal.name}</td>
                    <td>{goal.target ?? NO_DATA}</td>
                    <td>{goal.actual ?? NO_DATA}</td>
                    <td>{formatPerformanceScore(goal.progress)}</td>
                    <td>{goal.weight}</td>
                    <td><WorkHQBadge status={goal.status} label={kpiGoalStatusLabel(goal.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkHQPageState>
      </WorkHQCard>

      <WorkHQCard title="ประวัติการประเมิน" className="whq-detail-card whq-detail-card--wide">
        <div className="whq-employee-performance-toolbar">
          <WorkHQField label="ปี">
            <WorkHQSelect
              value={year}
              data-testid="performance-filter-year"
              onChange={(event) => setYear(event.target.value)}
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="ประเภท">
            <WorkHQSelect
              value={reviewType}
              data-testid="performance-filter-type"
              onChange={(event) => setReviewType(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="performance_review">ประเมินผลงาน</option>
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="สถานะ">
            <WorkHQSelect
              value={status}
              data-testid="performance-filter-status"
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="draft">ร่าง</option>
              <option value="in_progress">กำลังดำเนินการ</option>
              <option value="submitted">ส่งแล้ว</option>
              <option value="reviewed">ตรวจแล้ว</option>
              <option value="finalized">สรุปแล้ว</option>
              <option value="cancelled">ยกเลิก</option>
            </WorkHQSelect>
          </WorkHQField>
          <WorkHQField label="ค้นหา">
            <WorkHQInput
              type="search"
              value={search}
              placeholder="ค้นหารอบ ผู้ประเมิน หรือสถานะ"
              data-testid="performance-search"
              onChange={(event) => setSearch(event.target.value)}
            />
          </WorkHQField>
        </div>

        <WorkHQPageState
          state={tableState}
          loading={<PerformanceSummarySkeleton />}
          error={(
            <WorkHQErrorState
              referenceCode={error instanceof ApiError ? error.requestId : undefined}
              onRetry={() => void load()}
            />
          )}
          empty={(
            <WorkHQEmptyState
              title="ยังไม่มีประวัติการประเมิน"
              description="รายการประเมินผลงานจะแสดงที่นี่เมื่อมีข้อมูล"
            />
          )}
        >
          <div className="whq-table-wrap">
            <table className="whq-table whq-employee-performance-table" data-testid="employee-performance-table">
              <thead>
                <tr>
                  <th>รอบ</th>
                  <th>ประเภท</th>
                  <th>คะแนน KPI</th>
                  <th>คะแนนประเมิน</th>
                  <th>สถานะ</th>
                  <th>ผู้ประเมิน</th>
                  <th>วันที่เสร็จ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((row) => (
                  <tr
                    key={row.id}
                    className="whq-table-row-clickable"
                    onClick={() => openReview(row)}
                    data-testid={`performance-history-row-${row.id}`}
                  >
                    <td>{row.period}</td>
                    <td>{performanceReviewTypeLabel(row.reviewType)}</td>
                    <td>{formatPerformanceScore(row.kpiScore)}</td>
                    <td>{formatPerformanceScore(row.reviewScore)}</td>
                    <td><WorkHQBadge status={row.status} label={performanceReviewStatusLabel(row.status)} /></td>
                    <td>{row.reviewerName ?? NO_DATA}</td>
                    <td>{row.completedDate ? formatThaiDate(row.completedDate) : NO_DATA}</td>
                    <td>
                      <Link
                        to={`/hr/performance/reviews/${row.cycleId}`}
                        className="whq-link"
                        onClick={(event) => event.stopPropagation()}
                      >
                        ดูรายละเอียด
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </WorkHQPageState>
      </WorkHQCard>

      {(data?.improvementItems.length ?? 0) > 0 && (
        <WorkHQCard title="ทดลองงาน / ข้อควรปรับปรุง" className="whq-detail-card whq-detail-card--wide">
          <div className="whq-employee-performance-improvements" data-testid="employee-performance-improvements">
            {data?.improvementItems.map((item) => (
              <div key={item.id} className="whq-employee-performance-improvement-item">
                <div className="whq-employee-performance-improvement-title">{item.title}</div>
                {item.description && (
                  <p className="whq-muted">{item.description}</p>
                )}
                {item.date && (
                  <div className="whq-muted whq-text-sm">{formatThaiDate(item.date)}</div>
                )}
              </div>
            ))}
          </div>
        </WorkHQCard>
      )}
    </div>
  );
}
