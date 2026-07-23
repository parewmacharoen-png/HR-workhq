// ============================================================================
// modules/exit/domain/services/exit-lifecycle.mapper.ts
// EMP-012 — lifecycle type/status mapping for dashboard & API.
// ============================================================================

import { ExitReason } from './exit-reason-policy.service';
import { ExitCaseStatus } from '../entities/employee-exit-case.entity';

export type ExitCaseType = 'resignation' | 'termination' | 'absconding';
export type ExitLifecycleStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ExitCaseSourceType = 'manual' | 'probation_review' | 'disciplinary_action';

export function resolveExitType(exitReason: ExitReason): ExitCaseType {
  if (exitReason === 'absconding') return 'absconding';
  if (exitReason === 'proper_resignation' || exitReason === 'constructive_resignation') {
    return 'resignation';
  }
  return 'termination';
}

export function toLifecycleStatus(status: ExitCaseStatus): ExitLifecycleStatus {
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'closed') return 'COMPLETED';
  if (status === 'draft' || status === 'pending_leader_review') return 'OPEN';
  return 'IN_PROGRESS';
}

export const OPEN_WORKFLOW_STATUSES: ExitCaseStatus[] = [
  'draft',
  'pending_leader_review',
  'pending_owner_review',
  'pending_settlement',
  'settled',
];
