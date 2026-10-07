import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EmployeePerCompanyOrgFields } from './EmployeePerCompanyOrgFields';

vi.mock('../../api/employee-employment', () => ({
  fetchCompanyTeams: vi.fn(),
}));

import { fetchCompanyTeams } from '../../api/employee-employment';

const companies = [
  { id: 'kw', name: 'KW Company' },
  { id: 'sb', name: 'SB Company' },
  { id: 'hh', name: 'HH Company' },
];

const teams: Record<string, Array<{ id: string; companyId: string; name: string }>> = {
  kw: [{ id: 'kw-1', companyId: 'kw', name: 'KW Team 1' }],
  sb: [{ id: 'sb-3', companyId: 'sb', name: 'SB Team 3' }],
};

describe('EmployeePerCompanyOrgFields with companyPicker', () => {
  beforeEach(() => {
    vi.mocked(fetchCompanyTeams).mockImplementation(async (cid: string) => teams[cid] ?? []);
  });

  it('shows company, department and team side by side for each company row', async () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    const onChange = vi.fn();
    render(
      <EmployeePerCompanyOrgFields
        companyIds={['kw', 'sb']}
        companies={companies}
        value={{ kw: { department: '', teamId: '' }, sb: { department: '', teamId: '' } }}
        onChange={onChange}
        companyPicker={{ rows: ['kw', 'sb'], onSelect, onRemove: vi.fn(), onAdd }}
      />,
    );

    expect(screen.getByText('บริษัทหลัก')).toBeInTheDocument();
    expect(screen.getByText('บริษัทที่ 2')).toBeInTheDocument();
    expect(screen.getAllByText('บริษัท')).toHaveLength(2);

    // A company already used in another row is not offered again.
    const [primarySelect, secondSelect] = screen.getAllByRole('combobox').filter(
      (el) => (el as HTMLSelectElement).value === 'kw' || (el as HTMLSelectElement).value === 'sb',
    );
    expect(Array.from((primarySelect as HTMLSelectElement).options).map((o) => o.value)).not.toContain('sb');
    expect(Array.from((secondSelect as HTMLSelectElement).options).map((o) => o.value)).not.toContain('kw');

    fireEvent.change(secondSelect, { target: { value: 'hh' } });
    expect(onSelect).toHaveBeenCalledWith(1, 'hh');

    await waitFor(() => expect(screen.getByRole('option', { name: 'SB Team 3' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '+ เพิ่มบริษัท' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('keeps department and team disabled until a company is chosen', () => {
    const onRemove = vi.fn();
    render(
      <EmployeePerCompanyOrgFields
        companyIds={['kw']}
        companies={companies}
        value={{ kw: { department: '', teamId: '' } }}
        onChange={vi.fn()}
        companyPicker={{ rows: ['kw', ''], onSelect: vi.fn(), onRemove, onAdd: vi.fn() }}
      />,
    );

    expect(screen.getByText('— เลือกบริษัทก่อน —').closest('select')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'ลบบริษัทนี้' }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
