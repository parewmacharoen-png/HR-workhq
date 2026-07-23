import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EmployeeTimelineTab } from './EmployeeTimelineTab';

function isoDaysAgo(days: number, hour = 10): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const mockItems = [
  {
    id: 'ch-1',
    timestamp: isoDaysAgo(0, 14),
    category: 'PERSONAL' as const,
    eventKey: 'personal_updated' as const,
    title: 'Personal updated',
    description: 'Changed phone number',
    actor: { name: 'Secretary User', businessRole: 'secretary' },
    source: 'Web Admin',
    icon: 'user',
    color: 'blue',
  },
  {
    id: 'ch-2',
    timestamp: isoDaysAgo(1, 9),
    category: 'EMPLOYMENT' as const,
    eventKey: 'department_changed' as const,
    title: 'Employment updated',
    description: 'Changed department',
    actor: { name: 'Owner User', businessRole: 'owner' },
    source: 'Web Admin',
    icon: 'briefcase',
    color: 'purple',
  },
  {
    id: 'ch-3',
    timestamp: isoDaysAgo(0, 10),
    category: 'PERSONAL' as const,
    eventKey: 'government_info_updated' as const,
    title: 'Personal updated',
    description: 'Changed nationalId to ****',
    actor: { name: 'Secretary User', businessRole: 'secretary' },
    source: 'Web Admin',
    icon: 'user',
    color: 'blue',
  },
];

const timelineApiMock = vi.hoisted(() => ({
  fetchEmployeeTimeline: vi.fn(async () => ({ items: mockItems })),
}));

vi.mock('../../../api/employee-timeline', () => timelineApiMock);

describe('EmployeeTimelineTab', () => {
  beforeEach(() => {
    timelineApiMock.fetchEmployeeTimeline.mockResolvedValue({ items: mockItems });
  });

  it('renders timeline grouped newest first', async () => {
    render(
      <MemoryRouter>
        <EmployeeTimelineTab employeeId="emp-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('employee-timeline-tab')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-group-today')).toBeInTheDocument();
    expect(screen.getByText('Changed phone number')).toBeInTheDocument();
  });

  it('shows loading skeleton initially', () => {
    timelineApiMock.fetchEmployeeTimeline.mockImplementation(
      () => new Promise(() => {}),
    );
    render(
      <MemoryRouter>
        <EmployeeTimelineTab employeeId="emp-1" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('timeline-skeleton')).toBeInTheDocument();
  });

  it('filters by employment category', async () => {
    render(
      <MemoryRouter>
        <EmployeeTimelineTab employeeId="emp-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('timeline-item-ch-1');
    fireEvent.click(screen.getByTestId('timeline-filter-employment'));
    expect(screen.getByText('Changed department')).toBeInTheDocument();
    expect(screen.queryByText('Changed phone number')).not.toBeInTheDocument();
  });

  it('searches by description', async () => {
    render(
      <MemoryRouter>
        <EmployeeTimelineTab employeeId="emp-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('timeline-item-ch-1');
    fireEvent.change(screen.getByTestId('timeline-search'), { target: { value: 'department' } });
    expect(screen.getByText('Changed department')).toBeInTheDocument();
    expect(screen.queryByText('Changed phone number')).not.toBeInTheDocument();
  });

  it('shows masked sensitive description from API', async () => {
    render(
      <MemoryRouter>
        <EmployeeTimelineTab employeeId="emp-1" />
      </MemoryRouter>,
    );
    await screen.findByText(/Changed nationalId to \*\*\*\*/);
  });

  it('shows empty state when filter has no matches', async () => {
    render(
      <MemoryRouter>
        <EmployeeTimelineTab employeeId="emp-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('timeline-item-ch-1');
    fireEvent.click(screen.getByTestId('timeline-filter-system'));
    expect(await screen.findByText('ยังไม่มีประวัติ')).toBeInTheDocument();
  });

  it('shows empty state when API returns no items', async () => {
    timelineApiMock.fetchEmployeeTimeline.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter>
        <EmployeeTimelineTab employeeId="emp-1" />
      </MemoryRouter>,
    );
    expect(await screen.findByText('ยังไม่มีประวัติ')).toBeInTheDocument();
  });

  it('includes eventKey on timeline items from API', async () => {
    render(
      <MemoryRouter>
        <EmployeeTimelineTab employeeId="emp-1" />
      </MemoryRouter>,
    );
    await screen.findByTestId('timeline-item-ch-1');
    const response = await timelineApiMock.fetchEmployeeTimeline.mock.results[0]?.value;
    expect(response.items[0].eventKey).toBe('personal_updated');
    expect(response.items[1].eventKey).toBe('department_changed');
  });
});
