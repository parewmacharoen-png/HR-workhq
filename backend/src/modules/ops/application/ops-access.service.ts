// ============================================================================
// modules/ops/application/ops-access.service.ts
// OPS-001 — Owner-only operations console
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { ActorContext } from '../../../shared/kernel/actor-context';

@Injectable()
export class OpsAccessService {
  constructor(
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertOwner(actor: ActorContext): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.businessRole !== 'owner') {
      throw new Error('Owner access required');
    }
  }
}
