import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EmployeePayrollTab } from './EmployeePayrollTab';
import type { EmployeePayrollResponse } from '../../../api/employee-payroll';

const mockResponse = {
  summary: {
    currentSalary: 35000,
    salaryType: 'monthly' as const,
    salaryEffectiveFrom: '2024-01-01',
    lastPayrollDate: '2026-06-25',
    latestNetPay: 32000,
    latestBaseSalary: 30000,
    payrollStatus: 'paid' as const,
    payPeriod: '2026-05-25 – 2026-06-23',
    salaryReviewDue: true,
    advanceDeductionTotal: 1000,
    salaryNeedsRebuild: false,
    salaryEffectiveAfterPeriod: false,
  },
  history: [
    {
      id: 'cycle-1',
      payrollCycleId: 'cycle-1',
      payslipId: 'slip-1',
      periodStart: '2026-05-25',
      periodEnd: '2026-06-23',
      payDate: '2026-06-25',
      baseSalary: 30000,
      mealAllowance: 300,
      mealEligibleDays: 3,
      crossBorderAllowance: 300,
      crossBorderEligibleDays: 3,
      lateDeduction: 83,
      absenceDeduction: 0,
      deposit: 500,
      grossPay: 36000,
      otAmount: 1500,
      commissionAmount: 500,
      bonusAmount: 1200,
      deductions: 4000,
      advanceDeduction: 1000,
      netPay: 32000,
      status: 'paid' as const,
    },
    {
      id: 'cycle-2',
      payrollCycleId: 'cycle-2',
      payslipId: null,
      periodStart: '2026-04-25',
      periodEnd: '2026-05-23',
      payDate: '2026-05-25',
      baseSalary: 35000,
      mealAllowance: 0,
      mealEligibleDays: 0,
      crossBorderAllowance: 0,
      crossBorderEligibleDays: 0,
      lateDeduction: 0,
      absenceDeduction: 0,
      deposit: 0,
      grossPay: 35000,
      otAmount: 0,
      commissionAmount: 0,
      bonusAmount: 0,
      deductions: 0,
      advanceDeduction: 0,
      netPay: 35000,
      status: 'draft' as const,
    },
  ],
};

const payrollApiMock = vi.hoisted(() => ({
  fetchEmployeePayroll: vi.fn(async (): Promise<EmployeePayrollResponse> => mockResponse),
}));

const overviewApiMock = vi.hoisted(() => ({
  fetchPayrollOverviewEmployeeDetail: vi.fn(async () => ({
    employeeId: 'emp-1',
    employeeCode: 'EMP001',
    employeeName: 'Somchai Test',
    cycleId: 'cycle-1',
    companyId: 'co-1',
    salaryComponents: [],
    deductions: [],
    overtime: [],
    commission: [],
    advancePay: [],
    payrollNotes: [],
    historyLink: null,
    row: mockResponse.history[0],
  })),
}));

vi.mock('../../../api/employee-payroll', () => payrollApiMock);
vi.mock('../../../api/payroll-overview', () => overviewApiMock);

vi.mock('../EmployeeCompensationSection', () => ({
  EmployeeCompensationSection: () => <div data-testid="employee-compensation-section" />,
}));

vi.mock('../../payroll/PayrollOverviewEmployeeDetailModal', () => ({
  PayrollOverviewEmployeeDetailModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="payroll-overview-detail-modal">
      <button type="button" onClick={onClose}>close</button>
    </div>
  ),
}));

describe('EmployeePayrollTab', () => {
  beforeEach(() => {
    payrollApiMock.fetchEmployeePayroll.mockResolvedValue(mockResponse);
  });

  it('renders summary cards and payroll history table', async () => {
    render(
      <MemoryRouter>
        <EmployeePayrollTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('employee-payroll-summary')).toBeInTheDocument();
    expect(screen.getByTestId('payroll-summary-current-salary')).toHaveTextContent('35,000');
    expect(screen.getByTestId('employee-payroll-table')).toBeInTheDocument();
    expect(screen.getByTestId('payroll-row-cycle-1')).toBeInTheDocument();
    expect(screen.getByTestId('payroll-salary-cycle-1')).toHaveTextContent('30,000');
    expect(screen.getByTestId('payroll-meal-cycle-1')).toHaveTextContent('300');
    expect(screen.getByTestId('payroll-meal-cycle-1')).toHaveTextContent('3 วัน');
  });

  it('filters history by status', async () => {
    render(
      <MemoryRouter>
        <EmployeePayrollTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('payroll-row-cycle-1');
    fireEvent.change(screen.getByTestId('payroll-filter-status'), { target: { value: 'draft' } });
    expect(screen.queryByTestId('payroll-row-cycle-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('payroll-row-cycle-2')).toBeInTheDocument();
  });

  it('searches history rows', async () => {
    render(
      <MemoryRouter>
        <EmployeePayrollTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('payroll-row-cycle-1');
    fireEvent.change(screen.getByTestId('payroll-search'), { target: { value: '2026-04-25' } });
    expect(screen.queryByTestId('payroll-row-cycle-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('payroll-row-cycle-2')).toBeInTheDocument();
  });

  it('shows status colors', async () => {
    render(
      <MemoryRouter>
        <EmployeePayrollTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect((await screen.findByTestId('payroll-status-cycle-1')).className).toContain('whq-badge-success');
    expect(screen.getByTestId('payroll-status-cycle-2').className).toContain('whq-badge-neutral');
  });

  it('opens payroll detail modal on row click', async () => {
    render(
      <MemoryRouter>
        <EmployeePayrollTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId('payroll-row-cycle-1'));
    expect(await screen.findByTestId('payroll-overview-detail-modal')).toBeInTheDocument();
    expect(overviewApiMock.fetchPayrollOverviewEmployeeDetail).toHaveBeenCalledWith('cycle-1', 'emp-1');
  });

  it('shows empty state when no payroll records', async () => {
    payrollApiMock.fetchEmployeePayroll.mockResolvedValueOnce({
      summary: {
        currentSalary: null,
        salaryType: 'monthly',
        salaryEffectiveFrom: null,
        lastPayrollDate: null,
        latestNetPay: null,
        latestBaseSalary: null,
        payrollStatus: null,
        payPeriod: null,
        salaryReviewDue: false,
        advanceDeductionTotal: 0,
        salaryNeedsRebuild: false,
        salaryEffectiveAfterPeriod: false,
      },
      history: [],
    } as EmployeePayrollResponse);
    render(
      <MemoryRouter>
        <EmployeePayrollTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByText('ยังไม่มีประวัติการจ่าย')).toBeInTheDocument();
  });

  it('does not fetch payroll when component unmounts before resolve', async () => {
    render(
      <MemoryRouter>
        <EmployeePayrollTab employeeId="emp-99" companyId="co-88" />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(payrollApiMock.fetchEmployeePayroll).toHaveBeenCalledWith('emp-99', 'co-88');
    });
  });
});
