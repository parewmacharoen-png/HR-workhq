export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in'
  | 'is_empty'
  | 'is_not_empty';

export interface FieldCondition {
  fieldKey?: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface RequesterContext {
  companyId?: string;
  position?: string | null;
  role?: string | null;
  teamId?: string | null;
  tenureDays?: number;
}

function resolveFieldValue(
  fieldKey: string | undefined,
  values: Record<string, unknown>,
  requester?: RequesterContext,
): unknown {
  if (!fieldKey) return undefined;
  if (fieldKey.startsWith('requester.')) {
    const prop = fieldKey.slice('requester.'.length);
    return requester ? (requester as Record<string, unknown>)[prop] : undefined;
  }
  return values[fieldKey];
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

export function evaluateCondition(
  condition: FieldCondition | null | undefined,
  values: Record<string, unknown>,
  requester?: RequesterContext,
): boolean {
  if (!condition) return true;
  const left = resolveFieldValue(condition.fieldKey, values, requester);
  const { operator, value } = condition;

  switch (operator) {
    case 'is_empty':
      return isEmpty(left);
    case 'is_not_empty':
      return !isEmpty(left);
    case 'equals':
      return String(left) === String(value);
    case 'not_equals':
      return String(left) !== String(value);
    case 'greater_than':
      return Number(left) > Number(value);
    case 'less_than':
      return Number(left) < Number(value);
    case 'in':
      return Array.isArray(value) ? value.map(String).includes(String(left)) : false;
    case 'not_in':
      return Array.isArray(value) ? !value.map(String).includes(String(left)) : true;
    default:
      return true;
  }
}

export function valuesMapFromRows(
  rows: Array<{ fieldKey: string; valueJson: unknown; valueText?: string | null }>,
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.valueJson !== null && row.valueJson !== undefined) {
      map[row.fieldKey] = row.valueJson;
    } else if (row.valueText != null && row.valueText !== '') {
      map[row.fieldKey] = row.valueText;
    }
  }
  return map;
}
