import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { roleLabel } from '../../../i18n/th-labels';
import { EmployeePersonalTab } from './EmployeePersonalTab';

const mockPersonal = {
  personalInformation: {
    firstName: 'Somchai',
    lastName: 'Test',
    nickname: 'ชาย',
    dateOfBirth: '1990-05-10',
    gender: 'male',
    nationality: 'Thai',
    religion: 'Buddhist',
    maritalStatus: 'single',
  },
  contactInformation: {
    phone: '0812345678',
    email: 'som@test.com',
    address: 'Bangkok',
  },
  governmentInformation: {
    nationalId: '1234-XXXX-XXXX-123',
    socialSecurityNumber: null,
    passportNumber: null,
    isMasked: true,
  },
  identityDocuments: {
    idCard: {
      id: 'doc-id-card',
      fileName: 'id-card.pdf',
      mimeType: 'application/pdf',
      uploadedAt: '2026-01-01T00:00:00.000Z',
      currentVersion: 1,
    },
    passport: null,
  },
  emergencyContact: {
    name: 'Jane',
    relationship: 'spouse',
    phone: '0899999999',
  },
  education: [],
  workExperience: [],
};

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    can: (p: string) => ['employee:read', 'employee:write', 'document:write'].includes(p),
    companyId: 'co-1',
    user: { id: 'u-1', permissions: [] },
  }),
}));

const personalApiMocks = vi.hoisted(() => ({
  updateEmployeePersonal: vi.fn(async () => ({
    ...mockPersonal,
    personalInformation: { ...mockPersonal.personalInformation, nickname: 'ชายใหม่' },
  })),
}));

const documentApiMocks = vi.hoisted(() => ({
  uploadEmployeeDocumentMultipart: vi.fn(async () => ({ id: 'doc-new', fileName: 'new.pdf' })),
  deleteEmployeeDocument: vi.fn(async () => ({ ok: true, id: 'doc-id-card' })),
  downloadEmployeeDocument: vi.fn(async () => undefined),
  previewEmployeeDocument: vi.fn(async () => undefined),
}));

vi.mock('../../../api/employee-personal', () => ({
  fetchEmployeePersonal: vi.fn(async () => mockPersonal),
  updateEmployeePersonal: personalApiMocks.updateEmployeePersonal,
}));

vi.mock('../../../api/document-center', () => ({
  uploadEmployeeDocumentMultipart: documentApiMocks.uploadEmployeeDocumentMultipart,
  deleteEmployeeDocument: documentApiMocks.deleteEmployeeDocument,
  downloadEmployeeDocument: documentApiMocks.downloadEmployeeDocument,
  previewEmployeeDocument: documentApiMocks.previewEmployeeDocument,
}));

describe('roleLabel', () => {
  it('maps business role to Thai label', () => {
    expect(roleLabel('secretary')).toBe('เลขานุการ / HR');
    expect(roleLabel('big_leader')).toBe('หัวหน้าใหญ่');
  });
});

describe('EmployeePersonalTab scope lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('does not render out-of-scope sections or fields', async () => {
    render(
      <MemoryRouter>
        <EmployeePersonalTab employeeId="emp-1" canEdit onReload={() => {}} />
      </MemoryRouter>,
    );
    await screen.findByText('ข้อมูลส่วนตัว');
    expect(screen.queryByText('Line ID')).not.toBeInTheDocument();
    expect(screen.queryByText('เลขผู้เสียภาษี')).not.toBeInTheDocument();
    expect(screen.queryByText('รูปโปรไฟล์')).not.toBeInTheDocument();
    expect(screen.queryByText('ข้อมูลครอบครัว')).not.toBeInTheDocument();
    expect(screen.queryByText('ข้อมูลการแพทย์')).not.toBeInTheDocument();
    expect(screen.queryByText('ผู้ติดต่อฉุกเฉิน')).not.toBeInTheDocument();
    expect(screen.queryByText('ประวัติการศึกษา')).not.toBeInTheDocument();
    expect(screen.queryByText('ประวัติการทำงาน')).not.toBeInTheDocument();
    expect(screen.queryByText('สัญชาติ')).not.toBeInTheDocument();
    expect(screen.queryByText('ประกันสังคม')).not.toBeInTheDocument();
    expect(screen.queryByText('ที่อยู่')).not.toBeInTheDocument();
  });

  it('renders only two identity document slots', async () => {
    render(
      <MemoryRouter>
        <EmployeePersonalTab employeeId="emp-1" canEdit onReload={() => {}} />
      </MemoryRouter>,
    );
    await screen.findByText('เอกสารยืนยันตัวตน');
    expect(screen.getByTestId('identity-doc-slot-id-card')).toBeInTheDocument();
    expect(screen.getByTestId('identity-doc-slot-passport')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^identity-doc-slot-/)).toHaveLength(2);
  });
});

describe('EmployeePersonalTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('loads and shows personal sections', async () => {
    render(
      <MemoryRouter>
        <EmployeePersonalTab employeeId="emp-1" canEdit onReload={() => {}} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('ข้อมูลส่วนตัว')).toBeInTheDocument();
    expect(screen.getByText('ข้อมูลติดต่อ')).toBeInTheDocument();
    expect(screen.getByText('ข้อมูลทางราชการ')).toBeInTheDocument();
    expect(screen.getByText('Somchai')).toBeInTheDocument();
    expect(screen.getByText('0812345678')).toBeInTheDocument();
  });

  it('shows masked national id when returned from API', async () => {
    render(
      <MemoryRouter>
        <EmployeePersonalTab employeeId="emp-1" canEdit onReload={() => {}} />
      </MemoryRouter>,
    );
    await screen.findByText('1234-XXXX-XXXX-123');
  });

  it('edit personal info saves', async () => {
    render(
      <MemoryRouter>
        <EmployeePersonalTab employeeId="emp-1" canEdit onReload={() => {}} />
      </MemoryRouter>,
    );
    await screen.findByTestId('personal-edit-button');
    fireEvent.click(screen.getByTestId('personal-edit-button'));
    const nicknameInput = screen.getByDisplayValue('ชาย');
    fireEvent.change(nicknameInput, { target: { value: 'ชายใหม่' } });
    fireEvent.click(screen.getByTestId('personal-save-button'));
    await waitFor(() => expect(personalApiMocks.updateEmployeePersonal).toHaveBeenCalled());
  });

  it('cancel restores original values', async () => {
    render(
      <MemoryRouter>
        <EmployeePersonalTab employeeId="emp-1" canEdit onReload={() => {}} />
      </MemoryRouter>,
    );
    await screen.findByTestId('personal-edit-button');
    fireEvent.click(screen.getByTestId('personal-edit-button'));
    fireEvent.change(screen.getByDisplayValue('ชาย'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByTestId('personal-cancel-button'));
    expect(screen.getByText('ชาย')).toBeInTheDocument();
    expect(personalApiMocks.updateEmployeePersonal).not.toHaveBeenCalled();
  });

  it('identity document delete calls API', async () => {
    render(
      <MemoryRouter>
        <EmployeePersonalTab employeeId="emp-1" canEdit onReload={() => {}} />
      </MemoryRouter>,
    );
    await screen.findByTestId('identity-doc-slot-id-card');
    const slot = screen.getByTestId('identity-doc-slot-id-card');
    fireEvent.click(within(slot).getByRole('button', { name: 'ลบ' }));
    await waitFor(() => expect(documentApiMocks.deleteEmployeeDocument).toHaveBeenCalledWith('doc-id-card'));
  });
});
