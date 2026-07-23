import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EmployeeCommissionTab } from './EmployeeCommissionTab';
import type { EmployeeCommissionResponse } from '../../../api/employee-commission';

const mockResponse: EmployeeCommissionResponse = {
  summary: {
    currentCycleLabel: '2026-05-25 – 2026-06-23',
    estimatedCommission: 12000,
    lastPaidCommission: 8000,
    currentTeamName: 'Team Alpha',
    commissionMethod: 'Team Pool',
    eligibleStatus: 'Eligible',
    carryForwardStatus: 'None',
    targetProgress: '20/24',
    commissionStatus: 'pending_pay',
  },
  assignment: {
    companyId: 'co-1',
    companyName: 'Acme',
    teamId: 'team-1',
    teamName: 'Team Alpha',
    businessRole: 'employee',
    commissionMethod: 'Team Pool',
    rampPercent: 100,
    eligibilityPercent: 100,
    bigLeaderPercent: null,
    employeePercent: null,
    target: 24,
    carryForward: null,
    engine: 'marketing',
  },
  history: [
    {
      id: 'mkt-1',
      sourceCycleId: 'cycle-1',
      finalizationCycleId: 'fin-1',
      periodStart: '2026-05-25',
      periodEnd: '2026-06-23',
      periodLabel: '2026-05-25 – 2026-06-23',
      companyId: 'co-1',
      companyName: 'Acme',
      teamId: 'team-1',
      teamName: 'Team Alpha',
      commissionType: 'marketing',
      method: 'Team Pool',
      target: 24,
      achieved: 20,
      commission: 12000,
      bonus: 500,
      carryForward: 0,
      status: 'pending_pay',
      uiStatus: 'pending',
    },
    {
      id: 'adm-1',
      sourceCycleId: 'cycle-2',
      finalizationCycleId: 'fin-2',
      periodStart: '2026-04-25',
      periodEnd: '2026-05-23',
      periodLabel: '2026-04-25 – 2026-05-23',
      companyId: 'co-1',
      companyName: 'Acme',
      teamId: null,
      teamName: null,
      commissionType: 'admin',
      method: 'Front Office',
      target: null,
      achieved: 22,
      commission: 8000,
      bonus: 0,
      carryForward: 0,
      status: 'paid',
      uiStatus: 'paid',
    },
  ],
};

const commissionApiMock = vi.hoisted(() => ({
  fetchEmployeeCommission: vi.fn(async (): Promise<EmployeeCommissionResponse> => mockResponse),
}));

vi.mock('../../../api/employee-commission', () => commissionApiMock);

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe('EmployeeCommissionTab', () => {
  beforeEach(() => {
    commissionApiMock.fetchEmployeeCommission.mockResolvedValue(mockResponse);
    navigateMock.mockReset();
  });

  it('renders summary cards and assignment section', async () => {
    render(
      <MemoryRouter>
        <EmployeeCommissionTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('employee-commission-summary')).toBeInTheDocument();
    expect(screen.getByTestId('commission-summary-estimated')).toHaveTextContent('12,000');
    expect(screen.getByTestId('employee-commission-assignment')).toBeInTheDocument();
  });

  it('renders commission history table', async () => {
    render(
      <MemoryRouter>
        <EmployeeCommissionTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('employee-commission-table')).toBeInTheDocument();
    expect(screen.getByTestId('commission-history-row-mkt-1')).toBeInTheDocument();
  });

  it('filters history by commission type', async () => {
    render(
      <MemoryRouter>
        <EmployeeCommissionTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('employee-commission-table');
    fireEvent.change(screen.getByTestId('commission-filter-type'), { target: { value: 'admin' } });
    expect(screen.queryByTestId('commission-history-row-mkt-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('commission-history-row-adm-1')).toBeInTheDocument();
  });

  it('filters history by search', async () => {
    render(
      <MemoryRouter>
        <EmployeeCommissionTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('employee-commission-table');
    fireEvent.change(screen.getByTestId('commission-search'), { target: { value: 'Front Office' } });
    expect(screen.queryByTestId('commission-history-row-mkt-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('commission-history-row-adm-1')).toBeInTheDocument();
  });

  it('navigates to commission cycle detail on row click', async () => {
    render(
      <MemoryRouter>
        <EmployeeCommissionTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('commission-history-row-mkt-1');
    fireEvent.click(screen.getByTestId('commission-history-row-mkt-1'));
    expect(navigateMock).toHaveBeenCalledWith('/commission/cycles/fin-1');
  });

  it('shows empty state when employee has no commission data', async () => {
    commissionApiMock.fetchEmployeeCommission.mockResolvedValue({
      summary: {
        currentCycleLabel: null,
        estimatedCommission: null,
        lastPaidCommission: null,
        currentTeamName: null,
        commissionMethod: null,
        eligibleStatus: null,
        carryForwardStatus: 'None',
        targetProgress: null,
        commissionStatus: null,
      },
      assignment: null,
      history: [],
    });
    render(
      <MemoryRouter>
        <EmployeeCommissionTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByText('ยังไม่มีข้อมูลค่าคอมมิชชั่น')).toBeInTheDocument();
  });
});
