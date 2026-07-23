import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppPageLayout } from './layout/AppPageLayout';
import { WorkHQErrorState } from './states/WorkHQErrorState';
import { WorkHQEmptyState } from './states/WorkHQEmptyState';
import { WorkHQPageState } from './states/WorkHQPageState';
import { GlobalQuickCreate } from './quick-create/GlobalQuickCreate';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    can: (p: string) => ['employee:write', 'workflow:read', 'payroll:read', 'settings:read', 'workflow:write'].includes(p),
    user: { permissions: [] },
  }),
}));

function withRouter(ui: ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe('AppPageLayout', () => {
  it('renders header, actions, and content', () => {
    render(
      withRouter(
        <AppPageLayout
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Test' }]}
          title="Test Page"
          description="Description"
          primaryAction={<button type="button">Primary</button>}
          secondaryActions={<button type="button">Secondary</button>}
          quickActions={<span>Quick</span>}
          stats={<span>Stats</span>}
        >
          <p>Main content</p>
        </AppPageLayout>,
      ),
    );
    expect(screen.getByRole('heading', { name: 'Test Page' })).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Secondary')).toBeInTheDocument();
    expect(screen.getByText('Quick')).toBeInTheDocument();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText('Main content')).toBeInTheDocument();
  });
});

describe('WorkHQErrorState', () => {
  it('hides raw backend error text', () => {
    render(
      withRouter(
        <WorkHQErrorState referenceCode="req-123" onRetry={() => undefined} />,
      ),
    );
    expect(screen.getByText('โหลดข้อมูลไม่สำเร็จ')).toBeInTheDocument();
    expect(screen.getByText(/ข้อมูลของคุณยังปลอดภัย/)).toBeInTheDocument();
    expect(screen.queryByText(/Database Error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Prisma/i)).not.toBeInTheDocument();
    expect(screen.getByText('req-123')).toBeInTheDocument();
  });
});

describe('WorkHQEmptyState', () => {
  it('shows CTA', () => {
    render(
      <WorkHQEmptyState
        title="ยังไม่มีข้อมูล"
        action={<button type="button">สร้างใหม่</button>}
      />,
    );
    expect(screen.getByText('ยังไม่มีข้อมูล')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'สร้างใหม่' })).toBeInTheDocument();
  });
});

describe('WorkHQPageState', () => {
  it('switches states correctly', () => {
    const { rerender } = render(
      <WorkHQPageState state="loading"><p>Content</p></WorkHQPageState>,
    );
    expect(screen.getByText('กำลังโหลดข้อมูล…')).toBeInTheDocument();

    rerender(<WorkHQPageState state="success"><p>Content</p></WorkHQPageState>);
    expect(screen.getByText('Content')).toBeInTheDocument();

    rerender(<WorkHQPageState state="empty"><p>Content</p></WorkHQPageState>);
    expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument();
  });
});

describe('GlobalQuickCreate', () => {
  it('renders only valid actions', () => {
    render(withRouter(<GlobalQuickCreate />));
    expect(screen.getByLabelText('สร้างรายการใหม่')).toBeInTheDocument();
  });
});
