import { useCallback, useEffect, useState } from 'react';
import {
  archiveCareerPath,
  archivePositionDefinition,
  archivePositionFamily,
  archivePositionLevel,
  archivePromotionPath,
  cloneCareerPath,
  clonePositionDefinition,
  clonePositionFamily,
  clonePositionLevel,
  clonePromotionPath,
  createCareerPath,
  createPositionDefinition,
  createPositionFamily,
  createPositionLevel,
  createPromotionPath,
  deleteCareerPath,
  deletePositionDefinition,
  deletePositionFamily,
  deletePositionLevel,
  deletePromotionPath,
  fetchCareerPaths,
  fetchPositionDefinitions,
  fetchPositionFamilies,
  fetchPositionLevels,
  fetchPromotionPaths,
  type CareerPath,
  type FrameworkEntityBase,
  type PositionDefinition,
  type PositionFamily,
  type PositionLevel,
  type PromotionPath,
  updateCareerPath,
  updatePositionDefinition,
  updatePositionFamily,
  updatePositionLevel,
  updatePromotionPath,
  versionCareerPath,
  versionPositionDefinition,
  versionPositionFamily,
  versionPositionLevel,
  versionPromotionPath,
} from '../../../api/position-framework';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingState } from '../../../components/LoadingState';
import {
  WorkHQBadge,
  WorkHQButton,
  WorkHQCard,
  WorkHQPage,
  WorkHQPageHeader,
} from '../../../components/ui';
import { useAuth, useCompanyId } from '../../../context/AuthContext';
import { th } from '../../../i18n/th-labels';

type Tab = 'families' | 'levels' | 'positions' | 'career-paths' | 'promotion-paths';

const TABS: Tab[] = ['families', 'levels', 'positions', 'career-paths', 'promotion-paths'];

function tabLabel(tab: Tab): string {
  return th.positionFramework.tabs[tab];
}

interface EntityActionsProps<T extends FrameworkEntityBase> {
  row: T;
  busy: boolean;
  canWrite: boolean;
  onClone: (id: string) => void;
  onArchive: (id: string) => void;
  onVersion: (id: string) => void;
  onDelete: (id: string) => void;
  onActivate?: (id: string) => void;
}

function EntityActions<T extends FrameworkEntityBase>({
  row,
  busy,
  canWrite,
  onClone,
  onArchive,
  onVersion,
  onDelete,
  onActivate,
}: EntityActionsProps<T>) {
  if (!canWrite) return null;
  return (
    <div className="whq-btn-group whq-btn-group--inline">
      {row.status === 'draft' && onActivate && (
        <WorkHQButton type="button" variant="primary" disabled={busy} onClick={() => onActivate(row.id)}>
          {th.positionFramework.activate}
        </WorkHQButton>
      )}
      <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={() => onClone(row.id)}>
        {th.positionFramework.clone}
      </WorkHQButton>
      {row.status !== 'archived' && (
        <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={() => onArchive(row.id)}>
          {th.positionFramework.archive}
        </WorkHQButton>
      )}
      <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={() => onVersion(row.id)}>
        {th.positionFramework.newVersion}
      </WorkHQButton>
      <WorkHQButton type="button" variant="secondary" disabled={busy} onClick={() => onDelete(row.id)}>
        {th.positionFramework.delete}
      </WorkHQButton>
    </div>
  );
}

export default function PositionFrameworkPage() {
  const companyId = useCompanyId();
  const { can } = useAuth();
  const canWrite = can('performance:write');

  const [tab, setTab] = useState<Tab>('families');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [families, setFamilies] = useState<PositionFamily[]>([]);
  const [levels, setLevels] = useState<PositionLevel[]>([]);
  const [positions, setPositions] = useState<PositionDefinition[]>([]);
  const [careerPaths, setCareerPaths] = useState<CareerPath[]>([]);
  const [promotionPaths, setPromotionPaths] = useState<PromotionPath[]>([]);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [rankOrder, setRankOrder] = useState(0);
  const [fromPositionId, setFromPositionId] = useState('');
  const [toPositionId, setToPositionId] = useState('');
  const [requirements, setRequirements] = useState('');
  const [stepPositionIds, setStepPositionIds] = useState<string[]>([]);

  const resetForm = () => {
    setCode('');
    setName('');
    setDescription('');
    setFamilyId('');
    setLevelId('');
    setRankOrder(0);
    setFromPositionId('');
    setToPositionId('');
    setRequirements('');
    setStepPositionIds([]);
  };

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [f, l, p, c, pr] = await Promise.all([
        fetchPositionFamilies(companyId),
        fetchPositionLevels(companyId),
        fetchPositionDefinitions(companyId),
        fetchCareerPaths(companyId),
        fetchPromotionPaths(companyId),
      ]);
      setFamilies(f);
      setLevels(l);
      setPositions(p);
      setCareerPaths(c);
      setPromotionPaths(pr);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !code.trim() || !name.trim()) return;
    setBusy(true);
    try {
      if (tab === 'families') {
        await createPositionFamily({ companyId, code: code.trim(), name: name.trim(), description: description.trim() || undefined });
      } else if (tab === 'levels') {
        await createPositionLevel({
          companyId,
          code: code.trim(),
          name: name.trim(),
          familyId: familyId || undefined,
          rankOrder,
          description: description.trim() || undefined,
        });
      } else if (tab === 'positions') {
        await createPositionDefinition({
          companyId,
          code: code.trim(),
          name: name.trim(),
          familyId: familyId || undefined,
          levelId: levelId || undefined,
          description: description.trim() || undefined,
        });
      } else if (tab === 'career-paths') {
        await createCareerPath({
          companyId,
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          steps: stepPositionIds.map((positionDefinitionId, index) => ({
            positionDefinitionId,
            stepOrder: index,
          })),
        });
      } else {
        await createPromotionPath({
          companyId,
          code: code.trim(),
          name: name.trim(),
          description: description.trim() || undefined,
          fromPositionId,
          toPositionId,
          requirements: requirements.trim() || undefined,
        });
      }
      resetForm();
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function activateFamily(id: string) {
    await runAction(async () => { await updatePositionFamily(id, { status: 'active' }); });
  }

  async function activateLevel(id: string) {
    await runAction(async () => { await updatePositionLevel(id, { status: 'active' }); });
  }

  async function activatePosition(id: string) {
    await runAction(async () => { await updatePositionDefinition(id, { status: 'active' }); });
  }

  async function activateCareerPath(id: string) {
    await runAction(async () => { await updateCareerPath(id, { status: 'active' }); });
  }

  async function activatePromotionPath(id: string) {
    await runAction(async () => { await updatePromotionPath(id, { status: 'active' }); });
  }

  function positionLabel(id: string): string {
    const pos = positions.find((p) => p.id === id);
    return pos ? `${pos.code} — ${pos.name}` : id;
  }

  function familyLabel(id: string | null): string {
    if (!id) return th.common.dash;
    const f = families.find((row) => row.id === id);
    return f ? f.name : id;
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

  if (!companyId) {
    return (
      <WorkHQPage>
        <WorkHQCard title={th.employees.selectCompanyTitle}>
          <p>{th.employees.selectCompanyDesc}</p>
        </WorkHQCard>
      </WorkHQPage>
    );
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <WorkHQPage>
      <WorkHQPageHeader
        title={th.positionFramework.title}
        subtitle={th.positionFramework.subtitle}
        actions={canWrite ? (
          <WorkHQButton type="button" variant="primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? th.positionFramework.cancelCreate : th.positionFramework.create}
          </WorkHQButton>
        ) : undefined}
      />

      <div className="whq-approval-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`whq-approval-tab ${tab === t ? 'whq-approval-tab-active' : ''}`}
            onClick={() => { setTab(t); setShowForm(false); resetForm(); }}
          >
            {tabLabel(t)}
          </button>
        ))}
        <WorkHQButton variant="ghost" onClick={() => void load()}>{th.common.refresh}</WorkHQButton>
      </div>

      {showForm && canWrite && (
        <WorkHQCard title={th.positionFramework.createTitle(tabLabel(tab))}>
          <form className="whq-form-stack" onSubmit={(e) => void handleCreate(e)}>
            <div className="whq-form-row">
              <label className="whq-field">
                <span className="whq-field-label">{th.positionFramework.colCode}</span>
                <input className="whq-input" value={code} onChange={(e) => setCode(e.target.value)} required />
              </label>
              <label className="whq-field">
                <span className="whq-field-label">{th.positionFramework.colName}</span>
                <input className="whq-input" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
            </div>
            <label className="whq-field">
              <span className="whq-field-label">{th.positionFramework.colDescription}</span>
              <textarea className="whq-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>

            {tab === 'levels' && (
              <div className="whq-form-row">
                <label className="whq-field">
                  <span className="whq-field-label">{th.positionFramework.colFamily}</span>
                  <select className="whq-input" value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
                    <option value="">{th.positionFramework.noneOption}</option>
                    {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
                <label className="whq-field">
                  <span className="whq-field-label">{th.positionFramework.colRank}</span>
                  <input className="whq-input" type="number" value={rankOrder} onChange={(e) => setRankOrder(Number(e.target.value) || 0)} />
                </label>
              </div>
            )}

            {tab === 'positions' && (
              <div className="whq-form-row">
                <label className="whq-field">
                  <span className="whq-field-label">{th.positionFramework.colFamily}</span>
                  <select className="whq-input" value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
                    <option value="">{th.positionFramework.noneOption}</option>
                    {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
                <label className="whq-field">
                  <span className="whq-field-label">{th.positionFramework.colLevel}</span>
                  <select className="whq-input" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
                    <option value="">{th.positionFramework.noneOption}</option>
                    {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
              </div>
            )}

            {tab === 'career-paths' && (
              <label className="whq-field">
                <span className="whq-field-label">{th.positionFramework.colSteps}</span>
                <select
                  className="whq-input"
                  multiple
                  value={stepPositionIds}
                  onChange={(e) => setStepPositionIds(Array.from(e.target.selectedOptions, (o) => o.value))}
                >
                  {positions.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
                <span className="whq-muted whq-text-sm">{th.positionFramework.stepsHint}</span>
              </label>
            )}

            {tab === 'promotion-paths' && (
              <>
                <div className="whq-form-row">
                  <label className="whq-field">
                    <span className="whq-field-label">{th.positionFramework.colFromPosition}</span>
                    <select className="whq-input" value={fromPositionId} onChange={(e) => setFromPositionId(e.target.value)} required>
                      <option value="">{th.positionFramework.selectPosition}</option>
                      {positions.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                    </select>
                  </label>
                  <label className="whq-field">
                    <span className="whq-field-label">{th.positionFramework.colToPosition}</span>
                    <select className="whq-input" value={toPositionId} onChange={(e) => setToPositionId(e.target.value)} required>
                      <option value="">{th.positionFramework.selectPosition}</option>
                      {positions.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                    </select>
                  </label>
                </div>
                <label className="whq-field">
                  <span className="whq-field-label">{th.positionFramework.colRequirements}</span>
                  <textarea className="whq-input" rows={2} value={requirements} onChange={(e) => setRequirements(e.target.value)} />
                </label>
              </>
            )}

            <WorkHQButton type="submit" variant="primary" disabled={busy}>{th.common.save}</WorkHQButton>
          </form>
        </WorkHQCard>
      )}

      {tab === 'families' && (
        <WorkHQCard title={tabLabel('families')}>
          {families.length === 0 ? (
            <p className="whq-muted">{th.positionFramework.empty}</p>
          ) : (
            <div className="whq-table-wrap">
              <table className="whq-table whq-table--responsive">
                <thead>
                  <tr>
                    <th>{th.positionFramework.colCode}</th>
                    <th>{th.positionFramework.colName}</th>
                    <th>{th.payrollOverview.colStatus}</th>
                    <th>{th.positionFramework.colVersion}</th>
                    {canWrite && <th />}
                  </tr>
                </thead>
                <tbody>
                  {families.map((row) => (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>
                        <div>{row.name}</div>
                        {row.description && <div className="whq-muted whq-text-sm">{row.description}</div>}
                      </td>
                      <td><WorkHQBadge status={row.status} /></td>
                      <td>v{row.version}</td>
                      {canWrite && (
                        <td>
                          <EntityActions
                            row={row}
                            busy={busy}
                            canWrite={canWrite}
                            onActivate={(id) => void activateFamily(id)}
                            onClone={(id) => void runAction(async () => { await clonePositionFamily(id); })}
                            onArchive={(id) => void runAction(async () => { await archivePositionFamily(id); })}
                            onVersion={(id) => void runAction(async () => { await versionPositionFamily(id); })}
                            onDelete={(id) => setDeleteId(id)}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WorkHQCard>
      )}

      {tab === 'levels' && (
        <WorkHQCard title={tabLabel('levels')}>
          {levels.length === 0 ? (
            <p className="whq-muted">{th.positionFramework.empty}</p>
          ) : (
            <div className="whq-table-wrap">
              <table className="whq-table whq-table--responsive">
                <thead>
                  <tr>
                    <th>{th.positionFramework.colCode}</th>
                    <th>{th.positionFramework.colName}</th>
                    <th>{th.positionFramework.colFamily}</th>
                    <th>{th.positionFramework.colRank}</th>
                    <th>{th.payrollOverview.colStatus}</th>
                    <th>{th.positionFramework.colVersion}</th>
                    {canWrite && <th />}
                  </tr>
                </thead>
                <tbody>
                  {levels.map((row) => (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td>{familyLabel(row.familyId)}</td>
                      <td>{row.rankOrder}</td>
                      <td><WorkHQBadge status={row.status} /></td>
                      <td>v{row.version}</td>
                      {canWrite && (
                        <td>
                          <EntityActions
                            row={row}
                            busy={busy}
                            canWrite={canWrite}
                            onActivate={(id) => void activateLevel(id)}
                            onClone={(id) => void runAction(async () => { await clonePositionLevel(id); })}
                            onArchive={(id) => void runAction(async () => { await archivePositionLevel(id); })}
                            onVersion={(id) => void runAction(async () => { await versionPositionLevel(id); })}
                            onDelete={(id) => setDeleteId(id)}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WorkHQCard>
      )}

      {tab === 'positions' && (
        <WorkHQCard title={tabLabel('positions')}>
          {positions.length === 0 ? (
            <p className="whq-muted">{th.positionFramework.empty}</p>
          ) : (
            <div className="whq-table-wrap">
              <table className="whq-table whq-table--responsive">
                <thead>
                  <tr>
                    <th>{th.positionFramework.colCode}</th>
                    <th>{th.positionFramework.colName}</th>
                    <th>{th.positionFramework.colFamily}</th>
                    <th>{th.positionFramework.colLevel}</th>
                    <th>{th.payrollOverview.colStatus}</th>
                    <th>{th.positionFramework.colVersion}</th>
                    {canWrite && <th />}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((row) => (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td>{familyLabel(row.familyId)}</td>
                      <td>{levels.find((l) => l.id === row.levelId)?.name ?? th.common.dash}</td>
                      <td><WorkHQBadge status={row.status} /></td>
                      <td>v{row.version}</td>
                      {canWrite && (
                        <td>
                          <EntityActions
                            row={row}
                            busy={busy}
                            canWrite={canWrite}
                            onActivate={(id) => void activatePosition(id)}
                            onClone={(id) => void runAction(async () => { await clonePositionDefinition(id); })}
                            onArchive={(id) => void runAction(async () => { await archivePositionDefinition(id); })}
                            onVersion={(id) => void runAction(async () => { await versionPositionDefinition(id); })}
                            onDelete={(id) => setDeleteId(id)}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WorkHQCard>
      )}

      {tab === 'career-paths' && (
        <WorkHQCard title={tabLabel('career-paths')}>
          {careerPaths.length === 0 ? (
            <p className="whq-muted">{th.positionFramework.empty}</p>
          ) : (
            <div className="whq-table-wrap">
              <table className="whq-table whq-table--responsive">
                <thead>
                  <tr>
                    <th>{th.positionFramework.colCode}</th>
                    <th>{th.positionFramework.colName}</th>
                    <th>{th.positionFramework.colSteps}</th>
                    <th>{th.payrollOverview.colStatus}</th>
                    <th>{th.positionFramework.colVersion}</th>
                    {canWrite && <th />}
                  </tr>
                </thead>
                <tbody>
                  {careerPaths.map((row) => (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td>
                        {row.steps.length === 0 ? th.common.dash : row.steps
                          .sort((a, b) => a.stepOrder - b.stepOrder)
                          .map((s) => positionLabel(s.positionDefinitionId))
                          .join(' → ')}
                      </td>
                      <td><WorkHQBadge status={row.status} /></td>
                      <td>v{row.version}</td>
                      {canWrite && (
                        <td>
                          <EntityActions
                            row={row}
                            busy={busy}
                            canWrite={canWrite}
                            onActivate={(id) => void activateCareerPath(id)}
                            onClone={(id) => void runAction(async () => { await cloneCareerPath(id); })}
                            onArchive={(id) => void runAction(async () => { await archiveCareerPath(id); })}
                            onVersion={(id) => void runAction(async () => { await versionCareerPath(id); })}
                            onDelete={(id) => setDeleteId(id)}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WorkHQCard>
      )}

      {tab === 'promotion-paths' && (
        <WorkHQCard title={tabLabel('promotion-paths')}>
          {promotionPaths.length === 0 ? (
            <p className="whq-muted">{th.positionFramework.empty}</p>
          ) : (
            <div className="whq-table-wrap">
              <table className="whq-table whq-table--responsive">
                <thead>
                  <tr>
                    <th>{th.positionFramework.colCode}</th>
                    <th>{th.positionFramework.colName}</th>
                    <th>{th.positionFramework.colFromPosition}</th>
                    <th>{th.positionFramework.colToPosition}</th>
                    <th>{th.payrollOverview.colStatus}</th>
                    <th>{th.positionFramework.colVersion}</th>
                    {canWrite && <th />}
                  </tr>
                </thead>
                <tbody>
                  {promotionPaths.map((row) => (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>
                        <div>{row.name}</div>
                        {row.requirements && <div className="whq-muted whq-text-sm">{row.requirements}</div>}
                      </td>
                      <td>{positionLabel(row.fromPositionId)}</td>
                      <td>{positionLabel(row.toPositionId)}</td>
                      <td><WorkHQBadge status={row.status} /></td>
                      <td>v{row.version}</td>
                      {canWrite && (
                        <td>
                          <EntityActions
                            row={row}
                            busy={busy}
                            canWrite={canWrite}
                            onActivate={(id) => void activatePromotionPath(id)}
                            onClone={(id) => void runAction(async () => { await clonePromotionPath(id); })}
                            onArchive={(id) => void runAction(async () => { await archivePromotionPath(id); })}
                            onVersion={(id) => void runAction(async () => { await versionPromotionPath(id); })}
                            onDelete={(id) => setDeleteId(id)}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </WorkHQCard>
      )}

      <ConfirmModal
        open={deleteId != null}
        title={th.positionFramework.deleteConfirmTitle}
        message={th.positionFramework.deleteConfirmMessage}
        confirmLabel={th.positionFramework.delete}
        onClose={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          const id = deleteId;
          if (tab === 'families') await deletePositionFamily(id);
          else if (tab === 'levels') await deletePositionLevel(id);
          else if (tab === 'positions') await deletePositionDefinition(id);
          else if (tab === 'career-paths') await deleteCareerPath(id);
          else await deletePromotionPath(id);
          await load();
        }}
      />
    </WorkHQPage>
  );
}
