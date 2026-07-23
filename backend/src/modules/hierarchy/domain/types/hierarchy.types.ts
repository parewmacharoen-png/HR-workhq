// ============================================================================
// modules/hierarchy/domain/types/hierarchy.types.ts
// ============================================================================

export type HierarchyRelationshipType =
  | 'direct_manager'
  | 'functional_manager'
  | 'acting_manager'
  | 'mentor';

export const HIERARCHY_RELATIONSHIP_TYPES: HierarchyRelationshipType[] = [
  'direct_manager',
  'functional_manager',
  'acting_manager',
  'mentor',
];

export interface HierarchyEmployeeSummary {
  employeeId: string;
  globalId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  department: string | null;
  roleLevel: string | null;
  businessRole: string | null;
}

export interface ReportingPathNode extends HierarchyEmployeeSummary {
  relationshipType: HierarchyRelationshipType | null;
}

export interface OrganizationTreeNode extends HierarchyEmployeeSummary {
  directReportCount: number;
  children: OrganizationTreeNode[];
}

export interface DirectReportItem extends HierarchyEmployeeSummary {
  employmentStatus: string;
}

export interface HierarchySummary {
  employeeId: string;
  directReportCount: number;
  teamSize: number;
  pendingLeaveCount: number;
  pendingApprovalCount: number;
  lateArrivalCountToday: number;
}

export interface UpdateReportingLineInput {
  managerEmployeeId: string | null;
  relationshipType?: HierarchyRelationshipType;
  effectiveFrom?: string;
}
