import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AddEmployeePage from './AddEmployeePage';

const mocks = vi.hoisted(() => ({
  onboardEmployee: vi.fn(),
}));

const TEAMS: Record<string, Array<{ id: string; name: string }>> = {
  'co-kw': [{ id: 'kw-t1', name: 'Team 1' }, { id: 'kw-t2', name: 'Team 2' }],
  'co-sb': [{ id: 'sb-t1', name: 'Team 1' }, { id: 'sb-t3', name: 'Team 3' }],
  'co-mb': [{ id: 'mb-t1', name: 'Team 1' }],
};

vi.mock('../../context/AuthContext', () => ({
  useCompanyId: () => 'co-kw',
}));

vi.mock('../../hooks/useEmployeePermissions', () => ({
  useCanAddEmployee: () => true,
}));

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>();
  return {
    ...actual,
    apiGet: vi.fn(async () => []),
    fetchCompanies: vi.fn(async () => [
      { id: 'co-kw', name: 'KW Company', code: 'KW' },
      { id: 'co-sb', name: 'SB Company', code: 'SB' },
      { id: 'co-mb', name: 'MB Company', code: 'MB' },
    ]),
  };
});

vi.mock('../../api/employee-employment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/employee-employment')>();
  return {
    ...actual,
    fetchCompanyTeams: vi.fn(async (companyId: string) => TEAMS[companyId] ?? []),
  };
});

vi.mock('../../api/employees', () => ({
  onboardEmployee: mocks.onboardEmployee,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AddEmployeePage />
    </MemoryRouter>,
  );
}

function companySelects() {
  return screen.getAllByLabelText('บริษัท') as HTMLSelectElement[];
}

function teamSelects() {
  return screen.getAllByLabelText('ทีม') as HTMLSelectElement[];
}

async function fillRequired() {
  fireEvent.change(screen.getByLabelText('ชื่อ'), { target: { value: 'Somchai' } });
  fireEvent.change(screen.getByLabelText('นามสกุล'), { target: { value: 'Jaidee' } });
  fireEvent.change(screen.getByPlaceholderText('11000'), { target: { value: '15000' } });
  fireEvent.click(screen.getByLabelText('สร้างบัญชีเข้าใช้งาน'));
}

describe('AddEmployeePage company rows', () => {
  beforeEach(() => {
    mocks.onboardEmployee.mockReset();
    mocks.onboardEmployee.mockResolvedValue({ id: 'emp-1', globalId: 'EMP000001', username: null });
  });

  it('lets one employee join several companies, each with its own team', async () => {
    renderPage();
    await screen.findByText('+ เพิ่มบริษัท');
    expect(companySelects()).toHaveLength(1);
    expect(companySelects()[0].value).toBe('co-kw');

    fireEvent.click(screen.getByText('+ เพิ่มบริษัท'));
    expect(companySelects()).toHaveLength(2);
    // the new row starts on a company not used yet, and lists no company twice
    expect(companySelects()[1].value).toBe('co-sb');
    fireEvent.change(companySelects()[1], { target: { value: 'co-mb' } });
    fireEvent.change(companySelects()[1], { target: { value: 'co-sb' } });
    const secondRowOptions = [...companySelects()[1].options].map((o) => o.value);
    expect(secondRowOptions).not.toContain('co-kw');

    await waitFor(() => expect(teamSelects()[0].options.length).toBeGreaterThan(1));
    await waitFor(() => expect(teamSelects()[1].options.length).toBeGreaterThan(1));
    fireEvent.change(teamSelects()[0], { target: { value: 'kw-t1' } });
    fireEvent.change(teamSelects()[1], { target: { value: 'sb-t3' } });

    await fillRequired();
    fireEvent.click(screen.getByText('สร้างพนักงาน'));

    await waitFor(() => expect(mocks.onboardEmployee).toHaveBeenCalledTimes(1));
    const payload = mocks.onboardEmployee.mock.calls[0][0];
    expect(payload.companyId).toBe('co-kw');
    expect(payload.additionalCompanyIds).toEqual(['co-sb']);
    expect(payload.companyAssignments).toEqual([
      { companyId: 'co-kw', department: undefined, teamId: 'kw-t1', extraTeamIds: undefined },
      { companyId: 'co-sb', department: undefined, teamId: 'sb-t3', extraTeamIds: undefined },
    ]);
  });

  it('can make another row the primary company and remove a row', async () => {
    renderPage();
    await screen.findByText('+ เพิ่มบริษัท');
    fireEvent.click(screen.getByText('+ เพิ่มบริษัท'));
    fireEvent.click(screen.getByText('+ เพิ่มบริษัท'));
    expect(companySelects().map((s) => s.value)).toEqual(['co-kw', 'co-sb', 'co-mb']);
    // every company is used, so there is nothing left to add
    expect(screen.queryByText('+ เพิ่มบริษัท')).toBeNull();

    fireEvent.click(screen.getAllByText('ตั้งเป็นบริษัทหลัก')[0]);
    expect(companySelects().map((s) => s.value)).toEqual(['co-sb', 'co-kw', 'co-mb']);

    fireEvent.click(screen.getByLabelText('ลบ MB Company (MB)'));
    expect(companySelects().map((s) => s.value)).toEqual(['co-sb', 'co-kw']);

    await fillRequired();
    fireEvent.click(screen.getByText('สร้างพนักงาน'));
    await waitFor(() => expect(mocks.onboardEmployee).toHaveBeenCalledTimes(1));
    const payload = mocks.onboardEmployee.mock.calls[0][0];
    expect(payload.companyId).toBe('co-sb');
    expect(payload.additionalCompanyIds).toEqual(['co-kw']);
  });
});
