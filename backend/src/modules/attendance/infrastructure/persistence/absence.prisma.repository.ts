// ============================================================================
// modules/attendance/infrastructure/persistence/absence.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { AbsenceRecord, AbsenceRecordStatus, AbsenceRoleLevel } from '../../domain/entities/absence-record.entity';
import {
  AbsenceListFilter, AbsenceListRow, AbsenceRepository,
} from '../../domain/repositories/absence.repository';

@Injectable()
export class PrismaAbsenceRepository implements AbsenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<AbsenceRecord | null> {
    const row = await this.prisma.absenceRecord.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async findForEmployeeDate(
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<AbsenceRecord | null> {
    const row = await this.prisma.absenceRecord.findFirst({
      where: { employeeId, companyId, workDate, deletedAt: null },
    });
    return row ? this.toDomain(row) : null;
  }

  async list(filter: AbsenceListFilter): Promise<AbsenceListRow[]> {
    const rows = await this.prisma.absenceRecord.findMany({
      where: {
        companyId: filter.companyId,
        deletedAt: null,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
        ...(filter.from || filter.to ? {
          workDate: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        } : {}),
      },
      include: {
        employee: { select: { firstName: true, lastName: true, position: true } },
      },
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => ({
      record: this.toDomain(row),
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
      employeePosition: row.employee.position,
    }));
  }

  async save(record: AbsenceRecord): Promise<void> {
    const p = record.toPersistence();
    await this.prisma.absenceRecord.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        employeeId: p.employeeId,
        companyId: p.companyId,
        workDate: p.workDate,
        status: p.status,
        roleLevelSnapshot: p.roleLevelSnapshot,
        positionSnapshot: p.positionSnapshot,
        penaltyAmount: p.penaltyAmount != null ? new Prisma.Decimal(p.penaltyAmount) : null,
        contactAttemptedAt: p.contactAttemptedAt,
        contactNotes: p.contactNotes,
        approvedBy: p.approvedBy,
        approvedAt: p.approvedAt,
        waivedBy: p.waivedBy,
        waivedAt: p.waivedAt,
        waiveReason: p.waiveReason,
        disputeReason: p.disputeReason,
        disputedAt: p.disputedAt,
        resolvedBy: p.resolvedBy,
        resolvedAt: p.resolvedAt,
        payrollItemId: p.payrollItemId,
        flaggedReason: p.flaggedReason,
      },
      update: {
        status: p.status,
        roleLevelSnapshot: p.roleLevelSnapshot,
        positionSnapshot: p.positionSnapshot,
        penaltyAmount: p.penaltyAmount != null ? new Prisma.Decimal(p.penaltyAmount) : null,
        contactAttemptedAt: p.contactAttemptedAt,
        contactNotes: p.contactNotes,
        approvedBy: p.approvedBy,
        approvedAt: p.approvedAt,
        waivedBy: p.waivedBy,
        waivedAt: p.waivedAt,
        waiveReason: p.waiveReason,
        disputeReason: p.disputeReason,
        disputedAt: p.disputedAt,
        resolvedBy: p.resolvedBy,
        resolvedAt: p.resolvedAt,
        payrollItemId: p.payrollItemId,
        flaggedReason: p.flaggedReason,
      },
    });
  }

  private toDomain(row: {
    id: string;
    employeeId: string;
    companyId: string;
    workDate: Date;
    status: string;
    roleLevelSnapshot: string | null;
    positionSnapshot: string | null;
    penaltyAmount: Prisma.Decimal | null;
    contactAttemptedAt: Date | null;
    contactNotes: string | null;
    approvedBy: string | null;
    approvedAt: Date | null;
    waivedBy: string | null;
    waivedAt: Date | null;
    waiveReason: string | null;
    disputeReason: string | null;
    disputedAt: Date | null;
    resolvedBy: string | null;
    resolvedAt: Date | null;
    payrollItemId: string | null;
    flaggedReason: string;
    deletedAt: Date | null;
  }): AbsenceRecord {
    return AbsenceRecord.rehydrate({
      id: row.id,
      employeeId: row.employeeId,
      companyId: row.companyId,
      workDate: row.workDate,
      status: row.status as AbsenceRecordStatus,
      roleLevelSnapshot: row.roleLevelSnapshot as AbsenceRoleLevel | null,
      positionSnapshot: row.positionSnapshot,
      penaltyAmount: row.penaltyAmount != null ? Number(row.penaltyAmount) : null,
      contactAttemptedAt: row.contactAttemptedAt,
      contactNotes: row.contactNotes,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
      waivedBy: row.waivedBy,
      waivedAt: row.waivedAt,
      waiveReason: row.waiveReason,
      disputeReason: row.disputeReason,
      disputedAt: row.disputedAt,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt,
      payrollItemId: row.payrollItemId,
      flaggedReason: row.flaggedReason,
      deletedAt: row.deletedAt,
    });
  }
}
