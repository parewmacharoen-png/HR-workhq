import { useCallback, useEffect, useState } from 'react';
import { apiGet, ApiError } from '../../api/client';
import { useCompanyId } from '../../context/AuthContext';
import { WorkHQErrorState } from '../../components/workhq/states/WorkHQErrorState';
import { WorkHQLoadingState } from '../../components/workhq/states/WorkHQLoadingState';
import { WorkHQCard, WorkHQStatCard } from '../../components/ui';

interface HrDashboard {
  headcount: number;
  activeEmployees: number;
  probationEmployees: number;
  pendingRequests: number;
  exitCases: number;
  leaveUtilizationToday: number;
  payrollTotal: number;
  trainingOverdue: number;
  monthOverMonthHeadcountDelta: number;
}

export default function HrAnalyticsPage() {
  const companyId = useCompanyId();
  const [data, setData] = useState<HrDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<HrDashboard>('/analytics/hr/dashboard', { companyId }));
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  if (!companyId) return <p>เลือกบริษัทก่อน</p>;
  if (loading) return <WorkHQLoadingState />;
  if (error) {
    return (
      <WorkHQErrorState
        referenceCode={error instanceof ApiError ? error.requestId : undefined}
        onRetry={() => void load()}
      />
    );
  }
  if (!data) return null;

  const momTrend = `MoM ${data.monthOverMonthHeadcountDelta >= 0 ? '+' : ''}${data.monthOverMonthHeadcountDelta}`;

  return (
    <div className="whq-page">
      <h1 className="whq-page-title">📊 HR Analytics</h1>
      <div className="whq-detail-grid">
        <WorkHQStatCard icon="👥" value={data.headcount} label="Headcount" trend={momTrend} />
        <WorkHQStatCard icon="✅" value={data.activeEmployees} label="Active" />
        <WorkHQStatCard icon="🕐" value={data.probationEmployees} label="Probation" />
        <WorkHQStatCard icon="📋" value={data.pendingRequests} label="Pending requests" />
        <WorkHQStatCard icon="🚪" value={data.exitCases} label="Exit cases" />
        <WorkHQStatCard icon="🏖️" value={data.leaveUtilizationToday} label="Off today" />
        <WorkHQStatCard icon="📚" value={data.trainingOverdue} label="Training overdue" />
      </div>
      <WorkHQCard title="Payroll (open cycle net)" className="whq-detail-card">
        <p>{data.payrollTotal.toLocaleString('th-TH')} THB</p>
      </WorkHQCard>
    </div>
  );
}
