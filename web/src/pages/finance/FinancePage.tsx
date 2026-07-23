import { EmptyState } from '../../components/EmptyState';
import { useCompanyId } from '../../context/AuthContext';

export default function FinancePage() {
  const companyId = useCompanyId();
  if (!companyId) return <EmptyState title="Select a company" />;
  return (
    <div className="card">
      <h1>Finance</h1>
      <EmptyState title="Finance overview" description="Ledger and advance workflows are available via API and Telegram. Web summary views can be expanded in a future sprint." />
    </div>
  );
}
