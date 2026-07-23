import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { fetchEmployeePaidSettlementSummary } from '../../api/final-settlement';
import { useAuth } from '../../context/AuthContext';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { WorkHQCard, WorkHQPage } from '../../components/ui';
import { th } from '../../i18n/th-labels';

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EmployeeFinalSettlementPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchEmployeePaidSettlementSummary>> | null>(null);

  async function load() {
    if (!user?.employeeId) {
      setError(new ApiError('No employee profile linked to this account', 403));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchEmployeePaidSettlementSummary(user.employeeId);
      setSummary(data);
      setError(null);
    } catch (err) {
      setSummary(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [user?.employeeId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!summary) return null;

  return (
    <WorkHQPage>
      <Link to="/dashboard" className="whq-back-link">{th.finalSettlementSelf.back}</Link>
      <h1 className="whq-page-title">{th.finalSettlementSelf.title}</h1>
      <p className="whq-muted">
        {th.finalSettlementSelf.paidOn} {new Date(summary.paidAt).toLocaleString('th-TH')}
      </p>

      <WorkHQCard title={th.finalSettlementSelf.summaryTitle} className="whq-detail-card whq-detail-card--full">
        <div className="whq-detail-card-body">
          <div className="whq-info-row">
            <span className="whq-info-label">{th.finalSettlementSelf.totalAdditions}</span>
            <span className="whq-info-value">+฿{formatMoney(summary.totalAdditions)}</span>
          </div>
          <div className="whq-info-row">
            <span className="whq-info-label">{th.finalSettlementSelf.totalDeductions}</span>
            <span className="whq-info-value whq-info-value--warning">-฿{formatMoney(summary.totalDeductions)}</span>
          </div>
          <div className="whq-info-row">
            <span className="whq-info-label">{th.finalSettlementSelf.depositReturn}</span>
            <span className="whq-info-value">+฿{formatMoney(summary.depositReturn)}</span>
          </div>
          <div className="whq-info-row whq-info-row--emphasis">
            <span className="whq-info-label">{th.finalSettlementSelf.netPaid}</span>
            <span className="whq-info-value">฿{formatMoney(summary.netPaidAmount)}</span>
          </div>
        </div>
      </WorkHQCard>
    </WorkHQPage>
  );
}
