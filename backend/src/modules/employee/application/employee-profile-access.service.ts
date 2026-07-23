// ============================================================================
// EMP-015 — Employee profile edit access rules
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { ForbiddenError } from '../../../shared/kernel/domain-error';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { EmployeeAccessService } from './employee-access.service';

@Injectable()
export class EmployeeProfileAccessService {
  constructor(
    private readonly employeeAccess: EmployeeAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertOwnerOrSecretary(actor: ActorContext, employeeId: string): Promise<string> {
    const companyId = await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? 'employee';
    if (role === 'owner' || role === 'secretary') {
      await this.employeeAccess.assertEmployeeWritable(actor, employeeId, companyId);
      return companyId;
    }
    throw new ForbiddenError('เฉพาะ Owner หรือ Secretary เท่านั้นที่แก้ไขข้อมูลพนักงานได้');
  }

  async assertOwner(actor: ActorContext): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.businessRole !== 'owner') {
      throw new ForbiddenError('ต้องเป็น Owner');
    }
  }

  async assertPayrollEdit(actor: ActorContext, employeeId: string): Promise<string> {
    const companyId = await this.assertOwnerOrSecretary(actor, employeeId);
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? 'employee';
    if (role === 'owner') return companyId;
    // Secretary with employee:write can manage deposit settings (multi-company legacy).
    if (role === 'secretary') return companyId;
    const hasPayroll = access?.overrides.some(
      (o) => o.permission === 'payroll:write' && o.effect === 'allow',
    );
    if (!hasPayroll) {
      throw new ForbiddenError('ไม่มีสิทธิ์แก้ไขเงินประกัน / เงินเดือน');
    }
    return companyId;
  }

  async canEditProfile(actor: ActorContext): Promise<boolean> {
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? 'employee';
    return role === 'owner' || role === 'secretary';
  }
}
