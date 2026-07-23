import { Injectable } from '@nestjs/common';
import { EmployeePerformanceViewService } from '../../performance-review/application/employee-performance-view.service';
import { EmployeeAccessService } from './employee-access.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeePerformanceViewDto } from './dto/employee-performance.dto';

@Injectable()
export class EmployeePerformanceService {
  constructor(
    private readonly performanceView: EmployeePerformanceViewService,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  async getPerformance(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeePerformanceViewDto> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    return this.performanceView.getEmployeePerformanceView(actor, employeeId, companyId);
  }
}
