// ============================================================================
// modules/employee/application/employee-home.service.ts
// PART F — Employee self-service home summary
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { DateProvider } from '../../../shared/time/date.provider';
import { EmployeeAccessService } from './employee-access.service';

export interface EmployeeHomeSummary {
  upcomingLeave: Array<{ id: string; startDate: string; endDate: string; days: number; leaveTypeName: string }>;
  pendingRequests: number;
  documentsNeedingAction: number;
  announcementsNeedingAcknowledgement: number;
}

@Injectable()
export class EmployeeHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dates: DateProvider,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  async getSummary(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeeHomeSummary> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, companyId);
    const today = this.dates.parseDate(this.dates.todayString());

    const upcomingLeave = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
        endDate: { gte: today },
      },
      include: { leaveType: { select: { name: true } } },
      orderBy: { startDate: 'asc' },
      take: 5,
    });

    const pendingRequests = await this.prisma.requestInstance.count({
      where: {
        requesterEmployeeId: employeeId,
        companyId,
        deletedAt: null,
        status: { in: ['submitted', 'in_review'] },
      },
    });

    const documentsNeedingAction = await this.prisma.employeeDocument.count({
      where: {
        employeeId,
        deletedAt: null,
        OR: [
          { acknowledgedAt: null },
          {
            expiresAt: {
              lte: this.dates.addDays(today, 30),
              gte: today,
            },
          },
        ],
      },
    });

    const announcementsNeedingAcknowledgement = await this.prisma.announcementDelivery.count({
      where: {
        employeeId,
        acknowledgedAt: null,
        announcement: {
          companyId,
          status: 'published',
          mustAcknowledge: true,
          deletedAt: null,
        },
      },
    });

    return {
      upcomingLeave: upcomingLeave.map((row) => ({
        id: row.id,
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10),
        days: Number(row.days),
        leaveTypeName: row.leaveType.name,
      })),
      pendingRequests,
      documentsNeedingAction,
      announcementsNeedingAcknowledgement,
    };
  }
}
