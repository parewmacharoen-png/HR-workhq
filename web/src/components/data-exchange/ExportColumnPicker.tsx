import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';

export interface ColumnDef {
  key: string;
  label: string;
  sensitive?: boolean;
}

interface ExportColumnPickerProps {
  module: string;
  selected: string[];
  onChange: (cols: string[]) => void;
  canViewSensitive?: boolean;
}

export function ExportColumnPicker({ module, selected, onChange, canViewSensitive = false }: ExportColumnPickerProps) {
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void apiGet<ColumnDef[]>(`/exports/columns/${module}`).then(setColumns).catch(() => setColumns([]));
  }, [module]);

  const visible = columns.filter((c) => {
    if (c.sensitive && !canViewSensitive) return false;
    if (!search.trim()) return true;
    return c.label.toLowerCase().includes(search.toLowerCase()) || c.key.toLowerCase().includes(search.toLowerCase());
  });

  function toggle(key: string) {
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key));
    else onChange([...selected, key]);
  }

  return (
    <div className="whq-column-picker">
      <input className="whq-input" placeholder="ค้นหาคอลัมน์" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul style={{ listStyle: 'none', padding: 0, maxHeight: 240, overflow: 'auto' }}>
        {visible.map((c) => (
          <li key={c.key}>
            <label>
              <input type="checkbox" checked={selected.includes(c.key)} onChange={() => toggle(c.key)} />
              {' '}{c.label}{c.sensitive ? ' 🔒' : ''}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
