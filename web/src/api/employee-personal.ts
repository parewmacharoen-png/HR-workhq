import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface EmployeePersonalEducation {
  id: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  sortOrder: number;
}

export interface EmployeePersonalWorkExperience {
  id: string;
  companyName: string;
  jobTitle: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  sortOrder: number;
}

export interface EmployeeIdentityDocument {
  id: string;
  fileName: string;
  mimeType: string | null;
  uploadedAt: string;
  currentVersion: number;
}

export interface EmployeePersonalResponse {
  personalInformation: {
    firstName: string;
    lastName: string;
    nickname: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    nationality: string | null;
    religion: string | null;
    maritalStatus: string | null;
  };
  contactInformation: {
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  governmentInformation: {
    nationalId: string | null;
    socialSecurityNumber: string | null;
    passportNumber: string | null;
    isMasked: boolean;
  };
  identityDocuments: {
    idCard: EmployeeIdentityDocument | null;
    passport: EmployeeIdentityDocument | null;
  };
  emergencyContact: {
    name: string | null;
    relationship: string | null;
    phone: string | null;
  };
  education: EmployeePersonalEducation[];
  workExperience: EmployeePersonalWorkExperience[];
}

export type UpdateEmployeePersonalPayload = {
  firstName?: string;
  lastName?: string;
  nickname?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  religion?: string;
  maritalStatus?: string;
  phone?: string;
  email?: string;
  address?: string;
  nationalId?: string;
  socialSecurityNumber?: string;
  passportNumber?: string;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  reason?: string;
};

export type CreateEducationPayload = {
  institution: string;
  degree?: string;
  fieldOfStudy?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
};

export type UpdateEducationPayload = Partial<CreateEducationPayload>;

export type CreateWorkExperiencePayload = {
  companyName: string;
  jobTitle: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
};

export type UpdateWorkExperiencePayload = Partial<CreateWorkExperiencePayload>;

export function fetchEmployeePersonal(employeeId: string) {
  return apiGet<EmployeePersonalResponse>(`/employees/${employeeId}/personal`);
}

export function updateEmployeePersonal(employeeId: string, body: UpdateEmployeePersonalPayload) {
  return apiPatch<EmployeePersonalResponse>(`/employees/${employeeId}/personal`, body);
}

export function createEmployeeEducation(employeeId: string, body: CreateEducationPayload) {
  return apiPost<EmployeePersonalEducation>(`/employees/${employeeId}/education`, body);
}

export function updateEmployeeEducation(
  employeeId: string,
  educationId: string,
  body: UpdateEducationPayload,
) {
  return apiPatch<EmployeePersonalEducation>(
    `/employees/${employeeId}/education/${educationId}`,
    body,
  );
}

export function deleteEmployeeEducation(employeeId: string, educationId: string) {
  return apiDelete<{ ok: boolean; id: string }>(`/employees/${employeeId}/education/${educationId}`);
}

export function createEmployeeWorkExperience(
  employeeId: string,
  body: CreateWorkExperiencePayload,
) {
  return apiPost<EmployeePersonalWorkExperience>(
    `/employees/${employeeId}/work-experience`,
    body,
  );
}

export function updateEmployeeWorkExperience(
  employeeId: string,
  experienceId: string,
  body: UpdateWorkExperiencePayload,
) {
  return apiPatch<EmployeePersonalWorkExperience>(
    `/employees/${employeeId}/work-experience/${experienceId}`,
    body,
  );
}

export function deleteEmployeeWorkExperience(employeeId: string, experienceId: string) {
  return apiDelete<{ ok: boolean; id: string }>(
    `/employees/${employeeId}/work-experience/${experienceId}`,
  );
}
