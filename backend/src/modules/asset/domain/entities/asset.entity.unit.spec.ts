// ============================================================================
// modules/asset/domain/entities/asset.entity.unit.spec.ts
// ============================================================================

import { Asset } from './asset.entity';
import {
  AssetAlreadyRetiredError,
  AssetNotAssignedError,
  AssetNotAvailableError,
} from '../errors/asset.errors';

describe('Asset entity', () => {
  const base = {
    id: 'asset-1',
    companyId: 'co-1',
    assetTag: 'NB-001',
    name: 'MacBook Pro',
    category: 'notebook',
  };

  it('creates an available asset', () => {
    const asset = Asset.create(base);
    expect(asset.status).toBe('available');
  });

  it('transitions to assigned then returned', () => {
    const asset = Asset.create(base);
    asset.markAssigned();
    expect(asset.status).toBe('assigned');
    asset.markReturned();
    expect(asset.status).toBe('available');
  });

  it('rejects assign when not available', () => {
    const asset = Asset.create(base);
    asset.markAssigned();
    expect(() => asset.markAssigned()).toThrow(AssetNotAvailableError);
  });

  it('rejects return when not assigned', () => {
    const asset = Asset.create(base);
    expect(() => asset.markReturned()).toThrow(AssetNotAssignedError);
  });

  it('blocks updates after retire', () => {
    const asset = Asset.create(base);
    asset.retire();
    expect(() => asset.update({ name: 'X' })).toThrow(AssetAlreadyRetiredError);
  });
});
