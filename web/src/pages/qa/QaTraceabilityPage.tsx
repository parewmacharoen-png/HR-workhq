import { useEffect, useState } from 'react';
import { qaTraceability } from '../../api/qa';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';

function statusColor(c: string): string {
  if (c === 'go' || c === 'verified') return '#16a34a';
  if (c === 'conditional' || c === 'partial') return '#ca8a04';
  return '#dc2626';
}

type Rule = {
  id: string;
  category: string;
  description: string;
  priority: string;
  implemented: boolean;
  verified: boolean;
  evidenceLevel: string;
  risk: string;
};

type ModuleConf = {
  module: string;
  policy: number;
  implementation: number;
  permission: number;
  audit: number;
  telegram: number;
  tests: number;
  evidence: number;
  uat: number;
  overall: number;
};

type Orphan = { kind: string; id: string; description: string; severity: string };

export default function QaTraceabilityPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [moduleFilter, setModuleFilter] = useState('');

  useEffect(() => {
    qaTraceability()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  if (!data) return null;

  const rules = (data.rules as Rule[]) ?? [];
  const filtered = moduleFilter
    ? rules.filter((r) => r.category.toLowerCase() === moduleFilter.toLowerCase())
    : rules;
  const modules = (data.moduleConfidence as ModuleConf[]) ?? [];
  const orphans = (data.orphans as Orphan[]) ?? [];
  const gaps = (data.criticalGaps as string[]) ?? [];
  const unverified = (data.unverifiedRules as string[]) ?? [];
  const missingTests = (data.missingTests as string[]) ?? [];

  const categories = [...new Set(rules.map((r) => r.category))].sort();

  return (
    <div className="card">
      <h1>QA Traceability Dashboard</h1>
      <p>
        Business Rules: <strong>{String(data.businessRuleCoveragePercent)}%</strong>
        {' · '}
        Requirements: <strong>{String(data.requirementCoveragePercent)}%</strong>
        {' · '}
        Production Confidence: <strong style={{ color: statusColor(String(data.goNoGo)) }}>{String(data.productionConfidencePercent)}%</strong>
        {' · '}
        Go/No-Go: <strong style={{ color: statusColor(String(data.goNoGo)) }}>{String(data.goNoGo)}</strong>
        {' · '}
        Enterprise Ready: <strong>{data.enterpriseReady ? 'YES' : 'NO'}</strong>
      </p>

      <h2>Module Confidence</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Module</th>
            <th>Policy</th>
            <th>Impl</th>
            <th>Perm</th>
            <th>Audit</th>
            <th>Telegram</th>
            <th>Tests</th>
            <th>Evidence</th>
            <th>UAT</th>
            <th>Overall</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <tr key={m.module}>
              <td>{m.module}</td>
              <td>{m.policy}</td>
              <td>{m.implementation}</td>
              <td>{m.permission}</td>
              <td>{m.audit}</td>
              <td>{m.telegram}</td>
              <td>{m.tests}</td>
              <td>{m.evidence}</td>
              <td>{m.uat}</td>
              <td><strong>{m.overall}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Critical Gaps</h2>
      <ul>{gaps.map((g) => <li key={g}>{g}</li>)}</ul>

      <h2>
        Business Rules ({filtered.length})
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          style={{ marginLeft: 12 }}
        >
          <option value="">All modules</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Category</th>
            <th>Description</th>
            <th>Priority</th>
            <th>Implemented</th>
            <th>Verified</th>
            <th>Evidence</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.category}</td>
              <td>{r.description}</td>
              <td>{r.priority}</td>
              <td>{r.implemented ? '✓' : '—'}</td>
              <td style={{ color: statusColor(r.verified ? 'verified' : 'no-go') }}>{r.verified ? '✓' : '—'}</td>
              <td>{r.evidenceLevel}</td>
              <td>{r.risk}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Unverified Rules ({unverified.length})</h2>
      <p>{unverified.join(', ') || 'None'}</p>

      <h2>Missing Tests ({missingTests.length})</h2>
      <p>{missingTests.join(', ') || 'None'}</p>

      <h2>Orphans ({orphans.length})</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Kind</th>
            <th>ID</th>
            <th>Description</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {orphans.map((o) => (
            <tr key={`${o.kind}-${o.id}`}>
              <td>{o.kind}</td>
              <td>{o.id}</td>
              <td>{o.description}</td>
              <td style={{ color: statusColor(o.severity === 'critical' ? 'no-go' : 'partial') }}>{o.severity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
