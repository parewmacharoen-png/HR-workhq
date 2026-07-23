import { useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import { useCompanyId } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';

interface InsightPayload {
  scope: { companyId: string; cycleLabel: string | null };
  topTeams: Array<{ teamName: string; depositRoi: number | null; totalExpense: number }>;
  atRiskEmployees: Array<{ employeeName: string; startedWorkCount: number }>;
  anomalies: Array<{ message: string }>;
  recommendations: string[];
}

interface AlertsPayload {
  highExpenseAlerts: Array<{ message: string }>;
  kpiRiskAlerts: Array<{ message: string }>;
  carryForwardRisk: Array<{ message: string }>;
}

interface ForecastPayload {
  forecast: {
    projectedStartedWorkCount: number;
    projectedExpenses: number;
    projectedCommissionPool: number | null;
  };
}

export default function MarketingInsightsPage() {
  const companyId = useCompanyId();
  const [insights, setInsights] = useState<InsightPayload | null>(null);
  const [alerts, setAlerts] = useState<AlertsPayload | null>(null);
  const [forecast, setForecast] = useState<ForecastPayload | null>(null);
  const [error, setError] = useState('');

  async function load() {
    if (!companyId) return;
    try {
      const params = { companyId };
      setInsights(await apiGet<InsightPayload>('/marketing/insights', params));
      setAlerts(await apiGet<AlertsPayload>('/marketing/insights/alerts', params));
      setForecast(await apiGet<ForecastPayload>('/marketing/insights/forecast', params));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;

  return (
    <div className="card">
      <h1>Marketing Insights</h1>
      <div className="toolbar">
        <button type="button" onClick={load}>Refresh</button>
      </div>
      {error && <p className="error">{error}</p>}

      {insights && (
        <section>
          <h2>Rankings</h2>
          <p>Cycle: {insights.scope.cycleLabel ?? '—'}</p>
          <h3>Top teams</h3>
          <ul>
            {insights.topTeams.map((team) => (
              <li key={team.teamName}>{team.teamName} · ROI {team.depositRoi ?? 0}% · ฿{team.totalExpense.toLocaleString()}</li>
            ))}
          </ul>
          <h3>At-risk employees</h3>
          <ul>
            {insights.atRiskEmployees.map((employee) => (
              <li key={employee.employeeName}>{employee.employeeName} · {employee.startedWorkCount} started work</li>
            ))}
          </ul>
        </section>
      )}

      {alerts && (
        <section>
          <h2>Alerts</h2>
          <ul>
            {[...alerts.highExpenseAlerts, ...alerts.kpiRiskAlerts, ...alerts.carryForwardRisk].map((alert) => (
              <li key={alert.message}>{alert.message}</li>
            ))}
          </ul>
        </section>
      )}

      {forecast && (
        <section>
          <h2>Forecast</h2>
          <p>Started work: {forecast.forecast.projectedStartedWorkCount}</p>
          <p>Expenses: ฿{forecast.forecast.projectedExpenses.toLocaleString()}</p>
          <p>Commission pool: {forecast.forecast.projectedCommissionPool != null ? `฿${forecast.forecast.projectedCommissionPool.toLocaleString()}` : '—'}</p>
        </section>
      )}

      {insights && (
        <section>
          <h2>Recommendations</h2>
          <ul>
            {insights.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
