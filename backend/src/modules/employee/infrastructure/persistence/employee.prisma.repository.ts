// ============================================================================
// modules/employee/infrastructure/persistence/employee.prisma.repository.ts
// Adapters for Employee + EmployeeAssignment, plus a DB-backed global-id
// sequence using a dedicated counter row in system_settings (atomic upsert).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { Employee } from '../../domain/entities/employee.entity';
import { EmployeeAssignment } from '../../domain/entities/employee-assignment.entity';
import { EmployeeGlobalId } from '../../domain/value-objects/employee-global-id.vo';
import {
  EmployeeRepository, AssignmentRepository,
} from '../../domain/repositories/employee.repository';
import { GlobalIdSequence } from '../../domain/services/global-id.service';

@Injectable()
export class PrismaEmployeeRepository implements EmployeeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Employee | null> {
    const row = await this.prisma.employee.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async findByGlobalId(globalId: string): Promise<Employee | null> {
    const row = await this.prisma.employee.findFirst({ where: { globalId, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async existsGlobalId(globalId: string): Promise<boolean> {
    const count = await this.prisma.employee.count({ where: { globalId, deletedAt: null } });
    return count > 0;
  }

  async save(employee: Employee, actorUserId: string): Promise<void> {
    const p = employee.toPersistence();
    await this.prisma.employee.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        globalId: p.globalId,
        firstName: p.firstName,
        lastName: p.lastName,
        nickname: p.nickname,
        nationalId: p.nationalId,
        phone: p.phone,
        email: p.email,
        department: p.department,
        position: p.position,
        employmentType: p.employmentType,
        dateOfBirth: p.dateOfBirth,
        hireDate: p.hireDate,
        probationEndDate: p.probationEndDate,
        terminationDate: p.terminationDate,
        employmentStatus: p.employmentStatus,
        workCategory: p.workCategory,
        rehireOfEmployeeId: p.rehireOfEmployeeId,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        firstName: p.firstName,
        lastName: p.lastName,
        nickname: p.nickname,
        nationalId: p.nationalId,
        phone: p.phone,
        email: p.email,
        department: p.department,
        position: p.position,
        employmentType: p.employmentType,
        dateOfBirth: p.dateOfBirth,
        probationEndDate: p.probationEndDate,
        terminationDate: p.terminationDate,
        employmentStatus: p.employmentStatus,
        workCategory: p.workCategory,
        updatedBy: actorUserId,
      },
    });
  }

  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorUserId },
    });
  }

  private toDomain(row: any): Employee {
    return Employee.rehydrate({
      id: row.id,
      globalId: EmployeeGlobalId.fromString(row.globalId),
      firstName: row.firstName,
      lastName: row.lastName,
      nickname: row.nickname,
      nationalId: row.nationalId,
      phone: row.phone,
      email: row.email,
      department: row.department,
      position: row.position,
      employmentType: row.employmentType,
      dateOfBirth: row.dateOfBirth,
      hireDate: row.hireDate,
      probationEndDate: row.probationEndDate,
      terminationDate: row.terminationDate,
      employmentStatus: row.employmentStatus,
      workCategory: row.workCategory ?? 'office',
      rehireOfEmployeeId: row.rehireOfEmployeeId,
      deletedAt: row.deletedAt,
    });
  }
}

@Injectable()
export class PrismaAssignmentRepository implements AssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<EmployeeAssignment | null> {
    const row = await this.prisma.employeeAssignment.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async listByEmployee(employeeId: string): Promise<EmployeeAssignment[]> {
    const rows = await this.prisma.employeeAssignment.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findCurrentForCompany(employeeId: string, companyId: string): Promise<EmployeeAssignment[]> {
    const rows = await this.prisma.employeeAssignment.findMany({
      where: { employeeId, companyId, effectiveTo: null, deletedAt: null },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findCurrentPrimaryCompany(employeeId: string): Promise<EmployeeAssignment | null> {
    const row = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, isPrimaryCompany: true, effectiveTo: null, deletedAt: null },
    });
    return row ? this.toDomain(row) : null;
  }

  async save(assignment: EmployeeAssignment, actorUserId: string): Promise<void> {
    const p = assignment.toPersistence();
    await this.prisma.employeeAssignment.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        employeeId: p.employeeId,
        companyId: p.companyId,
        teamId: p.teamId,
        functionId: p.functionId,
        roleLevel: p.roleLevel,
        isPrimaryCompany: p.isPrimaryCompany,
        isPrimaryTeam: p.isPrimaryTeam,
        effectiveFrom: p.effectiveFrom,
        effectiveTo: p.effectiveTo,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        teamId: p.teamId,
        functionId: p.functionId,
        roleLevel: p.roleLevel,
        isPrimaryCompany: p.isPrimaryCompany,
        isPrimaryTeam: p.isPrimaryTeam,
        effectiveTo: p.effectiveTo,
        updatedBy: actorUserId,
      },
    });
  }

  private toDomain(row: any): EmployeeAssignment {
    return EmployeeAssignment.rehydrate({
      id: row.id,
      employeeId: row.employeeId,
      companyId: row.companyId,
      teamId: row.teamId,
      functionId: row.functionId,
      roleLevel: row.roleLevel,
      isPrimaryCompany: row.isPrimaryCompany,
      isPrimaryTeam: row.isPrimaryTeam,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      deletedAt: row.deletedAt,
    });
  }
}

/**
 * Global-id sequence backed by a single counter row. Uses an atomic
 * read-modify-write inside a transaction with row locking to avoid gaps/dupes.
 */
@Injectable()
export class PrismaGlobalIdSequence implements GlobalIdSequence {
  private static readonly KEY = 'employee.global_id_counter';

  constructor(private readonly prisma: PrismaService) {}

  async next(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      // SELECT ... FOR UPDATE on the counter row (raw, since it's a settings row)
      const rows = await tx.$queryRawUnsafe<{ value: unknown }[]>(
        `SELECT value FROM system.system_settings
         WHERE company_id IS NULL AND key = $1 FOR UPDATE`,
        PrismaGlobalIdSequence.KEY,
      );

      let current = 0;
      if (rows.length > 0) {
        const v = rows[0].value as { n?: number } | number | null;
        current = typeof v === 'number' ? v : (v?.n ?? 0);
      }
      const next = current + 1;

      await tx.$executeRawUnsafe(
        `INSERT INTO system.system_settings (id, company_id, key, value, created_at, updated_at)
         VALUES (gen_random_uuid(), NULL, $1, jsonb_build_object('n', $2::int), now(), now())
         ON CONFLICT (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key)
         DO UPDATE SET value = jsonb_build_object('n', $2::int), updated_at = now()`,
        PrismaGlobalIdSequence.KEY,
        next,
      );

      return next;
    });
  }
}
