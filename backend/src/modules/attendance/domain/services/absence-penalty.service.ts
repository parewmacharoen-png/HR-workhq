// ============================================================================
// modules/attendance/domain/services/absence-penalty.service.ts
// ABS-002–004 via roleLevel; ABS-009 Secretary via position; Owner exempt.
// ============================================================================

import { AbsencePenaltiesByRole } from '../../../settings/domain/leave-settings.types';
import { AbsenceRoleLevel } from '../entities/absence-record.entity';

export interface PenaltyResolution {
  amount: number;
  exempt: boolean;
  roleLevelSnapshot: AbsenceRoleLevel;
  tier: string;
}

export function normalizePosition(position: string | null | undefined): string | null {
  if (!position?.trim()) return null;
  return position.trim().toLowerCase();
}

export function isOwnerPosition(position: string | null | undefined): boolean {
  return normalizePosition(position) === 'owner';
}

export function resolveAbsencePenalty(input: {
  position: string | null;
  roleLevel: AbsenceRoleLevel;
  penalties: AbsencePenaltiesByRole;
}): PenaltyResolution {
  const pos = normalizePosition(input.position);

  if (pos === 'owner') {
    return {
      amount: 0,
      exempt: true,
      roleLevelSnapshot: input.roleLevel,
      tier: 'owner_exempt',
    };
  }

  if (pos === 'secretary') {
    return {
      amount: input.penalties.secretary,
      exempt: false,
      roleLevelSnapshot: input.roleLevel,
      tier: 'secretary',
    };
  }

  const amountByRole: Record<AbsenceRoleLevel, number> = {
    employee: input.penalties.employee,
    sub_leader: input.penalties.subLeader,
    big_leader: input.penalties.bigLeader,
  };

  return {
    amount: amountByRole[input.roleLevel],
    exempt: false,
    roleLevelSnapshot: input.roleLevel,
    tier: input.roleLevel,
  };
}

export const MIN_CONTACT_NOTES_LENGTH = 10;

export function validateContactNotes(notes: string | null | undefined): boolean {
  return typeof notes === 'string' && notes.trim().length >= MIN_CONTACT_NOTES_LENGTH;
}
