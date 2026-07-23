// ============================================================================
// Export dataset providers per HR module
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import type { ExportDataset } from '../domain/export.types';

export interface ExportBuildParams {
  companyId: string;
  filters?: Record<string, unknown>;
}

@Injectable()
export class EmployeeExportProvider {
  constructor(private readonly prisma: PrismaService) {}

  async build(actor: ActorContext, params: ExportBuildParams): Promise<ExportDataset> {
    const rows = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        assignments: {
          some: { companyId: params.companyId, effectiveTo: null, deletedAt: null },
        },
        ...(params.filters?.status
          ? { employmentStatus: String(params.filters.status) as 'active' }
          : {}),
      },
      include: {
        assignments: {
          where: { companyId: params.companyId, effectiveTo: null, deletedAt: null },
          take: 1,
          include: { team: true, company: true },
        },
        bankAccounts: { where: { deletedAt: null }, take: 1 },
      },
      orderBy: { globalId: 'asc' },
      take: 5000,
    });

    const headers = [
      'Employee Code', 'First Name', 'Last Name', 'Status', 'Team', 'Company',
      'Position', 'Department', 'Hire Date', 'Phone', 'Email',
      'Salary', 'Bank Name', 'Bank Account',
    ];

    const dataRows = rows.map((e) => {
      const a = e.assignments[0];
      const bank = e.bankAccounts[0];
      return [
        e.globalId,
        e.firstName,
        e.lastName,
        e.employmentStatus,
        a?.team?.name ?? '',
        a?.company?.name ?? '',
        e.position ?? '',
        e.department ?? '',
        e.hireDate?.toISOString().slice(0, 10) ?? '',
        e.phone ?? '',
        e.email ?? '',
        '',
        bank?.bankCode ?? '',
        bank?.accountNo ?? '',
      ];
    });

    return {
      title: 'WorkHQ Employees Export',
      worksheetName: 'Employees',
      headers,
      rows: dataRows,
      sensitive: true,
      filtersSummary: params.filters ? JSON.stringify(params.filters) : undefined,
      generatedBy: actor.userId,
    };
  }
}

@Injectable()
export class AuditExportProvider {
  constructor(private readonly prisma: PrismaService) {}

  async build(_actor: ActorContext, params: ExportBuildParams): Promise<ExportDataset> {
    const logs = await this.prisma.auditLog.findMany({
      where: { companyId: params.companyId },
      orderBy: { occurredAt: 'desc' },
      take: 2000,
    });

    return {
      title: 'WorkHQ Audit Log Export',
      worksheetName: 'Audit',
      headers: ['Occurred At', 'Entity Type', 'Entity ID', 'Action', 'Actor User ID'],
      rows: logs.map((l) => [
        l.occurredAt.toISOString(),
        l.entityType,
        l.entityId ?? '',
        l.action,
        l.actorUserId ?? '',
      ]),
      sensitive: true,
    };
  }
}

@Injectable()
export class LeaveExportProvider {
  constructor(private readonly prisma: PrismaService) {}

  async build(_actor: ActorContext, params: ExportBuildParams): Promise<ExportDataset> {
    const rows = await this.prisma.leaveRequest.findMany({
      where: { companyId: params.companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      include: { employee: { select: { globalId: true, firstName: true, lastName: true } } },
    });

    return {
      title: 'WorkHQ Leave Export',
      worksheetName: 'Leave',
      headers: ['Employee Code', 'Name', 'Start', 'End', 'Status', 'Days'],
      rows: rows.map((r) => [
        r.employee.globalId,
        `${r.employee.firstName} ${r.employee.lastName}`,
        r.startDate.toISOString().slice(0, 10),
        r.endDate.toISOString().slice(0, 10),
        r.status,
        r.days?.toString() ?? '',
      ]),
    };
  }
}

@Injectable()
export class ExportDatasetRegistry {
  constructor(
    private readonly employees: EmployeeExportProvider,
    private readonly audit: AuditExportProvider,
    private readonly leave: LeaveExportProvider,
  ) {}

  async build(
    module: string,
    actor: ActorContext,
    params: ExportBuildParams,
  ): Promise<ExportDataset> {
    switch (module) {
      case 'employees':
        return this.employees.build(actor, params);
      case 'audit_logs':
        return this.audit.build(actor, params);
      case 'leave':
        return this.leave.build(actor, params);
      default:
        return {
          title: `WorkHQ ${module} Export`,
          worksheetName: module.replace(/_/g, ' ').slice(0, 31),
          headers: ['Module', 'Note'],
          rows: [[module, 'Export provider stub — extend ExportDatasetRegistry']],
        };
    }
  }
}
