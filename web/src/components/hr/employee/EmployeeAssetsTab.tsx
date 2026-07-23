import { useCallback, useEffect, useState } from 'react';
import {
  fetchEmployeeAssets,
  returnAsset,
  type EmployeeAssetsResponse,
} from '../../../api/assets';
import { useAuth } from '../../../context/AuthContext';
import { formatThaiDate } from '../../../lib/employee-date-utils';
import { th } from '../../../i18n/th-labels';
import { LoadingState } from '../../../components/LoadingState';
import { ErrorState } from '../../../components/ErrorState';
import {
  WorkHQButton,
  WorkHQCard,
} from '../../ui';
import { WorkHQEmptyState } from '../../workhq';

interface EmployeeAssetsTabProps {
  employeeId: string;
  companyId: string;
}

export function EmployeeAssetsTab({ employeeId, companyId }: EmployeeAssetsTabProps) {
  const { can, canAny } = useAuth();
  const canWrite = canAny('asset:write', 'employee:write');
  const [data, setData] = useState<EmployeeAssetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetchEmployeeAssets(companyId, employeeId);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [companyId, employeeId]);

  useEffect(() => { void load(); }, [load]);

  const handleReturn = async (assetId: string) => {
    setReturningId(assetId);
    setActionError(null);
    try {
      await returnAsset(assetId);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : th.assets.returnFailed);
    } finally {
      setReturningId(null);
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;

  const active = data?.active ?? [];
  const history = (data?.history ?? []).filter((row) => row.returnedAt);

  return (
    <div className="whq-stack whq-stack--md">
      <WorkHQCard title={th.assets.employeeActiveTitle}>
        {actionError ? <p className="whq-text-danger">{actionError}</p> : null}
        {!active.length ? (
          <WorkHQEmptyState title={th.assets.employeeActiveEmpty} />
        ) : (
          <table className="whq-table whq-table--compact">
            <thead>
              <tr>
                <th>{th.assets.colItem}</th>
                <th>{th.assets.colBorrowedAt}</th>
                <th>{th.assets.colNotes}</th>
                {canWrite ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {active.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>{row.asset?.name ?? row.assetId}</div>
                    {row.asset?.assetTag ? (
                      <div className="whq-muted whq-text-sm">{row.asset.assetTag}</div>
                    ) : null}
                  </td>
                  <td>{formatThaiDate(row.assignedAt)}</td>
                  <td>{row.conditionOut || '—'}</td>
                  {canWrite ? (
                    <td>
                      <WorkHQButton
                        type="button"
                        variant="secondary"
                        disabled={returningId === row.assetId}
                        onClick={() => void handleReturn(row.assetId)}
                      >
                        {returningId === row.assetId ? th.assets.returning : th.assets.returnItem}
                      </WorkHQButton>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </WorkHQCard>

      <WorkHQCard title={th.assets.employeeHistoryTitle}>
        {!history.length ? (
          <p className="whq-muted">{th.assets.employeeHistoryEmpty}</p>
        ) : (
          <table className="whq-table whq-table--compact">
            <thead>
              <tr>
                <th>{th.assets.colItem}</th>
                <th>{th.assets.colBorrowedAt}</th>
                <th>{th.assets.colReturnedAt}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id}>
                  <td>{row.asset?.name ?? row.assetId}</td>
                  <td>{formatThaiDate(row.assignedAt)}</td>
                  <td>{row.returnedAt ? formatThaiDate(row.returnedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </WorkHQCard>
    </div>
  );
}
