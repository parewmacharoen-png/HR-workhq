import type { EmployeeListItem } from '../../api/employees';

const AVATAR_VARIANTS = ['green', 'pink', 'peach', 'lavender', 'blue', 'coral'] as const;
export type AvatarVariant = (typeof AVATAR_VARIANTS)[number];

export function initials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return (a + b).toUpperCase() || '?';
}

export function avatarVariantForId(id: string): AvatarVariant {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i)) % AVATAR_VARIANTS.length;
  }
  return AVATAR_VARIANTS[hash] ?? 'green';
}

export function employeeDisplayMeta(row: EmployeeListItem) {
  const positionPart = row.position ?? null;
  const deptPart = row.department ?? null;
  const role =
    positionPart && deptPart
      ? `${positionPart} · ${deptPart}`
      : positionPart ?? deptPart ?? null;
  return role;
}
