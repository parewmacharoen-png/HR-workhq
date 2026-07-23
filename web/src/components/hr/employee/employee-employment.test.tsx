import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../../api/client';
import { EmployeeEmploymentTab } from './EmployeeEmploymentTab';

function buildEmploymentResponse(overrides: {
  businessRole?: string;
  roleEditor?: { canEditBusinessRole: boolean; canAssignOwnerRole: boolean };
} = {}) {
  return {
    employment: {
      employeeCode: 'EMP000001',
      companyId: 'co-1',
      companyName: 'Acme Co',
      department: 'Marketing',
      teamId: 'team-1',
      teamName: 'People Ops',
      businessRole: overrides.businessRole ?? 'secretary',
      position: 'HR Officer',
      employmentType: 'permanent',
      employmentStatus: 'active',
      joinDate: '2020-01-15',
      probationEndDate: '2020-04-15',
      confirmedDate: '2020-04-16',
      resignDate: null,
      shift: 'day',
      officeType: 'front_office',
      workLocation: 'office',
    },
    supervisor: { id: 'mgr-1', globalId: 'EMP000010', name: 'Manager One' },
    bigLeader: { id: 'bl-1', globalId: 'EMP000020', name: 'Big Leader' },
    subLeader: null,
    roleEditor: overrides.roleEditor ?? {
      canEditBusinessRole: false,
      canAssignOwnerRole: false,
    },
  };
}

const employmentApiMocks = vi.hoisted(() => ({
  updateEmployeeEmployment: vi.fn(),
  updateEmployeeBusinessRole: vi.fn(),
  fetchEmployeeEmployment: vi.fn(),
}));

vi.mock('../../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/client')>();
  return {
    ...actual,
    fetchCompanies: vi.fn(async () => [
      { id: 'co-1', name: 'Acme Co', code: 'ACME' },
      { id: 'co-2', name: 'Beta Co', code: 'BETA' },
    ]),
  };
});

vi.mock('../../../api/employee-employment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/employee-employment')>();
  return {
    ...actual,
    fetchEmployeeEmployment: employmentApiMocks.fetchEmployeeEmployment,
    updateEmployeeEmployment: employmentApiMocks.updateEmployeeEmployment,
    updateEmployeeBusinessRole: employmentApiMocks.updateEmployeeBusinessRole,
  };
});

vi.mock('../../../api/employees', () => ({
  fetchEmployeeList: vi.fn(async () => ({
    items: [{ id: 'mgr-1', globalId: 'EMP000010', firstName: 'Manager', lastName: 'One' }],
  })),
}));

function renderTab(response = buildEmploymentResponse(), viewerBusinessRole = 'owner' as string | null) {
  employmentApiMocks.fetchEmployeeEmployment.mockResolvedValue(response);
  return render(
    <MemoryRouter>
      <EmployeeEmploymentTab
        employeeId="emp-1"
        companyId="co-1"
        canEdit
        viewerBusinessRole={viewerBusinessRole}
        onReload={() => {}}
      />
    </MemoryRouter>,
  );
}

describe('EmployeeEmploymentTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
    employmentApiMocks.updateEmployeeEmployment.mockImplementation(async () => ({
      ...buildEmploymentResponse(),
      employment: { ...buildEmploymentResponse().employment, department: 'Admin' },
    }));
    employmentApiMocks.updateEmployeeBusinessRole.mockImplementation(async () => ({
      ...buildEmploymentResponse({
        businessRole: 'big_leader',
        roleEditor: { canEditBusinessRole: true, canAssignOwnerRole: true },
      }),
    }));
    employmentApiMocks.fetchEmployeeEmployment.mockResolvedValue(buildEmploymentResponse());
  });

  it('renders employment fields without salary/payroll sections', async () => {
    renderTab();
    expect(await screen.findByTestId('employment-tab')).toBeInTheDocument();
    expect(screen.getByText('ข้อมูลการทำงาน')).toBeInTheDocument();
    expect(screen.getByText('EMP000001')).toBeInTheDocument();
    expect(screen.queryByText('เงินเดือน')).not.toBeInTheDocument();
  });

  it('shows dropdown when roleEditor.canEditBusinessRole=true and businessRole=owner', async () => {
    renderTab(buildEmploymentResponse({
      businessRole: 'owner',
      roleEditor: { canEditBusinessRole: true, canAssignOwnerRole: true },
    }));
    expect(await screen.findByTestId('employment-role-editor')).toBeInTheDocument();
    expect(screen.getByText('บทบาทในระบบ')).toBeInTheDocument();
    expect(screen.getByTestId('employment-role-select')).toBeInTheDocument();
    const select = screen.getByTestId('employment-role-select') as HTMLSelectElement;
    expect(select.value).toBe('owner');
    expect(within(select).getByRole('option', { name: 'เจ้าของ' })).toBeInTheDocument();
  });

  it('shows read-only row when roleEditor.canEditBusinessRole=false', async () => {
    renderTab(buildEmploymentResponse({
      businessRole: 'owner',
      roleEditor: { canEditBusinessRole: false, canAssignOwnerRole: false },
    }), null);
    await screen.findByText('ข้อมูลการทำงาน');
    expect(screen.queryByTestId('employment-role-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('employment-role-select')).not.toBeInTheDocument();
    expect(screen.getByText('เจ้าของ')).toBeInTheDocument();
  });

  it('secretary sees dropdown but owner option is hidden', async () => {
    renderTab(buildEmploymentResponse({
      roleEditor: { canEditBusinessRole: true, canAssignOwnerRole: false },
    }), 'secretary');
    const select = await screen.findByTestId('employment-role-select');
    expect(within(select).queryByRole('option', { name: 'เจ้าของ' })).not.toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'เลขานุการ / HR' })).toBeInTheDocument();
  });

  it('employee does not see dropdown', async () => {
    renderTab(buildEmploymentResponse({
      roleEditor: { canEditBusinessRole: false, canAssignOwnerRole: false },
    }), 'employee');
    await screen.findByText('ข้อมูลการทำงาน');
    expect(screen.queryByTestId('employment-role-editor')).not.toBeInTheDocument();
    expect(screen.getByText('เลขานุการ / HR')).toBeInTheDocument();
  });

  it('role editor is visible without entering employment edit mode', async () => {
    renderTab(buildEmploymentResponse({
      roleEditor: { canEditBusinessRole: true, canAssignOwnerRole: true },
    }));
    expect(await screen.findByTestId('employment-role-editor')).toBeInTheDocument();
    expect(screen.getByTestId('employment-edit-button')).toBeInTheDocument();
    expect(screen.getByTestId('employment-role-select')).toBeInTheDocument();
  });

  it('shows editor for owner viewer when roleEditor missing from API', async () => {
    const response = buildEmploymentResponse();
    delete (response as { roleEditor?: unknown }).roleEditor;
    renderTab(response, 'owner');
    expect(await screen.findByTestId('employment-role-editor')).toBeInTheDocument();
  });

  it('save calls PATCH /employees/:id/business-role and refetches employment', async () => {
    renderTab(buildEmploymentResponse({
      roleEditor: { canEditBusinessRole: true, canAssignOwnerRole: true },
    }));
    const select = await screen.findByTestId('employment-role-select');
    fireEvent.change(select, { target: { value: 'big_leader' } });
    fireEvent.change(screen.getByTestId('employment-role-reason'), { target: { value: 'test role' } });
    fireEvent.click(screen.getByTestId('employment-role-save-button'));

    await waitFor(() => {
      expect(employmentApiMocks.updateEmployeeBusinessRole).toHaveBeenCalledWith(
        'emp-1',
        { businessRole: 'big_leader', reason: 'test role' },
        'co-1',
      );
    });
    expect(await screen.findByTestId('employment-role-success')).toHaveTextContent('บันทึกบทบาทเรียบร้อยแล้ว');
    await waitFor(() => {
      expect(employmentApiMocks.fetchEmployeeEmployment.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows API error when saving last owner demotion is blocked', async () => {
    employmentApiMocks.updateEmployeeBusinessRole.mockRejectedValue(
      new ApiError(
        'At least one Owner must always exist. Cannot demote or remove the last Owner.',
        422,
      ),
    );
    renderTab(buildEmploymentResponse({
      businessRole: 'owner',
      roleEditor: { canEditBusinessRole: true, canAssignOwnerRole: true },
    }));
    const select = await screen.findByTestId('employment-role-select');
    fireEvent.change(select, { target: { value: 'big_leader' } });
    fireEvent.click(screen.getByTestId('employment-role-save-button'));

    expect(await screen.findByTestId('employment-role-error')).toHaveTextContent(
      'ต้องมีเจ้าของอย่างน้อย 1 คน — ไม่สามารถลดบทบาทเจ้าของคนสุดท้ายได้',
    );
  });

  it('edit and save calls update employment API', async () => {
    renderTab();
    await screen.findByTestId('employment-edit-button');
    fireEvent.click(screen.getByTestId('employment-edit-button'));
    fireEvent.change(screen.getByDisplayValue('Marketing'), { target: { value: 'Admin' } });
    fireEvent.click(screen.getByTestId('employment-save-button'));
    await waitFor(() => expect(employmentApiMocks.updateEmployeeEmployment).toHaveBeenCalled());
  });

  it('read-only when cannot edit employment', async () => {
    render(
      <MemoryRouter>
        <EmployeeEmploymentTab employeeId="emp-1" companyId="co-1" canEdit={false} onReload={() => {}} />
      </MemoryRouter>,
    );
    await screen.findByText('ข้อมูลการทำงาน');
    expect(screen.queryByTestId('employment-edit-button')).not.toBeInTheDocument();
  });
});
