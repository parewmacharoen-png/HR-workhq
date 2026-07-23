import { Injectable } from '@nestjs/common';
import { AttendanceService } from '../../attendance/application/attendance.service';
import { EmployeeAccessService } from './employee-access.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeAttendanceViewDto } from './dto/employee-attendance.dto';

@Injectable()
export class EmployeeAttendanceService {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  async getAttendance(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeeAttendanceViewDto> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    return this.attendanceService.getEmployeeAttendanceView(actor, employeeId, companyId);
  }
}
