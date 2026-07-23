// ============================================================================
// modules/position-framework/application/framework-entity.util.ts
// KPI-004 — shared clone, archive, delete, newVersion helpers
// ============================================================================

export type FrameworkEntityStatus = 'draft' | 'active' | 'archived';

export interface FrameworkEntityRecord {
  id: string;
  version: number;
  rootId: string | null;
  sourceId: string | null;
  status: FrameworkEntityStatus;
  deletedAt?: Date | null;
}

export function resolveRootId(entity: Pick<FrameworkEntityRecord, 'id' | 'rootId'>): string {
  return entity.rootId ?? entity.id;
}

export function buildCloneVersionFields(source: Pick<FrameworkEntityRecord, 'id' | 'rootId'>): {
  version: number;
  rootId: string;
  sourceId: string;
  status: 'draft';
} {
  return {
    version: 1,
    rootId: resolveRootId(source),
    sourceId: source.id,
    status: 'draft',
  };
}

export function buildNewVersionFields(
  source: Pick<FrameworkEntityRecord, 'id' | 'rootId' | 'version'>,
  nextVersion?: number,
): {
  version: number;
  rootId: string;
  sourceId: string;
  status: 'draft';
} {
  return {
    version: nextVersion ?? source.version + 1,
    rootId: resolveRootId(source),
    sourceId: source.id,
    status: 'draft',
  };
}

export function buildSoftDeleteData(userId: string, at = new Date()): {
  deletedAt: Date;
  deletedBy: string;
} {
  return { deletedAt: at, deletedBy: userId };
}

export function buildArchiveData(): { status: 'archived' } {
  return { status: 'archived' };
}

export function assertNotDeleted(entity: Pick<FrameworkEntityRecord, 'deletedAt'>, label: string): void {
  if (entity.deletedAt) {
    throw new Error(`${label} is deleted`);
  }
}
