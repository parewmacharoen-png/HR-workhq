import { useCallback, useEffect, useState } from 'react';
import {
  archiveKpiTemplate,
  cloneKpiTemplate,
  createKpiTemplate,
  deleteKpiTemplate,
  fetchKpiTemplates,
  versionKpiTemplate,
  type KpiMetricInput,
  type KpiScoringMethod,
  type KpiTargetType,
  type KpiTemplate,
  updateKpiTemplate,
} from '../../../api/kpi';
import { fetchPositionDefinitions } from '../../../api/position-framework';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { useAuth } from '../../../context/AuthContext';
import { useCompanyScope } from '../../../hooks/useCompanyScope';
import { useScopedCompanyId } from '../../../hooks/useScopedCompanyId';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import { CompanyScopePicker, WorkHQSelectCompanyState } from '../../../components/workhq';
import {
  WorkHQBadge,
  WorkHQButton,
  WorkHQCard,
  WorkHQPage,
  WorkHQPageHeader,
} from '../../../components/ui';
import { th } from '../../../i18n/th-labels';
import { fetchForEachCompany } from '../../../utils/multi-company';

const TARGET_TYPES: KpiTargetType[] = ['number', 'percent', 'boolean', 'rating', 'text'];
const SCORING_METHODS: KpiScoringMethod[] = ['manual', 'formula', 'system', 'api', 'imported'];

function emptyMetric(): KpiMetricInput {
  return { name: '', weight: 0, targetType: 'number', scoringMethod: 'manual' };
}

export default function KpiTemplatesPage() {
  const {
    companies,
    scopedCompanyIds,
    hasCompanyScope,
    isAllCompanies,
  } = useCompanyScope();
  const {
    companyId,
    setLocalCompanyId,
    needsLocalPicker,
  } = useScopedCompanyId();
  const { can } = useAuth();
  const canWrite = can('performance:write');

  const [templates, setTemplates] = useState<Array<KpiTemplate & { companyName?: string }>>([]);
  const [positions, setPositions] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [positionDefinitionId, setPositionDefinitionId] = useState('');
  const [applicableRole, setApplicableRole] = useState('');
  const [applicableDepartment, setApplicableDepartment] = useState('');
  const [metrics, setMetrics] = useState<KpiMetricInput[]>([emptyMetric()]);

  const load = useCallback(async () => {
    if (!hasCompanyScope) return;
    setLoading(true);
    try {
      if (isAllCompanies) {
        const templateRows = await fetchForEachCompany(scopedCompanyIds, (id) => fetchKpiTemplates(id));
        setTemplates(templateRows.flatMap((row) =>
          row.result.map((template) => ({
            ...template,
            companyName: companies.find((company) => company.id === row.companyId)?.name ?? row.companyId,
          })),
        ));
        const positionRows = await fetchPositionDefinitions(scopedCompanyIds[0]);
        setPositions(positionRows
          .filter((p) => p.status === 'active')
          .map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })));
      } else if (companyId) {
        const [templateRows, positionRows] = await Promise.all([
          fetchKpiTemplates(companyId),
          fetchPositionDefinitions(companyId),
        ]);
        setTemplates(templateRows);
        setPositions(positionRows
          .filter((p) => p.status === 'active')
          .map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` })));
      }
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [companyId, companies, hasCompanyScope, isAllCompanies, scopedCompanyIds]);

  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setName('');
    setDescription('');
    setPositionDefinitionId('');
    setApplicableRole('');
    setApplicableDepartment('');
    setMetrics([emptyMetric()]);
  }

  function updateMetric(index: number, patch: Partial<KpiMetricInput>) {
    setMetrics((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function positionLabel(id: string | null): string {
    if (!id) return th.common.dash;
    return positions.find((p) => p.id === id)?.label ?? id;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !name.trim()) return;
    setBusy(true);
    try {
      await createKpiTemplate({
        companyId,
        name: name.trim(),
        description: description.trim() || undefined,
        positionDefinitionId: positionDefinitionId || undefined,
        applicableRole: applicableRole.trim() || undefined,
        applicableDepartment: applicableDepartment.trim() || undefined,
        metrics: metrics.filter((m) => m.name.trim()),
      });
      resetForm();
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runTemplateAction(action: (id: string) => Promise<unknown>, id: string) {
    setBusy(true);
    try {
      await action(id);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function activateTemplate(id: string) {
    await runTemplateAction((templateId) => updateKpiTemplate(templateId, { status: 'active' }), id);
  }

  if (!can('performance:read')) {
    return (
      <WorkHQPage>
        <WorkHQCard title={th.kpi.accessDeniedTitle}>
          <p>{th.kpi.accessDeniedDesc}</p>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  if (!hasCompanyScope) {
    return (
      <WorkHQPage>
        <WorkHQSelectCompanyState />
      </WorkHQPage>
    );
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <WorkHQPage>
      <WorkHQPageHeader
        title={th.kpi.templatesTitle}
        subtitle={th.kpi.templatesSubtitle}
        actions={canWrite ? (
          <WorkHQButton type="button" variant="primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? th.kpi.cancelCreate : th.kpi.createTemplate}
          </WorkHQButton>
        ) : undefined}
      />

      {showForm && canWrite && (
        <WorkHQCard title={th.kpi.createTemplateTitle}>
          <form className="whq-form-stack" onSubmit={(e) => void handleCreate(e)}>
            <label className="whq-field">
              <span className="whq-field-label">{th.kpi.colName}</span>
              <input className="whq-input" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="whq-field">
              <span className="whq-field-label">{th.kpi.colDescription}</span>
              <textarea className="whq-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="whq-field">
              <span className="whq-field-label">{th.kpi.colPosition}</span>
              <select className="whq-input" value={positionDefinitionId} onChange={(e) => setPositionDefinitionId(e.target.value)}>
                <option value="">{th.kpi.selectPosition}</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <div className="whq-form-row">
              <label className="whq-field">
                <span className="whq-field-label">{th.kpi.colRole}</span>
                <input className="whq-input" value={applicableRole} onChange={(e) => setApplicableRole(e.target.value)} />
              </label>
              <label className="whq-field">
                <span className="whq-field-label">{th.kpi.colDepartment}</span>
                <input className="whq-input" value={applicableDepartment} onChange={(e) => setApplicableDepartment(e.target.value)} />
              </label>
            </div>

            <h4>{th.kpi.metricsTitle}</h4>
            {metrics.map((metric, index) => (
              <div key={index} className="whq-form-stack whq-metric-row">
                <div className="whq-form-row">
                  <label className="whq-field">
                    <span className="whq-field-label">{th.kpi.colMetricName}</span>
                    <input
                      className="whq-input"
                      value={metric.name}
                      onChange={(e) => updateMetric(index, { name: e.target.value })}
                    />
                  </label>
                  <label className="whq-field">
                    <span className="whq-field-label">{th.kpi.colWeight}</span>
                    <input
                      className="whq-input"
                      type="number"
                      min={0}
                      step={0.1}
                      value={metric.weight}
                      onChange={(e) => updateMetric(index, { weight: Number(e.target.value) || 0 })}
                    />
                  </label>
                  <label className="whq-field">
                    <span className="whq-field-label">{th.kpi.colTargetType}</span>
                    <select
                      className="whq-input"
                      value={metric.targetType}
                      onChange={(e) => updateMetric(index, { targetType: e.target.value as KpiTargetType })}
                    >
                      {TARGET_TYPES.map((type) => (
                        <option key={type} value={type}>{th.kpi.targetTypes[type]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="whq-field">
                    <span className="whq-field-label">{th.kpi.colScoringMethod}</span>
                    <select
                      className="whq-input"
                      value={metric.scoringMethod ?? 'manual'}
                      onChange={(e) => updateMetric(index, { scoringMethod: e.target.value as KpiScoringMethod })}
                    >
                      {SCORING_METHODS.map((method) => (
                        <option key={method} value={method}>{th.kpi.scoringMethods[method]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="whq-form-row">
                  <label className="whq-field">
                    <span className="whq-field-label">{th.kpi.colTargetValue}</span>
                    <input
                      className="whq-input"
                      value={metric.targetValue ?? ''}
                      onChange={(e) => updateMetric(index, { targetValue: e.target.value })}
                    />
                  </label>
                  <label className="whq-field">
                    <span className="whq-field-label">{th.kpi.colDescription}</span>
                    <input
                      className="whq-input"
                      value={metric.description ?? ''}
                      onChange={(e) => updateMetric(index, { description: e.target.value })}
                    />
                  </label>
                </div>
                {(metric.scoringMethod === 'formula' || metric.scoringMethod === 'imported') && (
                  <label className="whq-field">
                    <span className="whq-field-label">{th.kpi.colFormula}</span>
                    <input
                      className="whq-input"
                      placeholder={th.kpi.formulaPlaceholder}
                      value={metric.formulaExpression ?? ''}
                      onChange={(e) => updateMetric(index, { formulaExpression: e.target.value })}
                    />
                  </label>
                )}
                {(metric.scoringMethod === 'system' || metric.scoringMethod === 'imported') && (
                  <label className="whq-field">
                    <span className="whq-field-label">{th.kpi.colSystemSource}</span>
                    <input
                      className="whq-input"
                      placeholder={th.kpi.systemSourcePlaceholder}
                      value={metric.systemSourceKey ?? ''}
                      onChange={(e) => updateMetric(index, { systemSourceKey: e.target.value })}
                    />
                  </label>
                )}
                {metric.scoringMethod === 'api' && (
                  <div className="whq-form-row">
                    <label className="whq-field">
                      <span className="whq-field-label">{th.kpi.colApiEndpoint}</span>
                      <input
                        className="whq-input"
                        value={metric.apiEndpoint ?? ''}
                        onChange={(e) => updateMetric(index, { apiEndpoint: e.target.value })}
                      />
                    </label>
                    <label className="whq-field">
                      <span className="whq-field-label">{th.kpi.colApiField}</span>
                      <input
                        className="whq-input"
                        value={metric.apiFieldPath ?? ''}
                        onChange={(e) => updateMetric(index, { apiFieldPath: e.target.value })}
                      />
                    </label>
                  </div>
                )}
                {metrics.length > 1 && (
                  <WorkHQButton
                    type="button"
                    variant="secondary"
                    onClick={() => setMetrics((rows) => rows.filter((_, i) => i !== index))}
                  >
                    {th.kpi.removeMetric}
                  </WorkHQButton>
                )}
              </div>
            ))}
            <WorkHQButton type="button" variant="secondary" onClick={() => setMetrics((rows) => [...rows, emptyMetric()])}>
              {th.kpi.addMetric}
            </WorkHQButton>
            <div className="whq-btn-group">
              <WorkHQButton type="submit" variant="primary" disabled={busy}>
                {th.kpi.saveTemplate}
              </WorkHQButton>
            </div>
          </form>
        </WorkHQCard>
      )}

      <WorkHQCard title={th.kpi.templatesListTitle}>
        {templates.length === 0 ? (
          <p className="whq-muted">{th.kpi.emptyTemplates}</p>
        ) : (
          <div className="whq-table-wrap">
            <table className="whq-table whq-table--responsive">
              <thead>
                <tr>
                  <th>{th.kpi.colName}</th>
                  <th>{th.kpi.colMetrics}</th>
                  <th>{th.kpi.colPosition}</th>
                  <th>{th.payrollOverview.colStatus}</th>
                  <th>{th.kpi.colVersion}</th>
                  <th>{th.kpi.colRole}</th>
                  <th>{th.kpi.colDepartment}</th>
                  {canWrite && <th />}
                </tr>
              </thead>
              <tbody>
                {templates.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div>{row.name}</div>
                      {row.description && <div className="whq-muted whq-text-sm">{row.description}</div>}
                    </td>
                    <td>{row.metrics.length}</td>
                    <td>{positionLabel(row.positionDefinitionId)}</td>
                    <td><WorkHQBadge status={row.status} /></td>
                    <td>v{row.version}</td>
                    <td>{row.applicableRole ?? th.common.dash}</td>
                    <td>{row.applicableDepartment ?? th.common.dash}</td>
                    {canWrite && (
                      <td>
                        <div className="whq-btn-group whq-btn-group--inline">
                          {row.status === 'draft' && (
                            <WorkHQButton
                              type="button"
                              variant="primary"
                              disabled={busy}
                              onClick={() => void activateTemplate(row.id)}
                            >
                              {th.kpi.activateTemplate}
                            </WorkHQButton>
                          )}
                          <WorkHQButton
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void runTemplateAction(cloneKpiTemplate, row.id)}
                          >
                            {th.kpi.cloneTemplate}
                          </WorkHQButton>
                          {row.status !== 'archived' && (
                            <WorkHQButton
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void runTemplateAction(archiveKpiTemplate, row.id)}
                            >
                              {th.kpi.archiveTemplate}
                            </WorkHQButton>
                          )}
                          <WorkHQButton
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void runTemplateAction(versionKpiTemplate, row.id)}
                          >
                            {th.kpi.newVersion}
                          </WorkHQButton>
                          <WorkHQButton
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => setDeleteId(row.id)}
                          >
                            {th.kpi.deleteTemplate}
                          </WorkHQButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkHQCard>

      <ConfirmModal
        open={deleteId != null}
        title={th.kpi.deleteTemplateTitle}
        message={th.kpi.deleteTemplateMessage}
        confirmLabel={th.kpi.deleteTemplate}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          await deleteKpiTemplate(deleteId);
          await load();
        }}
      />
    </WorkHQPage>
  );
}
