import type { CompanyOption } from '../../api/client';
import { th } from '../../i18n/th-labels';

interface CompanyScopePickerProps {
  companies: CompanyOption[];
  companyIds: string[];
  value: string;
  onChange: (companyId: string) => void;
  label?: string;
}

export function CompanyScopePicker({
  companies,
  companyIds,
  value,
  onChange,
  label = 'บริษัทที่กำลังดู',
}: CompanyScopePickerProps) {
  if (companyIds.length <= 1) return null;

  return (
    <label className="whq-field whq-mb-md">
      <span className="whq-field-label">{label}</span>
      <select
        className="whq-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {companyIds.map((id) => {
          const company = companies.find((row) => row.id === id);
          return (
            <option key={id} value={id}>
              {company ? `${company.name} (${company.code})` : id}
            </option>
          );
        })}
      </select>
      <span className="whq-muted whq-text-sm">
        เลือกบริษัทก่อนบันทึกยืม
      </span>
    </label>
  );
}
