interface ExportFilterBuilderProps {
  module: string;
  filters: Record<string, string>;
  onChange: (filters: Record<string, string>) => void;
}

const FILTER_FIELDS: Record<string, Array<{ key: string; label: string; type?: string }>> = {
  employees: [
    { key: 'status', label: 'Status' },
    { key: 'teamId', label: 'Team ID' },
    { key: 'search', label: 'Search' },
  ],
  attendance: [
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' },
    { key: 'teamId', label: 'Team' },
  ],
  leave: [
    { key: 'leaveType', label: 'Leave Type' },
    { key: 'status', label: 'Status' },
    { key: 'dateFrom', label: 'From', type: 'date' },
  ],
  payroll: [
    { key: 'cycleId', label: 'Payroll Cycle' },
    { key: 'teamId', label: 'Team' },
  ],
};

export function ExportFilterBuilder({ module, filters, onChange }: ExportFilterBuilderProps) {
  const fields = FILTER_FIELDS[module] ?? [{ key: 'search', label: 'Search' }];

  function setField(key: string, value: string) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="whq-filter-builder">
      {fields.map((f) => (
        <label key={f.key} style={{ display: 'block', marginBottom: 8 }}>
          {f.label}
          <input
            className="whq-input"
            type={f.type ?? 'text'}
            value={filters[f.key] ?? ''}
            onChange={(e) => setField(f.key, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
