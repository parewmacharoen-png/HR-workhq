import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EmployeePerformanceTab } from './EmployeePerformanceTab';
import type { EmployeePerformanceResponse } from '../../../api/employee-performance';

const mockResponse: EmployeePerformanceResponse = {
  summary: {
    currentKpiScore: 82.5,
    latestReviewScore: 78,
    latestReviewPeriod: '2026 H1',
    reviewStatus: 'finalized',
    probationStatus: 'ผ่านทดลองงานแล้ว',
    probationStatusCode: 'passed',
    nextReviewDue: '2026-12-31',
    goalsCompleted: 1,
    goalsPending: 1,
    warningsCount: 2,
  },
  currentGoals: [{
    id: 'metric-1',
    name: 'Sales target',
    target: '100',
    actual: '85',
    progress: 85,
    weight: 40,
    status: 'in_progress',
  }],
  reviewHistory: [{
    id: 'review-1',
    cycleId: 'cycle-1',
    period: '2026 H1',
    reviewType: 'performance_review',
    kpiScore: 82.5,
    reviewScore: 78,
    status: 'finalized',
    reviewerName: 'Manager One',
    completedDate: '2026-06-01',
  }, {
    id: 'review-2',
    cycleId: 'cycle-2',
    period: '2026 Q1',
    reviewType: 'performance_review',
    kpiScore: 70,
    reviewScore: 72,
    status: 'draft',
    reviewerName: 'Manager Two',
    completedDate: '2026-02-01',
  }],
  improvementItems: [{
    id: 'prob-1',
    type: 'probation',
    title: 'บันทึกทดลองงาน',
    description: 'Passed with conditions',
    date: '2026-04-02',
  }, {
    id: 'kpi-comment-1',
    type: 'kpi_review',
    title: 'หมายเหตุจากผู้ประเมิน KPI',
    description: 'Improve follow-up speed',
    date: null,
  }],
};

const performanceApiMock = vi.hoisted(() => ({
  fetchEmployeePerformance: vi.fn(async (): Promise<EmployeePerformanceResponse> => mockResponse),
}));

vi.mock('../../../api/employee-performance', () => performanceApiMock);

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

describe('EmployeePerformanceTab', () => {
  beforeEach(() => {
    performanceApiMock.fetchEmployeePerformance.mockResolvedValue(mockResponse);
    navigateMock.mockReset();
  });

  it('renders summary cards and goals table', async () => {
    render(
      <MemoryRouter>
        <EmployeePerformanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('employee-performance-summary')).toBeInTheDocument();
    expect(screen.getByTestId('performance-summary-current-kpi-score')).toHaveTextContent('82.5');
    expect(screen.getByTestId('employee-performance-goals-table')).toBeInTheDocument();
    expect(screen.getByText('Sales target')).toBeInTheDocument();
  });

  it('renders review history table', async () => {
    render(
      <MemoryRouter>
        <EmployeePerformanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('employee-performance-table')).toBeInTheDocument();
    expect(screen.getByTestId('performance-history-row-review-1')).toBeInTheDocument();
  });

  it('filters review history by search', async () => {
    render(
      <MemoryRouter>
        <EmployeePerformanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('employee-performance-table');
    fireEvent.change(screen.getByTestId('performance-search'), { target: { value: 'Manager Two' } });
    expect(screen.queryByTestId('performance-history-row-review-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('performance-history-row-review-2')).toBeInTheDocument();
  });

  it('filters review history by status', async () => {
    render(
      <MemoryRouter>
        <EmployeePerformanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('employee-performance-table');
    fireEvent.change(screen.getByTestId('performance-filter-status'), { target: { value: 'draft' } });
    expect(screen.queryByTestId('performance-history-row-review-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('performance-history-row-review-2')).toBeInTheDocument();
  });

  it('shows improvement items section', async () => {
    render(
      <MemoryRouter>
        <EmployeePerformanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('employee-performance-improvements')).toBeInTheDocument();
    expect(screen.getByText('Passed with conditions')).toBeInTheDocument();
  });

  it('navigates to review detail on row click', async () => {
    render(
      <MemoryRouter>
        <EmployeePerformanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('performance-history-row-review-1');
    fireEvent.click(screen.getByTestId('performance-history-row-review-1'));
    expect(navigateMock).toHaveBeenCalledWith('/hr/performance/reviews/cycle-1');
  });

  it('shows empty state when no review history', async () => {
    performanceApiMock.fetchEmployeePerformance.mockResolvedValue({
      ...mockResponse,
      reviewHistory: [],
      summary: { ...mockResponse.summary, latestReviewPeriod: null, reviewStatus: null },
    });
    render(
      <MemoryRouter>
        <EmployeePerformanceTab employeeId="emp-1" companyId="co-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByText('ยังไม่มีประวัติการประเมิน')).toBeInTheDocument();
  });
});
