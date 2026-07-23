import { apiGet } from './client';

export type EmployeeTimelineCategory =
  | 'PERSONAL'
  | 'EMPLOYMENT'
  | 'DOCUMENT'
  | 'EDUCATION'
  | 'WORK_EXPERIENCE'
  | 'STATUS'
  | 'SYSTEM'
  | 'OTHER';

export interface EmployeeTimelineActor {
  name: string;
  businessRole: string | null;
}

export type EmployeeTimelineEventKey =
  | 'employee_created'
  | 'employee_updated'
  | 'personal_updated'
  | 'government_info_updated'
  | 'emergency_contact_updated'
  | 'employment_updated'
  | 'company_transferred'
  | 'department_changed'
  | 'team_changed'
  | 'business_role_changed'
  | 'position_changed'
  | 'employment_status_changed'
  | 'probation_date_changed'
  | 'confirmed_date_changed'
  | 'resign_date_changed'
  | 'supervisor_changed'
  | 'shift_changed'
  | 'work_location_changed'
  | 'education_added'
  | 'education_updated'
  | 'education_deleted'
  | 'experience_added'
  | 'experience_updated'
  | 'experience_deleted'
  | 'identity_document_uploaded'
  | 'identity_document_replaced'
  | 'identity_document_deleted'
  | 'status_changed'
  | 'probation_passed'
  | 'system_event'
  | 'other';

export interface EmployeeTimelineItem {
  id: string;
  timestamp: string;
  category: EmployeeTimelineCategory;
  eventKey: EmployeeTimelineEventKey;
  title: string;
  description: string;
  actor: EmployeeTimelineActor | null;
  source: string;
  icon: string;
  color: string;
}

export interface EmployeeTimelineResponse {
  items: EmployeeTimelineItem[];
}

export function fetchEmployeeTimeline(employeeId: string) {
  return apiGet<EmployeeTimelineResponse>(`/employees/${employeeId}/timeline`);
}
