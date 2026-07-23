import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
  const { user, companyId, canAny } = useAuth();

  return (
    <div className="card">
      <h1>Dashboard</h1>
      <p className="muted">Welcome back, {user?.displayName ?? user?.username}.</p>
      {!companyId && (
        <p className="error">Select a company from the top bar to load scoped data.</p>
      )}
      <div className="dashboard-grid">
        {canAny('marketing:read') && (
          <Link className="dash-card" to="/marketing/reports">Marketing Reports</Link>
        )}
        {canAny('commission:read') && (
          <Link className="dash-card" to="/commission/cycles">Commission Cycles</Link>
        )}
        {canAny('payroll:read') && (
          <Link className="dash-card" to="/payroll/cycles">Payroll Cycles</Link>
        )}
        {canAny('employee:read') && (
          <Link className="dash-card" to="/hr/employees">Employees</Link>
        )}
        {canAny('reporting:executive', 'reporting:owner') && (
          <Link className="dash-card" to="/executive">Executive Dashboard</Link>
        )}
        {canAny('knowledge:read') && (
          <Link className="dash-card" to="/knowledge/articles">Knowledge Base</Link>
        )}
      </div>
    </div>
  );
}
