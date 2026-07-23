import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EmployeeSearchSelect } from './EmployeeSearchSelect';

vi.mock('../../api/employees', () => ({
  fetchEmployeeList: vi.fn(),
}));

import { fetchEmployeeList } from '../../api/employees';

const mockEmployees = {
  items: [
    {
      id: 'emp-1',
      globalId: 'SB001',
      firstName: 'สมชาย',
      lastName: 'ใจดี',
      nickname: 'ชาย',
      teamName: 'ทีม A',
      employmentStatus: 'active',
      telegramLinked: false,
      username: null,
    },
    {
      id: 'emp-2',
      globalId: 'SB002',
      firstName: 'Jane',
      lastName: 'Doe',
      nickname: null,
      teamName: 'ทีม B',
      employmentStatus: 'active',
      telegramLinked: false,
      username: null,
    },
  ],
  total: 2,
};

describe('EmployeeSearchSelect', () => {
  beforeEach(() => {
    vi.mocked(fetchEmployeeList).mockReset();
    vi.mocked(fetchEmployeeList).mockResolvedValue(mockEmployees);
  });

  it('loads employees and selects one', async () => {
    const onChange = vi.fn();

    render(
      <EmployeeSearchSelect
        companyId="company-1"
        value=""
        onChange={onChange}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    await waitFor(() => {
      expect(fetchEmployeeList).toHaveBeenCalledWith({
        companyId: 'company-1',
        workforceOnly: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /SB001.*ชาย.*ทีม A/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('option', { name: /SB001.*ชาย.*ทีม A/ }));

    expect(onChange).toHaveBeenCalledWith('emp-1');
  });

  it('searches employees when typing', async () => {
    render(
      <EmployeeSearchSelect
        companyId="company-1"
        value=""
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Jane' } });

    await waitFor(() => {
      expect(fetchEmployeeList).toHaveBeenCalledWith({
        companyId: 'company-1',
        search: 'Jane',
        workforceOnly: true,
      });
    });
  });
});
