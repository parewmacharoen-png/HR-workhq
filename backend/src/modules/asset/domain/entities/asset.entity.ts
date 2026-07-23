// ============================================================================
// modules/asset/domain/entities/asset.entity.ts
// ============================================================================

import { AssetStatus } from '@prisma/client';
import {
  AssetAlreadyRetiredError,
  AssetNotAssignedError,
  AssetNotAvailableError,
} from '../errors/asset.errors';

export interface AssetProps {
  id: string;
  companyId: string;
  assetTag: string;
  name: string;
  category: string | null;
  status: AssetStatus;
  purchaseDate: Date | null;
  value: number | null;
  deletedAt: Date | null;
}

export class Asset {
  private constructor(private props: AssetProps) {}

  static rehydrate(props: AssetProps): Asset {
    return new Asset(props);
  }

  static create(input: {
    id: string;
    companyId: string;
    assetTag: string;
    name: string;
    category?: string | null;
    purchaseDate?: Date | null;
    value?: number | null;
  }): Asset {
    const tag = input.assetTag.trim();
    const name = input.name.trim();
    if (!tag) throw new Error('Asset tag is required');
    if (!name) throw new Error('Asset name is required');

    return new Asset({
      id: input.id,
      companyId: input.companyId,
      assetTag: tag,
      name,
      category: input.category ?? null,
      status: 'available',
      purchaseDate: input.purchaseDate ?? null,
      value: input.value ?? null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get companyId(): string { return this.props.companyId; }
  get status(): AssetStatus { return this.props.status; }

  update(input: {
    name?: string;
    category?: string | null;
    purchaseDate?: Date | null;
    value?: number | null;
  }): void {
    this.assertNotRetired();
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error('Asset name is required');
      this.props.name = name;
    }
    if (input.category !== undefined) this.props.category = input.category;
    if (input.purchaseDate !== undefined) this.props.purchaseDate = input.purchaseDate;
    if (input.value !== undefined) this.props.value = input.value;
  }

  markAssigned(): void {
    this.assertNotRetired();
    if (this.props.status !== 'available') {
      throw new AssetNotAvailableError(this.props.id);
    }
    this.props.status = 'assigned';
  }

  markReturned(): void {
    this.assertNotRetired();
    if (this.props.status !== 'assigned') {
      throw new AssetNotAssignedError(this.props.id);
    }
    this.props.status = 'available';
  }

  setStatus(status: AssetStatus): void {
    if (this.props.status === 'retired' && status !== 'retired') {
      throw new AssetAlreadyRetiredError();
    }
    this.props.status = status;
  }

  retire(): void {
    this.props.status = 'retired';
  }

  toPersistence(): AssetProps {
    return { ...this.props };
  }

  private assertNotRetired(): void {
    if (this.props.status === 'retired') throw new AssetAlreadyRetiredError();
  }
}
