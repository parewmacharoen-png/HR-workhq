import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { calculateTenure, NO_DATA } from '../../../lib/employee-date-utils';
import { canViewEmployeeSalary } from '../../../lib/employee-salary-visibility';
import { DELETE_CONFIRMATION } from './EmployeeDetailModals';
import { roleLabel } from '../../../i18n/th-labels';
import { fetchEmployeeOverview } from '../../../api/employee-overview';
import EmployeeDetailPage from '../../../pages/hr/EmployeeDetailPage';

const authPermissions = vi.hoisted(() => ({
  list: ['employee:read', 'employee:write', 'document:read', 'leave:read', 'attendance:read', 'performance:read', 'commission:read'] as string[],
}));

const authViewer = vi.hoisted(() => ({
  businessRole: 'employee',
  employeeId: 'other-emp',
}));

function mockCan(permission: string) {
  return authPermissions.list.includes(permission);
}

const mockOverview = {
  summary: {
    id: 'emp-1',
    globalId: 'EMP001',
    firstName: 'Somchai',
    lastName: 'Test',
    nickname: null,
    companyName: 'Acme',
    department: null,
    teamName: 'Ops',
    position: null,
    businessRole: 'employee',
    employmentStatus: 'active',
    telegramStatus: 'not_linked' as const,
    telegramUsername: null,
    managerName: null,
    hireDate: '2020-01-15',
    tenureDisplay: '6 ปี',
    dateOfBirth: '1990-05-10',
    ageYears: 35,
    birthdayInDays: 42,
    isBirthdayToday: false,
    isAnniversaryToday: false,
    workAnniversaryInDays: 15,
    hasNationalId: false,
  },
  attendance: null,
  leave: null,
  payroll: null,
  kpi: null,
  alerts: [
    {
      id: 'telegram-missing',
      icon: '⚠',
      title: 'Telegram ยังไม่ได้เชื่อม',
      description: 'ส่งลิงก์เชื่อมบัญชี Telegram ให้พนักงาน',
      actionLabel: 'เชื่อม Telegram',
      actionTab: 'overview',
    },
    {
      id: 'national-id-missing',
      icon: '🪪',
      title: 'ยังไม่มีเลขบัตรประชาชน',
      description: 'เพิ่มเลขบัตรประชาชนในโปรไฟล์พนักงาน',
      actionLabel: 'ดูข้อมูลส่วนตัว',
      actionTab: 'personal',
    },
  ],
  recentActivities: [],
  upcomingEvents: [],
};

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    can: mockCan,
    companyId: 'co-1',
    user: {
      id: 'u-1',
      employeeId: authViewer.employeeId,
      businessRole: authViewer.businessRole,
      permissions: [],
    },
    companies: [{ id: 'co-1', name: 'Acme', code: 'ACME' }],
  }),
  useCompanyId: () => 'co-1',
}));

vi.mock('../../../api/client', () => ({
  apiGet: vi.fn(async (path: string) => {
    if (path === '/employees/emp-1') {
      return {
        id: 'emp-1',
        globalId: 'EMP001',
        firstName: 'Somchai',
        lastName: 'Test',
        phone: '0812345678',
        employmentStatus: 'active',
        hireDate: '2020-01-15',
        dateOfBirth: '1990-05-10',
      };
    }
    if (path.includes('profile-full')) {
      return {
        id: 'emp-1',
        globalId: 'EMP001',
        firstName: 'Somchai',
        lastName: 'Test',
        hireDate: '2020-01-15',
        employmentStatus: 'active',
        companyName: 'Acme',
        teamName: 'Ops',
      };
    }
    if (path.includes('telegram-identity')) return null;
    if (path.includes('home-summary')) return { pendingRequests: 0, documentsNeedingAction: 0 };
    if (path.includes('documents/employees')) return { requiredMissing: [] };
    if (path.includes('effective-access')) return { businessRole: 'employee' };
    if (path.includes('/teams')) return [];
    return {};
  }),
  ApiError: class ApiError extends Error {
    requestId?: string;
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  fetchCompanies: vi.fn(async () => [{ id: 'co-1', name: 'Acme', code: 'ACME' }]),
}));

vi.mock('../../../api/employee-profile', () => ({
  fetchEmployeeFullProfile: vi.fn(async () => ({
    id: 'emp-1',
    globalId: 'EMP001',
    firstName: 'Somchai',
    lastName: 'Test',
    hireDate: '2020-01-15',
    employmentStatus: 'active',
    companyName: 'Acme',
    teamName: 'Ops',
  })),
  fetchEmployeeAuditLog: vi.fn(async () => []),
  fetchEmployeeChangeHistory: vi.fn(async () => []),
}));

vi.mock('../../../api/employee-onboarding', () => ({
  getEmployeeOnboardingStatus: vi.fn(async () => ({ telegramStatus: 'not_connected' })),
}));

vi.mock('../../../api/employee-employment', () => ({
  fetchEmployeeEmployment: vi.fn(async () => ({
    employment: {
      employeeCode: 'EMP000001',
      companyId: 'co-1',
      companyName: 'Acme',
      department: 'HR',
      teamId: 'team-1',
      teamName: 'Ops',
      businessRole: 'employee',
      position: 'Dev',
      employmentType: 'permanent',
      employmentStatus: 'active',
      joinDate: '2020-01-15',
      probationEndDate: null,
      confirmedDate: null,
      resignDate: null,
      shift: null,
      workLocation: 'office',
    },
    supervisor: null,
    bigLeader: null,
    subLeader: null,
  })),
  updateEmployeeEmployment: vi.fn(),
  fetchCompanyTeams: vi.fn(async () => []),
}));

vi.mock('../../../api/employee-overview', () => ({
  fetchEmployeeOverview: vi.fn(async () => mockOverview),
  fetchEmployeeSalaryHistory: vi.fn(async () => ({ employeeId: 'emp-1', bands: [] })),
}));

vi.mock('../../../api/employee-personal', () => ({
  fetchEmployeePersonal: vi.fn(async () => ({
    personalInformation: {
      firstName: 'Somchai', lastName: 'Test', nickname: null, dateOfBirth: '1990-05-10', gender: null,
      nationality: null, religion: null, maritalStatus: null,
    },
    contactInformation: { phone: '0812345678', email: null, address: null },
    governmentInformation: { nationalId: null, socialSecurityNumber: null, passportNumber: null, isMasked: true },
    identityDocuments: { idCard: null, passport: null },
    emergencyContact: { name: null, relationship: null, phone: null },
    education: [],
    workExperience: [],
  })),
  updateEmployeePersonal: vi.fn(),
  createEmployeeEducation: vi.fn(),
  updateEmployeeEducation: vi.fn(),
  deleteEmployeeEducation: vi.fn(),
  createEmployeeWorkExperience: vi.fn(),
  updateEmployeeWorkExperience: vi.fn(),
  deleteEmployeeWorkExperience: vi.fn(),
}));

vi.mock('../employee/EmployeeAttendanceTab', () => ({
  EmployeeAttendanceTab: () => <div>Attendance tab</div>,
}));
vi.mock('../employee/EmployeePayrollTab', () => ({
  EmployeePayrollTab: () => <div data-testid="employee-payroll-tab">Payroll tab</div>,
}));
vi.mock('../employee/EmployeePerformanceTab', () => ({
  EmployeePerformanceTab: () => <div data-testid="employee-performance-tab">Performance tab</div>,
}));
vi.mock('../employee/EmployeeCommissionTab', () => ({
  EmployeeCommissionTab: () => <div data-testid="employee-commission-tab">Commission tab</div>,
}));
vi.mock('../../../components/hr/employee/EmployeeTelegramLinkModal', () => ({
  EmployeeTelegramLinkModal: () => null,
}));

vi.mock('../../../api/hierarchy', () => ({
  fetchReportingPath: vi.fn(async () => ({ path: [] })),
}));

vi.mock('../../EmployeeAccessControlSection', () => ({
  EmployeeAccessControlSection: () => <div>Access</div>,
}));
vi.mock('../../EmployeeCompensationSection', () => ({
  EmployeeCompensationSection: () => <div>Compensation</div>,
}));
vi.mock('../../EmployeeDocumentsSection', () => ({
  EmployeeDocumentsSection: () => <div>Docs</div>,
}));
vi.mock('../employee/EmployeeLeaveTab', () => ({
  EmployeeLeaveTab: () => <div data-testid="employee-leave-tab">Leave tab</div>,
}));
vi.mock('../../EmployeeProfileSections', () => ({
  EmployeeProfileSections: () => null,
}));
vi.mock('../../EmployeeReportingSection', () => ({
  EmployeeReportingSection: () => null,
}));
vi.mock('../../EmployeeProbationSection', () => ({
  EmployeeProbationSection: () => null,
}));
vi.mock('../employee/EmployeeTimelineTab', () => ({
  EmployeeTimelineTab: () => <div data-testid="employee-timeline-tab">Timeline</div>,
}));

function LocationProbe({ onChange }: { onChange: (search: string) => void }) {
  const location = useLocation();
  useEffect(() => {
    onChange(location.search);
  }, [location.search, onChange]);
  return null;
}

function EmployeeDetailWithNav() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" data-testid="nav-back" onClick={() => navigate(-1)}>back</button>
      <button type="button" data-testid="nav-forward" onClick={() => navigate(1)}>forward</button>
      <EmployeeDetailPage />
    </>
  );
}

function renderEmployeePage(initialEntry = '/hr/employees/emp-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/hr/employees/:id" element={<EmployeeDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEmployeePageWithSearch(onSearchChange: (search: string) => void, initialEntry = '/hr/employees/emp-1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe onChange={onSearchChange} />
      <Routes>
        <Route path="/hr/employees/:id" element={<EmployeeDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderEmployeePageWithHistory(initialEntries: string[], initialIndex: number) {
  return render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <Routes>
        <Route path="/hr/employees/:id" element={<EmployeeDetailWithNav />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('employee salary visibility', () => {
  it('hides salary for unrelated employee role', () => {
    expect(canViewEmployeeSalary(
      { employeeId: 'other-emp', businessRole: 'employee', permissions: [] },
      'emp-1',
    )).toBe(false);
  });

  it('allows self salary view', () => {
    expect(canViewEmployeeSalary(
      { employeeId: 'emp-1', businessRole: 'employee', permissions: [] },
      'emp-1',
    )).toBe(true);
  });
});

describe('employee-date-utils tenure', () => {
  it('calculates work tenure correctly', () => {
    const tenure = calculateTenure('2020-06-01');
    expect(tenure).toMatch(/\d+ (ปี|เดือน)/);
  });
});

describe('EmployeeDetail overview', () => {
  it('renders overview tab with quick summary section', async () => {
    renderEmployeePage();
    expect(await screen.findByText('สรุปด่วน')).toBeInTheDocument();
  });

  it('renders 6 summary cards from overview API', async () => {
    renderEmployeePage();
    const grid = await screen.findByTestId('employee-summary-cards');
    expect(grid.querySelectorAll('[data-testid^="summary-card-"]')).toHaveLength(6);
  });

  it('clicking attendance summary card changes tab', async () => {
    renderEmployeePage();
    const card = await screen.findByTestId('summary-card-attendance');
    fireEvent.click(card);
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'เวลาทำงาน' });
      expect(btn.className).toContain('active');
    });
  });

  it('renders alerts from overview API', async () => {
    renderEmployeePage();
    expect(await screen.findByTestId('alert-telegram-missing')).toBeInTheDocument();
    expect(screen.getByTestId('alert-national-id-missing')).toBeInTheDocument();
  });

  it('header shows birthday and anniversary countdown', async () => {
    renderEmployeePage();
    expect(await screen.findByText('อีก 42 วันถึงวันเกิด')).toBeInTheDocument();
    expect(screen.getByText('อีก 15 วันถึงครบรอบงาน')).toBeInTheDocument();
  });

  it('shows missing data label when field absent', async () => {
    renderEmployeePage();
    expect(await screen.findAllByText(NO_DATA)).not.toHaveLength(0);
    expect(NO_DATA).toBe('ยังไม่มีข้อมูล');
  });

  it('header shows Thai business role label', async () => {
    renderEmployeePage();
    expect(await screen.findByText(roleLabel('employee'))).toBeInTheDocument();
  });

  it('shows summary cards skeleton while overview loads', async () => {
    vi.mocked(fetchEmployeeOverview).mockImplementationOnce(() => new Promise(() => {}));
    renderEmployeePage();
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.getByTestId('employee-summary-cards-skeleton')).toBeInTheDocument();
  });

  it('shows telegram link header action', async () => {
    renderEmployeePage();
    expect(await screen.findByRole('button', { name: 'เชื่อม Telegram' })).toBeInTheDocument();
  });
});

describe('Delete confirmation', () => {
  it('requires DELETE EMPLOYEE confirmation constant', () => {
    expect(DELETE_CONFIRMATION).toBe('DELETE EMPLOYEE');
  });
});

describe('Salary tab permission', () => {
  it('payroll tab is hidden without salary visibility', async () => {
    renderEmployeePage();
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.queryByRole('button', { name: 'เงินเดือน' })).not.toBeInTheDocument();
  });

  it('payroll tab shows permission denied when opened via ?tab=payroll', async () => {
    renderEmployeePage('/hr/employees/emp-1?tab=payroll');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.getByText('ไม่มีสิทธิ์ดูเงินเดือน')).toBeInTheDocument();
    expect(screen.queryByTestId('employee-payroll-tab')).not.toBeInTheDocument();
  });
});

describe('Employee detail tabs', () => {
  it('does not render the legacy History tab', async () => {
    renderEmployeePage();
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ประวัติเดิม' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ไทม์ไลน์' })).toBeInTheDocument();
  });

  it('opens Timeline tab from ?tab=timeline', async () => {
    renderEmployeePage('/hr/employees/emp-1?tab=timeline');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(await screen.findByTestId('employee-timeline-tab')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ไทม์ไลน์' }).className).toContain('active');
  });

  it('opens Personal tab from ?tab=personal', async () => {
    renderEmployeePage('/hr/employees/emp-1?tab=personal');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.getByRole('button', { name: 'ข้อมูลส่วนตัว' }).className).toContain('active');
  });

  it('falls back to Overview for invalid ?tab=', async () => {
    renderEmployeePage('/hr/employees/emp-1?tab=not-a-tab');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.getByRole('button', { name: 'ภาพรวม' }).className).toContain('active');
    expect(await screen.findByText('สรุปด่วน')).toBeInTheDocument();
  });

  it('updates URL query param when clicking tabs', async () => {
    let currentSearch = '';
    renderEmployeePageWithSearch((search) => { currentSearch = search; });
    await screen.findByRole('heading', { name: /Somchai Test/i });
    fireEvent.click(screen.getByRole('button', { name: 'ไทม์ไลน์' }));
    await waitFor(() => {
      expect(currentSearch).toBe('?tab=timeline');
    });
    fireEvent.click(screen.getByRole('button', { name: 'ภาพรวม' }));
    await waitFor(() => {
      expect(currentSearch).toBe('');
    });
  });

  it('opens Leave tab from ?tab=leave', async () => {
    renderEmployeePage('/hr/employees/emp-1?tab=leave');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(await screen.findByTestId('employee-leave-tab')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'การลา' }).className).toContain('active');
  });

  it('opens Attendance tab from ?tab=attendance', async () => {
    renderEmployeePage('/hr/employees/emp-1?tab=attendance');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(await screen.findByText('Attendance tab')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เวลาทำงาน' }).className).toContain('active');
  });

  it('opens Payroll tab from ?tab=payroll when viewer has salary access', async () => {
    authViewer.businessRole = 'owner';
    renderEmployeePage('/hr/employees/emp-1?tab=payroll');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(await screen.findByTestId('employee-payroll-tab')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เงินเดือน' }).className).toContain('active');
    authViewer.businessRole = 'employee';
  });

  it('maps legacy ?tab=salary to payroll tab', async () => {
    authViewer.businessRole = 'owner';
    renderEmployeePage('/hr/employees/emp-1?tab=salary');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(await screen.findByTestId('employee-payroll-tab')).toBeInTheDocument();
    authViewer.businessRole = 'employee';
  });

  it('opens Performance tab from ?tab=performance', async () => {
    renderEmployeePage('/hr/employees/emp-1?tab=performance');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(await screen.findByTestId('employee-performance-tab')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ผลการทำงาน' }).className).toContain('active');
  });

  it('maps legacy ?tab=kpi to performance tab', async () => {
    renderEmployeePage('/hr/employees/emp-1?tab=kpi');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(await screen.findByTestId('employee-performance-tab')).toBeInTheDocument();
  });

  it('performance tab shows permission denied without performance:read', async () => {
    authPermissions.list = authPermissions.list.filter((p) => p !== 'performance:read');
    renderEmployeePage('/hr/employees/emp-1?tab=performance');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.getByText('ไม่มีสิทธิ์ดูผลการทำงาน')).toBeInTheDocument();
    authPermissions.list.push('performance:read');
  });

  it('performance tab is hidden without performance:read', async () => {
    authPermissions.list = authPermissions.list.filter((p) => p !== 'performance:read');
    renderEmployeePage();
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.queryByRole('button', { name: 'ผลการทำงาน' })).not.toBeInTheDocument();
    authPermissions.list.push('performance:read');
  });

  it('opens Commission tab from ?tab=commission', async () => {
    renderEmployeePage('/hr/employees/emp-1?tab=commission');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(await screen.findByTestId('employee-commission-tab')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ค่าคอมมิชชั่น' }).className).toContain('active');
  });

  it('commission tab shows permission denied without commission:read', async () => {
    authPermissions.list = authPermissions.list.filter((p) => p !== 'commission:read');
    renderEmployeePage('/hr/employees/emp-1?tab=commission');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.getByText('ไม่มีสิทธิ์ดูคอมมิชชั่น')).toBeInTheDocument();
    authPermissions.list.push('commission:read');
  });

  it('commission tab is hidden without commission:read', async () => {
    authPermissions.list = authPermissions.list.filter((p) => p !== 'commission:read');
    renderEmployeePage();
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.queryByRole('button', { name: 'ค่าคอมมิชชั่น' })).not.toBeInTheDocument();
    authPermissions.list.push('commission:read');
  });

  it('attendance tab shows permission denied without attendance:read', async () => {
    authPermissions.list = authPermissions.list.filter((p) => p !== 'attendance:read');
    renderEmployeePage('/hr/employees/emp-1?tab=attendance');
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.getByText('ไม่มีสิทธิ์ดูเวลาทำงาน')).toBeInTheDocument();
    authPermissions.list.push('attendance:read');
  });

  it('syncs selected tab on browser back and forward', async () => {
    renderEmployeePageWithHistory([
      '/hr/employees/emp-1',
      '/hr/employees/emp-1?tab=personal',
      '/hr/employees/emp-1?tab=timeline',
    ], 2);
    await screen.findByRole('heading', { name: /Somchai Test/i });
    expect(screen.getByRole('button', { name: 'ไทม์ไลน์' }).className).toContain('active');
    fireEvent.click(screen.getByTestId('nav-back'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ข้อมูลส่วนตัว' }).className).toContain('active');
    });
    fireEvent.click(screen.getByTestId('nav-forward'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ไทม์ไลน์' }).className).toContain('active');
    });
  });
});

afterEach(() => {
  cleanup();
});
