import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import { useCompanyId } from '../context/AuthContext';

interface ExpenseDetail {
  id: string;
  companyId: string;
  expenseDate: string;
  category: string;
  amount: number;
  description: string | null;
  status: string;
  rejectedReason: string | null;
}

export default function ExpenseDetailPage() {
  const { id } = useParams();
  const companyId = useCompanyId();
  const [expense, setExpense] = useState<ExpenseDetail | null>(null);
  const [error, setError] = useState('');

  async function load() {
    if (!id) return;
    try {
      const data = await apiGet<ExpenseDetail>(`/marketing/expenses/${id}`);
      setExpense(data);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function approve() {
    if (!id) return;
    await apiPost(`/marketing/expenses/${id}/approve`);
    await load();
  }

  async function reject() {
    if (!id) return;
    const reason = window.prompt('Rejection reason') ?? '';
    if (!reason.trim()) return;
    await apiPost(`/marketing/expenses/${id}/reject`, { reason });
    await load();
  }

  if (!expense) return <div className="card">{error || 'Loading...'}</div>;

  return (
    <div className="card">
      <p><Link to="/marketing/expenses">← Back to expenses</Link></p>
      <h1>Expense {expense.expenseDate}</h1>
      <dl>
        <dt>Category</dt><dd>{expense.category}</dd>
        <dt>Amount</dt><dd>{expense.amount.toLocaleString()}</dd>
        <dt>Status</dt><dd>{expense.status}</dd>
        <dt>Description</dt><dd>{expense.description ?? '-'}</dd>
        {expense.rejectedReason && (<><dt>Rejected reason</dt><dd>{expense.rejectedReason}</dd></>)}
      </dl>
      {expense.status === 'submitted' && (
        <div className="toolbar">
          <button type="button" onClick={approve}>Approve</button>
          <button type="button" onClick={reject}>Reject</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <p>Company: {expense.companyId || companyId}</p>
    </div>
  );
}
