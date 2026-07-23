import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useCompanyId } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';

interface Summary {
  totalExpense: number;
  costPerContact: number | null;
  costPerNewMember: number | null;
  costPerStartedWork: number | null;
  depositRoi: number | null;
  byCategory: Record<string, number>;
  kpi: {
    contactedCount: number;
    newMemberCount: number;
    depositAmount: number;
    startedWorkCount: number;
  };
}

export default function ExpensesDashboardPage() {
  const companyId = useCompanyId();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');

  async function load() {
    if (!companyId) return;
    try {
      const data = await apiGet<Summary>('/marketing/expenses/summary', { companyId });
      setSummary(data);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;

  const categories = summary
    ? Object.entries(summary.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="card">
      <h1>Marketing Expense Dashboard</h1>
      <div className="toolbar">
        <button type="button" onClick={load}>Refresh</button>
        <Link to="/marketing/expenses">All expenses</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {summary && (
        <>
          <div className="metrics">
            <div><strong>Total approved</strong><div>{summary.totalExpense.toLocaleString()}</div></div>
            <div><strong>Cost / contact</strong><div>{summary.costPerContact?.toFixed(2) ?? '-'}</div></div>
            <div><strong>Cost / new member</strong><div>{summary.costPerNewMember?.toFixed(2) ?? '-'}</div></div>
            <div><strong>Cost / started work</strong><div>{summary.costPerStartedWork?.toFixed(2) ?? '-'}</div></div>
            <div><strong>Deposit ROI</strong><div>{summary.depositRoi?.toFixed(2) ?? '-'}</div></div>
          </div>
          <h2>KPI (approved reports)</h2>
          <p>
            Contacted {summary.kpi.contactedCount} · New members {summary.kpi.newMemberCount} ·
            Deposit {summary.kpi.depositAmount.toLocaleString()} · Started work {summary.kpi.startedWorkCount}
          </p>
          <h2>Category breakdown</h2>
          <table>
            <thead><tr><th>Category</th><th>Amount</th></tr></thead>
            <tbody>
              {categories.map(([cat, amount]) => (
                <tr key={cat}><td>{cat}</td><td>{amount.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
