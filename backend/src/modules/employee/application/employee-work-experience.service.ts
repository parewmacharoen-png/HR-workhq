import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeNotFoundError } from '../domain/errors/employee.errors';
import { EmployeeProfileAccessService } from './employee-profile-access.service';
import { EmployeeAccessService } from './employee-access.service';
import {
  CreateEmployeeWorkExperienceDto,
  UpdateEmployeeWorkExperienceDto,
} from './dto/employee-personal.dto';

@Injectable()
export class EmployeeWorkExperienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: EmployeeProfileAccessService,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  async list(actor: ActorContext, employeeId: string) {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const rows = await this.prisma.employeeWorkExperience.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }],
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(actor: ActorContext, employeeId: string, dto: CreateEmployeeWorkExperienceDto) {
    const companyId = await this.access.assertOwnerOrSecretary(actor, employeeId);
    await this.assertEmployeeExists(employeeId);

    const row = await this.prisma.employeeWorkExperience.create({
      data: {
        employeeId,
        companyName: dto.companyName,
        jobTitle: dto.jobTitle,
        location: dto.location ?? null,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isCurrent: dto.isCurrent ?? false,
        description: dto.description ?? null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.recordChange(actor, employeeId, companyId, 'experience', row.id, null, this.toDto(row));
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_work_experience_created',
      after: this.toDto(row),
    });
    return this.toDto(row);
  }

  async update(
    actor: ActorContext,
    employeeId: string,
    experienceId: string,
    dto: UpdateEmployeeWorkExperienceDto,
  ) {
    const companyId = await this.access.assertOwnerOrSecretary(actor, employeeId);
    const before = await this.findOwned(employeeId, experienceId);

    const update: Prisma.EmployeeWorkExperienceUpdateInput = { updatedBy: actor.userId };
    if (dto.companyName !== undefined) update.companyName = dto.companyName;
    if (dto.jobTitle !== undefined) update.jobTitle = dto.jobTitle;
    if (dto.location !== undefined) update.location = dto.location;
    if (dto.startDate !== undefined) update.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) update.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.isCurrent !== undefined) update.isCurrent = dto.isCurrent;
    if (dto.description !== undefined) update.description = dto.description;

    const after = await this.prisma.employeeWorkExperience.update({
      where: { id: experienceId },
      data: update,
    });

    await this.recordChange(
      actor,
      employeeId,
      companyId,
      'experience',
      experienceId,
      this.toDto(before),
      this.toDto(after),
    );
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_work_experience_updated',
      before: this.toDto(before),
      after: this.toDto(after),
    });
    return this.toDto(after);
  }

  async remove(actor: ActorContext, employeeId: string, experienceId: string) {
    const companyId = await this.access.assertOwnerOrSecretary(actor, employeeId);
    const before = await this.findOwned(employeeId, experienceId);

    await this.prisma.employeeWorkExperience.update({
      where: { id: experienceId },
      data: { deletedAt: new Date(), deletedBy: actor.userId, updatedBy: actor.userId },
    });

    await this.recordChange(
      actor,
      employeeId,
      companyId,
      'experience',
      experienceId,
      this.toDto(before),
      null,
    );
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_work_experience_deleted',
      before: this.toDto(before),
    });
    return { ok: true, id: experienceId };
  }

  private async assertEmployeeExists(employeeId: string) {
    const row = await this.prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null } });
    if (!row) throw new EmployeeNotFoundError(employeeId);
  }

  private async findOwned(employeeId: string, experienceId: string) {
    const row = await this.prisma.employeeWorkExperience.findFirst({
      where: { id: experienceId, employeeId, deletedAt: null },
    });
    if (!row) throw new Error('Work experience record not found');
    return row;
  }

  private toDto(row: {
    id: string;
    companyName: string;
    jobTitle: string;
    location: string | null;
    startDate: Date | null;
    endDate: Date | null;
    isCurrent: boolean;
    description: string | null;
    sortOrder: number;
  }) {
    return {
      id: row.id,
      companyName: row.companyName,
      jobTitle: row.jobTitle,
      location: row.location,
      startDate: row.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
      isCurrent: row.isCurrent,
      description: row.description,
      sortOrder: row.sortOrder,
    };
  }

  private async recordChange(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    changeType: 'education' | 'experience',
    recordId: string,
    before: unknown,
    after: unknown,
  ) {
    await this.prisma.employeeChangeHistory.create({
      data: {
        employeeId,
        companyId,
        changeType,
        fieldName: recordId,
        beforeValueJson: before == null ? undefined : (before as Prisma.InputJsonValue),
        afterValueJson: after == null ? undefined : (after as Prisma.InputJsonValue),
        changedBy: actor.userId,
        source: 'web',
      },
    });
  }
}
