import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchDirectReports,
  fetchReportingPath,
  updateReportingLine,
  type DirectReportItem,
  type ReportingPathNode,
} from '../../api/hierarchy';
import { fetchEmployeeList, type EmployeeListItem } from '../../api/employees';
import { useAuth, useCompanyId } from '../../context/AuthContext';
import { LoadingState } from '../LoadingState';
import { WorkHQButton, WorkHQCard, WorkHQField, WorkHQSelect } from '../ui';
import { employmentStatusLabel, roleLabel, th } from '../../i18n/th-labels';

interface Props {
  employeeId: string;
}

export function EmployeeReportingSection({ employeeId }: Props) {
  const { can } = useAuth();
  const companyId = useCompanyId();
  const canWrite = can('employee:write');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [path, setPath] = useState<ReportingPathNode[]>([]);
  const [directReports, setDirectReports] = useState<DirectReportItem[]>([]);
  const [candidates, setCandidates] = useState<EmployeeListItem[]>([]);
  const [managerId, setManagerId] = useState<string>('');
  const [expanded, setExpanded] = useState(false);

  const currentManagerId = useMemo(() => {
    if (path.length < 2) return '';
    return path[path.length - 2]?.employeeId ?? '';
  }, [path]);

  const currentManager = path.length >= 2 ? path[path.length - 2] : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pathRes, reportsRes] = await Promise.all([
        fetchReportingPath(employeeId),
        fetchDirectReports(employeeId),
      ]);
      setPath(pathRes.path);
      setDirectReports(reportsRes.items);

      if (companyId) {
        const list = await fetchEmployeeList({ companyId });
        setCandidates(list.items.filter((e) => e.id !== employeeId));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [employeeId, companyId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    setManagerId(currentManagerId);
  }, [currentManagerId]);

  async function saveManager() {
    if (!canWrite) return;
    setSaving(true);
    setError('');
    try {
      await updateReportingLine(employeeId, {
        managerEmployeeId: managerId || null,
        companyId: companyId || undefined,
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label={th.reporting.loading} />;

  return (
    <WorkHQCard
      title={th.reporting.title}
      description={th.reporting.subtitle}
      className="whq-access-card"
    >
      {error && <p className="whq-error-text">{error}</p>}

      <div className="whq-report-block">
        <h3>{th.reporting.reportsTo}</h3>
        {canWrite ? (
          <div className="whq-form-row">
            <WorkHQField label={th.reporting.manager}>
              <WorkHQSelect value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">{th.reporting.noManager}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.globalId} — {c.firstName} {c.lastName}
                  </option>
                ))}
              </WorkHQSelect>
            </WorkHQField>
            <WorkHQButton type="button" variant="primary" disabled={saving} onClick={() => void saveManager()}>
              {saving ? th.common.saving : th.common.save}
            </WorkHQButton>
          </div>
        ) : (
          <p>
            {currentManager
              ? `${currentManager.globalId} — ${currentManager.firstName} ${currentManager.lastName}`
              : th.reporting.noManagerAssigned}
          </p>
        )}
      </div>

      <div className="whq-report-block">
        <h3>{th.reporting.orgPath}</h3>
        {path.length === 0 ? (
          <p className="whq-muted">{th.reporting.noPath}</p>
        ) : (
          <div className="whq-org-path-chain">
            {path.map((node, index) => (
              <span key={node.employeeId} className="whq-org-path-node">
                {index > 0 && <span className="whq-org-path-arrow">→</span>}
                <Link to={`/hr/employees/${node.employeeId}`} className="whq-org-path-link">
                  {node.firstName} {node.lastName}
                  <span className="whq-org-path-role">{roleLabel(node.businessRole ?? node.roleLevel)}</span>
                </Link>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="whq-report-block">
        <button
          type="button"
          className="whq-btn whq-btn-secondary"
          style={{ width: '100%', justifyContent: 'space-between' }}
          onClick={() => setExpanded((v) => !v)}
        >
          {th.reporting.directReports} ({directReports.length})
          <span>{expanded ? '▾' : '▸'}</span>
        </button>
        {expanded && (
          directReports.length === 0 ? (
            <p className="whq-muted" style={{ marginTop: '0.65rem' }}>{th.reporting.noDirectReports}</p>
          ) : (
            <ul className="whq-direct-reports">
              {directReports.map((report) => (
                <li key={report.employeeId}>
                  <Link to={`/hr/employees/${report.employeeId}`}>
                    {report.globalId} — {report.firstName} {report.lastName}
                  </Link>
                  <span className="whq-muted">
                    {roleLabel(report.businessRole ?? report.roleLevel)} · {employmentStatusLabel(report.employmentStatus)}
                  </span>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </WorkHQCard>
  );
}
