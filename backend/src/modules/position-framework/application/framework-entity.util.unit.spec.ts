import {
  buildArchiveData,
  buildCloneVersionFields,
  buildNewVersionFields,
  buildSoftDeleteData,
  resolveRootId,
} from './framework-entity.util';

describe('framework-entity.util', () => {
  const source = {
    id: 'entity-1',
    version: 2,
    rootId: 'root-1' as string | null,
    sourceId: 'entity-0' as string | null,
    status: 'active' as const,
  };

  describe('resolveRootId', () => {
    it('returns rootId when set', () => {
      expect(resolveRootId(source)).toBe('root-1');
    });

    it('falls back to entity id when rootId is null', () => {
      expect(resolveRootId({ id: 'entity-1', rootId: null })).toBe('entity-1');
    });
  });

  describe('buildCloneVersionFields', () => {
    it('resets version to 1 and links to source', () => {
      expect(buildCloneVersionFields(source)).toEqual({
        version: 1,
        rootId: 'root-1',
        sourceId: 'entity-1',
        status: 'draft',
      });
    });

    it('uses entity id as root when rootId is null', () => {
      const rootless = { id: 'entity-9', rootId: null };
      expect(buildCloneVersionFields(rootless)).toEqual({
        version: 1,
        rootId: 'entity-9',
        sourceId: 'entity-9',
        status: 'draft',
      });
    });
  });

  describe('buildNewVersionFields', () => {
    it('increments version by default', () => {
      expect(buildNewVersionFields(source)).toEqual({
        version: 3,
        rootId: 'root-1',
        sourceId: 'entity-1',
        status: 'draft',
      });
    });

    it('accepts explicit next version', () => {
      expect(buildNewVersionFields(source, 5)).toEqual({
        version: 5,
        rootId: 'root-1',
        sourceId: 'entity-1',
        status: 'draft',
      });
    });
  });

  describe('buildSoftDeleteData', () => {
    it('sets deletedAt and deletedBy', () => {
      const at = new Date('2026-06-23T00:00:00.000Z');
      expect(buildSoftDeleteData('user-1', at)).toEqual({
        deletedAt: at,
        deletedBy: 'user-1',
      });
    });
  });

  describe('buildArchiveData', () => {
    it('sets status to archived', () => {
      expect(buildArchiveData()).toEqual({ status: 'archived' });
    });
  });
});
