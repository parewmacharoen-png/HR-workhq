import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EmployeeAttendanceTab } from './EmployeeAttendanceTab';
import type { EmployeeAttendanceResponse } from '../../../api/employee-attendance';

const mockResponse = {
  summary: {
    todayStatus: 'working' as const,
    lastCheckInAt: '2026-06-24T01:00:00.000Z',
    lastCheckOutAt: null,
    lateCountMonth: 2,
    breakOverCountMonth: 0,
    absentCountMonth: 1,
    otHoursMonth: 4.5,
    workingDaysMonth: 18,
    officeDaysMonth: 15,
    wfhDaysMonth: 3,
    holidayDaysMonth: 4,
    leaveDaysMonth: 1,
  },
  history: [
    {
      id: 'att-1',
      date: '2026-06-24',
      shift: 'Day',
      checkInAt: '2026-06-24T01:00:00.000Z',
      checkOutAt: null,
      breakMinutes: 0,
      workedHours: 4,
      otHours: 0,
      lateMinutes: 0,
      status: 'working' as const,
      workCategory: 'office',
    },
    {
      id: 'att-2',
      date: '2026-06-23',
      shift: 'Day',
      checkInAt: '2026-06-23T01:30:00.000Z',
      checkOutAt: '2026-06-23T10:00:00.000Z',
      breakMinutes: 60,
      workedHours: 7.5,
      otHours: 1,
      lateMinutes: 30,
      status: 'late' as const,
      workCategory: 'office',
    },
    {
      id: 'att-3',
      date: '2026-06-22',
      shift: 'Night',
      checkInAt: null,
      checkOutAt: null,
      breakMinutes: 0,
      workedHours: 0,
      otHours: 0,
      lateMinutes: 0,
      status: 'absent' as const,
      workCategory: 'office',
    },
  ],
};

const attendanceApiMock = vi.hoisted(() => ({
  fetchEmployeeAttendance: vi.fn(async (): Promise<EmployeeAttendanceResponse> => mockResponse),
}));

vi.mock('../../../api/employee-attendance', () => attendanceApiMock);

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    can: () => true,
    user: { businessRole: 'owner' },
  }),
}));

vi.mock('../../attendance/AttendanceRecordDetailModal', () => ({
  AttendanceRecordDetailModal: ({ item, onClose }: { item: { id: string }; onClose: () => void }) => (
    <div data-testid="attendance-record-detail-modal">
      <span>{item.id}</span>
      <button type="button" onClick={onClose}>close</button>
    </div>
  ),
}));

describe('EmployeeAttendanceTab', () => {
  beforeEach(() => {
    attendanceApiMock.fetchEmployeeAttendance.mockResolvedValue(mockResponse);
  });

  it('renders summary cards and attendance calendar', async () => {
    render(
      <MemoryRouter>
        <EmployeeAttendanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('employee-attendance-summary')).toBeInTheDocument();
    expect(screen.getByTestId('attendance-summary-late-month')).toHaveTextContent('2');
    expect(screen.getByTestId('attendance-summary-holiday-days')).toHaveTextContent('4');
    expect(screen.getByTestId('attendance-today-banner')).toBeInTheDocument();
    expect(screen.getByTestId('attendance-month-calendar')).toBeInTheDocument();
  });

  it('filters history by status in list view', async () => {
    render(
      <MemoryRouter>
        <EmployeeAttendanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('attendance-month-calendar');
    fireEvent.change(screen.getByTestId('attendance-view-mode'), { target: { value: 'list' } });
    await screen.findByTestId('attendance-row-att-1');
    fireEvent.change(screen.getByTestId('attendance-filter-status'), { target: { value: 'late' } });
    expect(screen.queryByTestId('attendance-row-att-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('attendance-row-att-2')).toBeInTheDocument();
  });

  it('searches history rows', async () => {
    render(
      <MemoryRouter>
        <EmployeeAttendanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('attendance-month-calendar');
    fireEvent.change(screen.getByTestId('attendance-view-mode'), { target: { value: 'list' } });
    await screen.findByTestId('attendance-row-att-1');
    fireEvent.change(screen.getByTestId('attendance-search'), { target: { value: 'night' } });
    expect(screen.queryByTestId('attendance-row-att-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('attendance-row-att-3')).toBeInTheDocument();
  });

  it('shows status colors', async () => {
    render(
      <MemoryRouter>
        <EmployeeAttendanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('attendance-month-calendar');
    fireEvent.change(screen.getByTestId('attendance-view-mode'), { target: { value: 'list' } });
    const working = await screen.findByTestId('attendance-status-att-1');
    expect(working.className).toContain('whq-badge-success');
    expect(screen.getByTestId('attendance-status-att-2').className).toContain('whq-badge-warning');
    expect(screen.getByTestId('attendance-status-att-3').className).toContain('whq-badge-danger');
  });

  it('opens attendance detail modal on row click', async () => {
    render(
      <MemoryRouter>
        <EmployeeAttendanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('attendance-month-calendar');
    fireEvent.change(screen.getByTestId('attendance-view-mode'), { target: { value: 'list' } });
    fireEvent.click(await screen.findByTestId('attendance-row-att-1'));
    expect(await screen.findByTestId('attendance-record-detail-modal')).toBeInTheDocument();
  });

  it('opens day detail modal when calendar day is clicked', async () => {
    render(
      <MemoryRouter>
        <EmployeeAttendanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId('attendance-day-2026-06-24'));
    expect(await screen.findByTestId('attendance-record-detail-modal')).toBeInTheDocument();
    expect(screen.getByText('att-1')).toBeInTheDocument();
  });

  it('shows empty state when no attendance records', async () => {
    attendanceApiMock.fetchEmployeeAttendance.mockResolvedValueOnce({
      summary: {
        todayStatus: 'not_checked_in',
        lastCheckInAt: null,
        lastCheckOutAt: null,
        lateCountMonth: 0,
        breakOverCountMonth: 0,
        absentCountMonth: 0,
        otHoursMonth: 0,
        workingDaysMonth: 0,
        officeDaysMonth: 0,
        wfhDaysMonth: 0,
        holidayDaysMonth: 0,
        leaveDaysMonth: 0,
      },
      history: [],
    } as EmployeeAttendanceResponse);
    render(
      <MemoryRouter>
        <EmployeeAttendanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByText('ยังไม่มีข้อมูลเวลาทำงาน')).toBeInTheDocument();
  });

  it('shows loading skeleton while fetching', async () => {
    attendanceApiMock.fetchEmployeeAttendance.mockImplementationOnce(() => new Promise(() => {}));
    render(
      <MemoryRouter>
        <EmployeeAttendanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('employee-attendance-tab')).toBeInTheDocument();
    expect(screen.getAllByTestId('employee-attendance-summary-skeleton').length).toBeGreaterThan(0);
  });

  it('calls attendance API with employee and company ids', async () => {
    render(
      <MemoryRouter>
        <EmployeeAttendanceTab employeeId="emp-99" companyId="co-88" />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(attendanceApiMock.fetchEmployeeAttendance).toHaveBeenCalledWith('emp-99', 'co-88');
    });
  });
});
