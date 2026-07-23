// ============================================================================
// modules/exit/application/final-settlement-access.service.ts
// PAY-005 — role-based final settlement access.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { FinalSettlementForbiddenError } from '../domain/errors/final-settlement.errors';
import type { FinalSettlementStatus } from './dto/final-settlement.dto';

@Injectable()
export class FinalSettlementAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertCanRead(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    status: FinalSettlementStatus,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === employeeId) {
      if (status === 'paid') return;
      throw new FinalSettlementForbiddenError('Employees may only view paid final settlements');
    }

    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = access?.businessRole ?? null;
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new FinalSettlementForbiddenError();
  }

  async assertCanCreateOrEdit(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new FinalSettlementForbiddenError('Only Owner or Secretary may create or edit final settlements');
  }

  async assertCanSubmit(actor: ActorContext, companyId: string): Promise<void> {
    await this.assertCanCreateOrEdit(actor, companyId);
  }

  async assertCanApprove(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner') return;
    throw new FinalSettlementForbiddenError('Only Owner may approve final settlements');
  }

  async assertCanMarkPaid(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new FinalSettlementForbiddenError('Only Owner or Secretary may mark final settlements as paid');
  }

  async assertCanCancel(actor: ActorContext, companyId: string): Promise<void> {
    await this.assertCanCreateOrEdit(actor, companyId);
  }

  async assertEmployeePaidSummary(actor: ActorContext, employeeId: string): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId !== employeeId) {
      throw new FinalSettlementForbiddenError('Employees may only view their own paid settlement summary');
    }
  }

  private async actorRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }
}
