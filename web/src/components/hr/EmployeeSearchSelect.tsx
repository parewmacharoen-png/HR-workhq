import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { fetchEmployeeList, type EmployeeListItem } from '../../api/employees';
import {
  employeeCompactLabel,
  employeeFullName,
  employeeOptionMeta,
  employeeSearchHaystack,
} from '../../lib/employee-display';
import { WorkHQInput } from '../ui';
import { th } from '../../i18n/th-labels';

function EmployeeSearchOption({ employee }: { employee: EmployeeListItem }) {
  const name = employeeFullName(employee);
  return (
    <>
      <span className="whq-employee-search-select__option-name">
        {name}
        {employee.nickname ? (
          <span className="whq-employee-search-select__option-nick"> ({employee.nickname})</span>
        ) : null}
      </span>
      <span className="whq-employee-search-select__option-meta">
        {employeeOptionMeta(employee)}
      </span>
    </>
  );
}

export interface EmployeeSearchSelectProps {
  companyId: string;
  value: string;
  onChange: (employeeId: string) => void;
  disabled?: boolean;
  /** @deprecated prefer workforceOnly for payroll contexts */
  status?: string;
  /** Match payroll builder — active + probation (default true) */
  workforceOnly?: boolean;
}

export function EmployeeSearchSelect({
  companyId,
  value,
  onChange,
  disabled = false,
  status,
  workforceOnly = true,
}: EmployeeSearchSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeListItem | null>(null);

  const displayValue = open ? query : '';

  const listFilter = workforceOnly
    ? { workforceOnly: true as const }
    : { status: status || undefined };

  const loadOptions = useCallback(async (search: string) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const result = await fetchEmployeeList({
        companyId,
        search: search.trim() || undefined,
        ...listFilter,
      });
      setOptions(result.items);
    } finally {
      setLoading(false);
    }
  }, [companyId, workforceOnly, status]);

  useEffect(() => {
    if (!value) {
      setSelectedEmployee(null);
      return;
    }
    const match = options.find((row) => row.id === value);
    if (match) {
      setSelectedEmployee(match);
      return;
    }
    void fetchEmployeeList({ companyId, ...listFilter }).then((result) => {
      const row = result.items.find((item) => item.id === value);
      if (row) setSelectedEmployee(row);
    });
  }, [value, options, companyId, workforceOnly, status]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      void loadOptions(query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query, loadOptions]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((row) => employeeSearchHaystack(row).includes(q));
  }, [options, query]);

  function selectEmployee(employee: EmployeeListItem) {
    onChange(employee.id);
    setSelectedEmployee(employee);
    setQuery('');
    setOpen(false);
  }

  function clearSelection() {
    onChange('');
    setSelectedEmployee(null);
    setQuery('');
  }

  return (
    <div ref={rootRef} className="whq-employee-search-select">
      <WorkHQInput
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        value={displayValue}
        placeholder={th.employees.searchPlaceholder}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          if (!options.length) void loadOptions('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value.trim()) clearSelection();
        }}
      />
      {selectedEmployee && !open && !disabled && (
        <div className="whq-employee-search-select__selected" aria-live="polite">
          <span className="whq-employee-search-select__chip">
            <span className="whq-employee-search-select__chip-name">
              {employeeFullName(selectedEmployee)}
              {selectedEmployee.nickname ? ` (${selectedEmployee.nickname})` : ''}
            </span>
            <span className="whq-employee-search-select__chip-meta">
              {selectedEmployee.globalId}
              {selectedEmployee.teamName ? ` · ${selectedEmployee.teamName}` : ''}
            </span>
            <button
              type="button"
              className="whq-employee-search-select__chip-remove"
              aria-label="ล้างการเลือกพนักงาน"
              onClick={clearSelection}
            >
              ×
            </button>
          </span>
        </div>
      )}
      {open && !disabled && (
        <ul id={listId} className="whq-employee-search-select__list" role="listbox">
          {loading && <li className="whq-muted whq-employee-search-select__empty">…</li>}
          {!loading && filteredOptions.length === 0 && (
            <li className="whq-muted whq-employee-search-select__empty">{th.employees.noResults}</li>
          )}
          {!loading && filteredOptions.map((employee) => (
            <li key={employee.id}>
              <button
                type="button"
                className="whq-employee-search-select__option"
                role="option"
                aria-selected={employee.id === value}
                aria-label={employeeCompactLabel(employee)}
                onClick={() => selectEmployee(employee)}
              >
                <EmployeeSearchOption employee={employee} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
