import { useCallback, useState } from 'react';
import {
  createManualPayrollItem,
  MANUAL_PAYROLL_DEDUCTION_OPTIONS,
  MANUAL_PAYROLL_EARNING_OPTIONS,
  type ManualPayrollItemCategory,
  type ManualPayrollScheduleType,
} from '../../api/manual-payroll-items';
import { WorkHQButton, WorkHQField, WorkHQDateInput } from '../ui';
import { EmployeeSearchSelect } from '../hr/EmployeeSearchSelect';
import { th } from '../../i18n/th-labels';

export interface ManualPayrollItemBuilderProps {
  companyId: string;
  cycleId?: string;
  defaultEmployeeId?: string;
  disabled?: boolean;
  onSuccess?: () => void;
}

export function ManualPayrollItemBuilder({
  companyId,
  cycleId,
  defaultEmployeeId = '',
  disabled = false,
  onSuccess,
}: ManualPayrollItemBuilderProps) {
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId);
  const [direction, setDirection] = useState<'earning' | 'deduction'>('earning');
  const [category, setCategory] = useState<ManualPayrollItemCategory>('bonus');
  const [scheduleType, setScheduleType] = useState<ManualPayrollScheduleType>('one_time');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveUntil, setEffectiveUntil] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryOptions = direction === 'earning'
    ? MANUAL_PAYROLL_EARNING_OPTIONS
    : MANUAL_PAYROLL_DEDUCTION_OPTIONS;

  const handleDirectionChange = useCallback((next: 'earning' | 'deduction') => {
    setDirection(next);
    const options = next === 'earning'
      ? MANUAL_PAYROLL_EARNING_OPTIONS
      : MANUAL_PAYROLL_DEDUCTION_OPTIONS;
    setCategory(options[0]!.key);
  }, []);

  async function handleSubmit() {
    if (!employeeId.trim() || !amount) return;
    setBusy(true);
    setError(null);
    try {
      await createManualPayrollItem({
        companyId,
        employeeId: employeeId.trim(),
        category,
        amount: Number(amount),
        scheduleType,
        effectiveFrom,
        effectiveUntil: effectiveUntil || undefined,
        note: note.trim() || undefined,
        applyToCycleId: cycleId,
      });
      setAmount('');
      setNote('');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : th.common.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="whq-form-stack">
      <WorkHQField label={th.payrollCycle.manualItemEmployee}>
        <EmployeeSearchSelect
          companyId={companyId}
          value={employeeId}
          onChange={setEmployeeId}
          disabled={disabled || busy}
        />
      </WorkHQField>

      <WorkHQField label={th.manualPayrollItem.direction}>
        <select
          className="whq-input"
          value={direction}
          onChange={(e) => handleDirectionChange(e.target.value as 'earning' | 'deduction')}
          disabled={disabled || busy}
        >
          <option value="earning">{th.manualPayrollItem.earning}</option>
          <option value="deduction">{th.manualPayrollItem.deduction}</option>
        </select>
      </WorkHQField>

      <WorkHQField label={th.payrollCycle.manualItemType}>
        <select
          className="whq-input"
          value={category}
          onChange={(e) => setCategory(e.target.value as ManualPayrollItemCategory)}
          disabled={disabled || busy}
        >
          {categoryOptions.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.labelTh}</option>
          ))}
        </select>
      </WorkHQField>

      <WorkHQField label={th.manualPayrollItem.scheduleType}>
        <select
          className="whq-input"
          value={scheduleType}
          onChange={(e) => setScheduleType(e.target.value as ManualPayrollScheduleType)}
          disabled={disabled || busy}
        >
          <option value="one_time">{th.manualPayrollItem.oneTime}</option>
          <option value="recurring">{th.manualPayrollItem.recurring}</option>
        </select>
      </WorkHQField>

      <WorkHQField label={th.manualPayrollItem.effectiveFrom}>
        <WorkHQDateInput
          value={effectiveFrom}
          onChange={setEffectiveFrom}
          disabled={disabled || busy}
        />
      </WorkHQField>

      <WorkHQField label={th.manualPayrollItem.effectiveUntil}>
        <WorkHQDateInput
          value={effectiveUntil}
          onChange={setEffectiveUntil}
          disabled={disabled || busy}
        />
      </WorkHQField>

      <WorkHQField label={th.payrollCycle.manualItemAmount}>
        <input
          type="number"
          className="whq-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
          step="0.01"
          disabled={disabled || busy}
        />
      </WorkHQField>

      <WorkHQField label={th.payrollCycle.manualItemNote}>
        <input
          className="whq-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={disabled || busy}
        />
      </WorkHQField>

      {cycleId && (
        <p className="whq-muted">{th.manualPayrollItem.applyToCycleHint}</p>
      )}

      <WorkHQButton
        type="button"
        variant="secondary"
        disabled={disabled || busy || !employeeId || !amount}
        onClick={() => void handleSubmit()}
      >
        {busy ? '…' : th.payrollCycle.manualItemSubmit}
      </WorkHQButton>

      {error ? <p className="whq-error-text">{error}</p> : null}
    </div>
  );
}
