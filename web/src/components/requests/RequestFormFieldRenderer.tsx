import type { ReactNode } from 'react';
import { WorkHQSelect } from '../ui/WorkHQSelect';
import { WorkHQDateInput } from '../ui/WorkHQDateInput';

export interface DynamicFormField {
  key: string;
  labelTh: string;
  fieldType: string;
  required?: boolean;
  optionsJson?: Array<{ label: string; value: string }>;
  placeholder?: string | null;
  helpText?: string | null;
}

interface Props {
  field: DynamicFormField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

const BUTTON_TYPES = new Set([
  'select', 'radio', 'button_select', 'leave_type_picker', 'shift_picker',
  'document_type_picker', 'bank_picker', 'relationship_picker',
]);

export function RequestFormFieldRenderer({ field, value, onChange }: Props): ReactNode {
  const opts = field.optionsJson ?? [];

  if (BUTTON_TYPES.has(field.fieldType)) {
    return (
      <label className="whq-field">
        <span>{field.labelTh}{field.required ? ' *' : ''}</span>
        <WorkHQSelect
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, e.target.value)}
          required={field.required}
        >
          <option value="">— เลือก —</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </WorkHQSelect>
      </label>
    );
  }

  if (field.fieldType === 'quick_date' || field.fieldType === 'date') {
    return (
      <label className="whq-field">
        <span>{field.labelTh}{field.required ? ' *' : ''}</span>
        <WorkHQDateInput
          value={String(value ?? '')}
          onChange={(iso) => onChange(field.key, iso)}
          required={field.required}
        />
      </label>
    );
  }

  if (field.fieldType === 'quick_time' || field.fieldType === 'time') {
    return (
      <label className="whq-field">
        <span>{field.labelTh}{field.required ? ' *' : ''}</span>
        <input
          type="time"
          className="whq-input"
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, e.target.value)}
          required={field.required}
        />
      </label>
    );
  }

  if (field.fieldType === 'quick_amount' || field.fieldType === 'currency' || field.fieldType === 'number') {
    return (
      <label className="whq-field">
        <span>{field.labelTh}{field.required ? ' *' : ''}</span>
        <input
          type="number"
          className="whq-input"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(field.key, e.target.value)}
          required={field.required}
          min={0}
        />
      </label>
    );
  }

  if (field.fieldType === 'textarea') {
    return (
      <label className="whq-field">
        <span>{field.labelTh}{field.required ? ' *' : ''}</span>
        <textarea
          className="whq-input"
          rows={3}
          value={String(value ?? '')}
          onChange={(e) => onChange(field.key, e.target.value)}
          required={field.required}
          placeholder={field.placeholder ?? undefined}
        />
      </label>
    );
  }

  return (
    <label className="whq-field">
      <span>{field.labelTh}{field.required ? ' *' : ''}</span>
      <input
        className="whq-input"
        value={String(value ?? '')}
        onChange={(e) => onChange(field.key, e.target.value)}
        required={field.required}
        placeholder={field.placeholder ?? undefined}
      />
    </label>
  );
}
