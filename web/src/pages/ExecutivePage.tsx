import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useCompanyId } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';

interface ExecutiveHeadline {
  headcountActive: number;
  attendanceRate: number;
  financeNet: number;
  payrollNet: number;
  pendingApprovals: number;
  riskAlertCount: number;
}

interface SummaryPayload {
  headline: ExecutiveHeadline;
  finance: { revenue: number; expenses: number; net: number } | null;
  leave: { pendingRequests: number; approvedMtd: number; rejectedMtd: number };
  marketing: { topTeamName: string | null; bottomTeamName: string | null } | null;
}

interface RisksPayload {
  risks: Array<{ severity: string; category: string; message: string }>;
}

interface ForecastPayload {
  forecast: {
    projectedNetProfit: number | null;
    projectedCommissionPayout: number | null;
    projectedPayrollNet: number | null;
    projectedMarketingExpense: number | null;
  };
}

interface RecommendationsPayload {
  opportunities: Array<{ message: string }>;
  recommendations: string[];
}

export default function ExecutivePage() {
  const companyId = useCompanyId();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [risks, setRisks] = useState<RisksPayload | null>(null);
  const [forecast, setForecast] = useState<ForecastPayload | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationsPayload | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = { companyId, month };
      setSummary(await apiGet<SummaryPayload>('/executive', params));
      setRisks(await apiGet<RisksPayload>('/executive/risks', params));
      setForecast(await apiGet<ForecastPayload>('/executive/forecast', params));
      setRecommendations(await apiGet<RecommendationsPayload>('/executive/recommendations', params));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId, month]);

  if (!companyId) return <EmptyState title="Select a company" />;

  return (
    <div className="card">
      <div className="page-header">
        <h1>Executive Dashboard</h1>
        <div className="toolbar">
          <label>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          <button type="button" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
        </div>
      </div>
      {error ? <ErrorState error={error} onRetry={load} /> : null}

      {summary && (
        <>
          <div className="summary-cards">
            <div className="summary-card"><strong>{summary.headline.headcountActive}</strong><span>Active headcount</span></div>
            <div className="summary-card"><strong>{summary.headline.attendanceRate}%</strong><span>Attendance rate</span></div>
            <div className="summary-card"><strong>฿{summary.headline.financeNet.toLocaleString()}</strong><span>Finance net</span></div>
            <div className="summary-card"><strong>฿{summary.headline.payrollNet.toLocaleString()}</strong><span>Payroll net</span></div>
            <div className="summary-card"><strong>{summary.leave.pendingRequests}</strong><span>Pending leave</span></div>
            <div className="summary-card"><strong>{summary.headline.riskAlertCount}</strong><span>Risk alerts</span></div>
          </div>
          <p className="muted">
            Source links:
            {' '}<Link to="/marketing/insights">Marketing insights</Link>
            {' · '}<Link to="/commission/cycles">Commission</Link>
            {' · '}<Link to="/payroll/cycles">Payroll</Link>
            {' · '}<Link to="/leave/requests">Leave</Link>
          </p>
        </>
      )}

      {risks && risks.risks.length > 0 && (
        <section>
          <h2>Risks</h2>
          {risks.risks.map((risk) => (
            <div key={`${risk.category}-${risk.message}`} className={`risk-card${risk.severity === 'high' ? ' high' : ''}`}>
              <strong>{risk.category}</strong> — {risk.message}
            </div>
          ))}
        </section>
      )}

      {forecast && (
        <section>
          <h2>Forecast</h2>
          <div className="summary-cards">
            <div className="summary-card"><strong>{forecast.forecast.projectedNetProfit ?? '—'}</strong><span>Net profit</span></div>
            <div className="summary-card"><strong>{forecast.forecast.projectedCommissionPayout ?? '—'}</strong><span>Commission</span></div>
            <div className="summary-card"><strong>{forecast.forecast.projectedPayrollNet ?? '—'}</strong><span>Payroll</span></div>
            <div className="summary-card"><strong>{forecast.forecast.projectedMarketingExpense ?? '—'}</strong><span>Marketing expense</span></div>
          </div>
        </section>
      )}

      {recommendations && (
        <section>
          <h2>Recommendations</h2>
          <ul>{recommendations.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
