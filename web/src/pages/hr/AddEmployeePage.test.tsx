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

const ROLE_TEMPLATES = [
  { code: 'employee', name: 'พนักงาน', requiresCompanyScope: false, requiresTeamScope: false },
  { code: 'big_leader', name: 'หัวหน้าทีมใหญ่', requiresCompanyScope: true, requiresTeamScope: false },
  { code: 'sub_leader', name: 'หัวหน้าทีมย่อย', requiresCompanyScope: false, requiresTeamScope: true },
  { code: 'secretary', name: 'เลขา', requiresCompanyScope: false, requiresTeamScope: false },
];

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
    apiGet: vi.fn(async (path: string) => (path === '/access-control/role-templates' ? ROLE_TEMPLATES : [])),
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

function pickPosition(value: string) {
  fireEvent.change(screen.getByLabelText('ตำแหน่ง (เลือกก่อน)'), { target: { value } });
}

async function fillWithLogin() {
  fireEvent.change(screen.getByLabelText('ชื่อ'), { target: { value: 'Somchai' } });
  fireEvent.change(screen.getByLabelText('นามสกุล'), { target: { value: 'Jaidee' } });
  fireEvent.change(screen.getByPlaceholderText('11000'), { target: { value: '15000' } });
  fireEvent.change(screen.getByPlaceholderText('อย่างน้อย 8 ตัวอักษร'), { target: { value: 'secret123' } });
}

async function submitted() {
  fireEvent.click(screen.getByText('สร้างพนักงาน'));
  await waitFor(() => expect(mocks.onboardEmployee).toHaveBeenCalledTimes(1));
  return mocks.onboardEmployee.mock.calls[0][0];
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

describe('AddEmployeePage: position decides companies and teams', () => {
  beforeEach(() => {
    mocks.onboardEmployee.mockReset();
    mocks.onboardEmployee.mockResolvedValue({ id: 'emp-1', globalId: 'EMP000001', username: null });
  });

  it('หัวหน้าทีมย่อย picks one team per company and gets sub_leader over those teams', async () => {
    renderPage();
    await screen.findByText('+ เพิ่มบริษัท');
    pickPosition('หัวหน้าทีมย่อย');
    // department comes from the position
    expect(screen.queryByLabelText('แผนก')).toBeNull();

    fireEvent.click(screen.getByText('+ เพิ่มบริษัท'));
    expect(companySelects().map((s) => s.value)).toEqual(['co-kw', 'co-sb']);
    await waitFor(() => expect(teamSelects()[1].options.length).toBeGreaterThan(1));
    fireEvent.change(teamSelects()[0], { target: { value: 'kw-t1' } });
    fireEvent.change(teamSelects()[1], { target: { value: 'sb-t3' } });

    await fillWithLogin();
    const payload = await submitted();
    expect(payload.companyAssignments).toEqual([
      { companyId: 'co-kw', department: 'Marketing', teamId: 'kw-t1', extraTeamIds: undefined },
      { companyId: 'co-sb', department: 'Marketing', teamId: 'sb-t3', extraTeamIds: undefined },
    ]);
    expect(payload.position).toBe('หัวหน้าทีมย่อย');
    expect(payload.businessRole).toBe('sub_leader');
    expect(payload.teamScopeIds).toEqual(['kw-t1', 'sb-t3']);
  });

  it('พนักงาน can tick several teams in one company', async () => {
    renderPage();
    await screen.findByText('+ เพิ่มบริษัท');
    pickPosition('พนักงาน');
    fireEvent.click(await screen.findByLabelText('Team 2'));
    fireEvent.click(screen.getByLabelText('Team 1'));

    await fillWithLogin();
    const payload = await submitted();
    expect(payload.companyAssignments).toEqual([
      { companyId: 'co-kw', department: 'Marketing', teamId: 'kw-t2', extraTeamIds: ['kw-t1'] },
    ]);
    expect(payload.businessRole).toBe('employee');
  });

  it('หัวหน้าทีมใหญ่ picks no team and covers every team in the company', async () => {
    renderPage();
    await screen.findByText('+ เพิ่มบริษัท');
    pickPosition('หัวหน้าทีมใหญ่');
    expect(screen.getByText('ดูแลทุกทีมในบริษัทนี้')).toBeInTheDocument();
    expect(screen.queryAllByLabelText('ทีม')).toHaveLength(0);

    await fillWithLogin();
    const payload = await submitted();
    expect(payload.companyAssignments).toEqual([
      { companyId: 'co-kw', department: 'Marketing', teamId: 'kw-t1', extraTeamIds: ['kw-t2'] },
    ]);
    expect(payload.businessRole).toBe('big_leader');
    expect(payload.companyScopeIds).toEqual(['co-kw']);
  });

  it('เลขา works for every company with no team', async () => {
    renderPage();
    await screen.findByText('+ เพิ่มบริษัท');
    pickPosition('เลขา');
    expect(companySelects().map((s) => s.value)).toEqual(['co-kw', 'co-sb', 'co-mb']);
    expect(screen.queryByText('+ เพิ่มบริษัท')).toBeNull();
    expect(screen.queryByText('ลบ')).toBeNull();

    await fillWithLogin();
    const payload = await submitted();
    expect(payload.additionalCompanyIds).toEqual(['co-sb', 'co-mb']);
    expect(payload.companyAssignments.map((a: { teamId?: string }) => a.teamId)).toEqual([undefined, undefined, undefined]);
    expect(payload.department).toBe('เลขา');
    expect(payload.businessRole).toBe('secretary');
  });

  it('can make another row the primary company and remove a row', async () => {
    renderPage();
    await screen.findByText('+ เพิ่มบริษัท');
    fireEvent.click(screen.getByText('+ เพิ่มบริษัท'));
    fireEvent.click(screen.getByText('+ เพิ่มบริษัท'));
    expect(companySelects().map((s) => s.value)).toEqual(['co-kw', 'co-sb', 'co-mb']);
    expect(screen.queryByText('+ เพิ่มบริษัท')).toBeNull();

    fireEvent.click(screen.getAllByText('ตั้งเป็นบริษัทหลัก')[0]);
    expect(companySelects().map((s) => s.value)).toEqual(['co-sb', 'co-kw', 'co-mb']);

    fireEvent.click(screen.getByLabelText('ลบ MB Company (MB)'));
    expect(companySelects().map((s) => s.value)).toEqual(['co-sb', 'co-kw']);

    await fillRequired();
    const payload = await submitted();
    expect(payload.companyId).toBe('co-sb');
    expect(payload.additionalCompanyIds).toEqual(['co-kw']);
  });
});
