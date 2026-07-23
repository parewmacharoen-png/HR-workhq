import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EmployeeLeaveTab } from './EmployeeLeaveTab';
import type { EmployeeLeaveResponse } from '../../../api/employee-leave';

const mockResponse: EmployeeLeaveResponse = {
  summary: {
    annualLeaveRemaining: 0,
    emergencyLeaveRemaining: 3,
    sickLeaveUsed: 1,
    unpaidLeaveUsed: 2,
    leaveRequestsThisYear: 2,
    pendingRequests: 1,
    approvedRequests: 1,
    rejectedRequests: 0,
    cancelledRequests: 0,
    yearUsage: [
      {
        leaveTypeCode: 'emergency',
        leaveTypeName: 'ลากรณีฉุกเฉิน',
        priorUsed: 0,
        systemUsed: 0,
        totalUsed: 0,
        remaining: 3,
      },
      {
        leaveTypeCode: 'sick',
        leaveTypeName: 'ลาป่วย',
        priorUsed: 0,
        systemUsed: 1,
        totalUsed: 1,
        remaining: null,
      },
      {
        leaveTypeCode: 'unpaid',
        leaveTypeName: 'ลาไม่รับค่าจ้าง',
        priorUsed: 2,
        systemUsed: 0,
        totalUsed: 2,
        remaining: null,
      },
      {
        leaveTypeCode: 'monthly_off',
        leaveTypeName: 'วันหยุดประจำเดือน',
        priorUsed: 0,
        systemUsed: 0,
        totalUsed: 0,
        remaining: null,
      },
    ],
  },
  balances: [
    {
      leaveTypeCode: 'emergency',
      leaveTypeName: 'ลากรณีฉุกเฉิน',
      priorUsed: 0,
      entitled: 4,
      entitledEditable: true,
    },
    {
      leaveTypeCode: 'sick',
      leaveTypeName: 'ลาป่วย',
      priorUsed: 0,
      entitled: 0,
      entitledEditable: false,
    },
    {
      leaveTypeCode: 'unpaid',
      leaveTypeName: 'ลาไม่รับค่าจ้าง',
      priorUsed: 2,
      entitled: 0,
      entitledEditable: false,
    },
  ],
  history: [
    {
      id: 'lr-1',
      requestDate: '2026-06-01T10:00:00.000Z',
      leaveTypeCode: 'annual',
      leaveTypeName: 'Annual leave',
      startDate: '2026-06-10',
      endDate: '2026-06-11',
      days: 2,
      status: 'approved',
      approverName: 'Owner User',
      reason: 'Family trip',
      workflowInstanceId: 'wf-1',
    },
    {
      id: 'lr-2',
      requestDate: '2026-06-02T10:00:00.000Z',
      leaveTypeCode: 'sick',
      leaveTypeName: 'Sick leave',
      startDate: '2026-06-03',
      endDate: '2026-06-03',
      days: 1,
      status: 'pending',
      approverName: null,
      reason: 'Flu',
      workflowInstanceId: null,
    },
  ],
};

const leaveApiMock = vi.hoisted(() => ({
  fetchEmployeeLeave: vi.fn(async () => mockResponse),
  deleteEmployeeLeaveRequest: vi.fn(async () => mockResponse),
  updateEmployeeLeaveRequest: vi.fn(async () => mockResponse),
  updateEmployeeLeaveBalances: vi.fn(async () => mockResponse),
}));

vi.mock('../../../api/employee-leave', () => leaveApiMock);

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    can: (permission: string) => permission === 'leave:write',
  }),
}));

vi.mock('../../leave/LeaveRequestDetailModal', () => ({
  LeaveRequestDetailModal: ({ item, onClose }: { item: { id: string }; onClose: () => void }) => (
    <div data-testid="leave-request-detail-modal">
      <span>{item.id}</span>
      <button type="button" onClick={onClose}>close</button>
    </div>
  ),
}));

vi.mock('../../leave/LeaveRequestEditModal', () => ({
  LeaveRequestEditModal: ({ item, onClose }: { item: { id: string }; onClose: () => void }) => (
    <div data-testid="leave-request-edit-modal">
      <span>{item.id}</span>
      <button type="button" onClick={onClose}>close-edit</button>
    </div>
  ),
}));

describe('EmployeeLeaveTab', () => {
  beforeEach(() => {
    leaveApiMock.fetchEmployeeLeave.mockResolvedValue(mockResponse);
    leaveApiMock.updateEmployeeLeaveBalances.mockResolvedValue(mockResponse);
  });

  it('renders summary cards and leave history table', async () => {
    render(
      <MemoryRouter>
        <EmployeeLeaveTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('employee-leave-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('leave-summary-annual')).not.toBeInTheDocument();
    expect(screen.getByTestId('leave-summary-year-total')).toHaveTextContent('2');
    expect(screen.getByTestId('leave-summary-emergency')).toHaveTextContent('3');
    expect(screen.getByTestId('leave-summary-sick')).toHaveTextContent('1');
    expect(screen.getByTestId('leave-summary-unpaid')).toHaveTextContent('2');
    expect(screen.getByTestId('leave-year-usage')).toBeInTheDocument();
    expect(screen.getByTestId('leave-year-usage-sick')).toHaveTextContent('ลาป่วย');
    expect(screen.getByTestId('employee-leave-table')).toBeInTheDocument();
    expect(screen.getByText('Family trip')).toBeInTheDocument();
  });

  it('saves prior leave usage opening balances', async () => {
    leaveApiMock.updateEmployeeLeaveBalances.mockResolvedValueOnce({
      ...mockResponse,
      balances: mockResponse.balances.map((row) => (
        row.leaveTypeCode === 'sick' ? { ...row, priorUsed: 3 } : row
      )),
      summary: {
        ...mockResponse.summary,
        sickLeaveUsed: 4,
        yearUsage: mockResponse.summary.yearUsage.map((row) => (
          row.leaveTypeCode === 'sick'
            ? { ...row, priorUsed: 3, totalUsed: 4 }
            : row
        )),
      },
    });

    render(
      <MemoryRouter>
        <EmployeeLeaveTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByTestId('leave-toggle-prior'));
    expect(screen.getByTestId('leave-prior-form')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('leave-prior-sick'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('leave-prior-save'));

    await waitFor(() => {
      expect(leaveApiMock.updateEmployeeLeaveBalances).toHaveBeenCalledWith(
        'emp-1',
        'co-1',
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ leaveTypeCode: 'sick', priorUsed: 3 }),
          ]),
        }),
      );
    });
    expect(await screen.findByTestId('leave-prior-saved')).toBeInTheDocument();
  });

  it('filters history by status', async () => {
    render(
      <MemoryRouter>
        <EmployeeLeaveTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('leave-row-lr-1');
    fireEvent.change(screen.getByTestId('leave-filter-status'), { target: { value: 'pending' } });
    expect(screen.queryByTestId('leave-row-lr-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('leave-row-lr-2')).toBeInTheDocument();
  });

  it('searches history rows', async () => {
    render(
      <MemoryRouter>
        <EmployeeLeaveTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('leave-row-lr-1');
    fireEvent.change(screen.getByTestId('leave-search'), { target: { value: 'flu' } });
    expect(screen.queryByTestId('leave-row-lr-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('leave-row-lr-2')).toBeInTheDocument();
  });

  it('shows status colors', async () => {
    render(
      <MemoryRouter>
        <EmployeeLeaveTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    const approved = await screen.findByTestId('leave-status-lr-1');
    expect(approved.className).toContain('whq-badge-success');
    expect(screen.getByTestId('leave-status-lr-2').className).toContain('whq-badge-warning');
  });

  it('opens leave detail modal on row click', async () => {
    render(
      <MemoryRouter>
        <EmployeeLeaveTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId('leave-row-lr-1'));
    expect(await screen.findByTestId('leave-request-detail-modal')).toBeInTheDocument();
  });

  it('shows edit and delete actions when user can write leave', async () => {
    render(
      <MemoryRouter>
        <EmployeeLeaveTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('leave-edit-lr-1')).toBeInTheDocument();
    expect(screen.getByTestId('leave-delete-lr-1')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('leave-edit-lr-1'));
    expect(await screen.findByTestId('leave-request-edit-modal')).toBeInTheDocument();
  });

  it('deletes leave request after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter>
        <EmployeeLeaveTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId('leave-delete-lr-2'));
    await waitFor(() => {
      expect(leaveApiMock.deleteEmployeeLeaveRequest).toHaveBeenCalledWith(
        'emp-1',
        'co-1',
        expect.objectContaining({ id: 'lr-2' }),
      );
    });
  });

  it('shows edit and delete for monthly off rows', async () => {
    leaveApiMock.fetchEmployeeLeave.mockResolvedValueOnce({
      ...mockResponse,
      history: [{
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:2026-07-06',
        requestDate: '2026-07-04T03:57:00.000Z',
        leaveTypeCode: 'monthly_off',
        leaveTypeName: 'วันหยุดประจำเดือน',
        startDate: '2026-07-06',
        endDate: '2026-07-06',
        days: 1,
        status: 'pending',
        approverName: null,
        reason: null,
        workflowInstanceId: null,
        source: 'monthly_off',
      }],
    });
    render(
      <MemoryRouter>
        <EmployeeLeaveTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    const rowId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee:2026-07-06';
    expect(await screen.findByTestId(`leave-edit-${rowId}`)).toBeInTheDocument();
    expect(screen.getByTestId(`leave-delete-${rowId}`)).toBeInTheDocument();
  });

  it('shows empty state when no leave records', async () => {
    leaveApiMock.fetchEmployeeLeave.mockResolvedValueOnce({
      summary: {
        annualLeaveRemaining: 0,
        emergencyLeaveRemaining: 0,
        sickLeaveUsed: 0,
        unpaidLeaveUsed: 0,
        leaveRequestsThisYear: 0,
        pendingRequests: 0,
        approvedRequests: 0,
        rejectedRequests: 0,
        cancelledRequests: 0,
        yearUsage: [],
      },
      balances: mockResponse.balances,
      history: [],
    });
    render(
      <MemoryRouter>
        <EmployeeLeaveTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByText('ยังไม่มีรายการลา')).toBeInTheDocument();
  });
});
