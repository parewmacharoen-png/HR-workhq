import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useCompanyId } from '../context/AuthContext';
import { EmptyState } from '../components/EmptyState';

interface ExpenseRow {
  id: string;
  expenseDate: string;
  category: string;
  amount: number;
  description: string | null;
  status: string;
  teamId: string | null;
  employeeId: string | null;
}

export default function ExpensesPage() {
  const companyId = useCompanyId();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [error, setError] = useState('');

  async function load() {
    if (!companyId) return;
    try {
      const data = await apiGet<ExpenseRow[]>('/marketing/expenses', {
        companyId,
        status: status || undefined,
      });
      setRows(data);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (!companyId) return <EmptyState title="Select a company" />;

  return (
    <div className="card">
      <h1>Marketing Expenses</h1>
      <div className="toolbar">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="draft">draft</option>
            <option value="submitted">submitted</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="voided">voided</option>
          </select>
        </label>
        <button type="button" onClick={load}>Refresh</button>
        <Link to="/marketing/expenses/dashboard">Dashboard</Link>
      </div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Description</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.expenseDate}</td>
              <td>{row.category}</td>
              <td>{row.amount.toLocaleString()}</td>
              <td>{row.status}</td>
              <td>{row.description ?? '-'}</td>
              <td><Link to={`/marketing/expenses/${row.id}`}>View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
