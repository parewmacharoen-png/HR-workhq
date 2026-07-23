import { Injectable } from '@nestjs/common';
import { EmployeeCommissionViewService } from '../../commission/application/employee-commission-view.service';
import { EmployeeAccessService } from './employee-access.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeCommissionViewDto } from './dto/employee-commission.dto';

@Injectable()
export class EmployeeCommissionService {
  constructor(
    private readonly commissionView: EmployeeCommissionViewService,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  async getCommission(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeeCommissionViewDto> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    return this.commissionView.getEmployeeCommissionView(actor, employeeId, companyId);
  }
}
