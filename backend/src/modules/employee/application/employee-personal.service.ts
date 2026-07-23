import { Injectable } from '@nestjs/common';
import { EmployeeChangeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeNotFoundError } from '../domain/errors/employee.errors';
import { EmployeeProfileAccessService } from './employee-profile-access.service';
import { EmployeeAccessService } from './employee-access.service';
import { PermissionService } from '../../permission/application/permission.service';
import { UpdateEmployeePersonalDto } from './dto/employee-personal.dto';
import { maskNationalId, maskOrReveal, maskSensitiveValue } from './employee-sensitive-fields';

const THAI_PHONE = /^0[0-9]{8,9}$/;

@Injectable()
export class EmployeePersonalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: EmployeeProfileAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly permissions: PermissionService,
  ) {}

  async canViewSensitive(actor: ActorContext): Promise<boolean> {
    const effective = await this.permissions.getEffectivePermissions(actor.userId);
    return effective.includes('employee:sensitive:read');
  }

  async getPersonal(actor: ActorContext, employeeId: string) {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const canViewSensitive = await this.canViewSensitive(actor);

    const row = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      include: {
        educationRecords: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }],
        },
        workExperiences: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }],
        },
        documents: {
          where: {
            deletedAt: null,
            docType: { in: ['national_id', 'passport'] },
          },
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });
    if (!row) throw new EmployeeNotFoundError(employeeId);

    const idCardDoc = row.documents.find((d) => d.docType === 'national_id') ?? null;
    const passportDoc = row.documents.find((d) => d.docType === 'passport') ?? null;

    return {
      personalInformation: {
        firstName: row.firstName,
        lastName: row.lastName,
        nickname: row.nickname,
        gender: row.gender,
        dateOfBirth: row.dateOfBirth?.toISOString().slice(0, 10) ?? null,
        nationality: row.nationality,
        religion: row.religion,
        maritalStatus: row.maritalStatus,
      },
      contactInformation: {
        phone: row.phone,
        email: row.email,
        address: row.address,
      },
      governmentInformation: {
        nationalId: maskOrReveal(row.nationalId, canViewSensitive, maskNationalId),
        socialSecurityNumber: maskOrReveal(
          row.socialSecurityNumber,
          canViewSensitive,
          (v) => maskSensitiveValue(v, 0, 4),
        ),
        passportNumber: maskOrReveal(row.passportNumber, canViewSensitive, (v) => maskSensitiveValue(v, 2, 3)),
        isMasked: !canViewSensitive,
      },
      identityDocuments: {
        idCard: idCardDoc ? this.mapIdentityDocument(idCardDoc) : null,
        passport: passportDoc ? this.mapIdentityDocument(passportDoc) : null,
      },
      emergencyContact: {
        name: row.emergencyContactName,
        relationship: row.emergencyContactRelationship,
        phone: row.emergencyContactPhone,
      },
      education: row.educationRecords.map((item) => this.mapEducation(item)),
      workExperience: row.workExperiences.map((item) => this.mapWorkExperience(item)),
    };
  }

  async updatePersonal(actor: ActorContext, employeeId: string, dto: UpdateEmployeePersonalDto) {
    const companyId = await this.access.assertOwnerOrSecretary(actor, employeeId);
    const before = await this.prisma.employee.findFirstOrThrow({ where: { id: employeeId } });

    if (dto.phone && !THAI_PHONE.test(dto.phone.replace(/\s/g, ''))) {
      throw new Error('Invalid Thai phone format');
    }
    if (dto.emergencyContactPhone && !THAI_PHONE.test(dto.emergencyContactPhone.replace(/\s/g, ''))) {
      throw new Error('Invalid emergency phone format');
    }
    if (dto.dateOfBirth && new Date(dto.dateOfBirth) > new Date()) {
      throw new Error('Date of birth cannot be in the future');
    }

    const update: Prisma.EmployeeUpdateInput = { updatedBy: actor.userId };
    if (dto.firstName !== undefined) update.firstName = dto.firstName;
    if (dto.lastName !== undefined) update.lastName = dto.lastName;
    if (dto.nickname !== undefined) update.nickname = dto.nickname;
    if (dto.dateOfBirth !== undefined) {
      update.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    if (dto.gender !== undefined) update.gender = dto.gender;
    if (dto.nationality !== undefined) update.nationality = dto.nationality;
    if (dto.religion !== undefined) update.religion = dto.religion;
    if (dto.maritalStatus !== undefined) update.maritalStatus = dto.maritalStatus;
    if (dto.phone !== undefined) update.phone = dto.phone;
    if (dto.email !== undefined) update.email = dto.email;
    if (dto.address !== undefined) update.address = dto.address;
    if (dto.nationalId !== undefined) update.nationalId = dto.nationalId || null;
    if (dto.socialSecurityNumber !== undefined) update.socialSecurityNumber = dto.socialSecurityNumber || null;
    if (dto.passportNumber !== undefined) update.passportNumber = dto.passportNumber || null;
    if (dto.emergencyContactName !== undefined) update.emergencyContactName = dto.emergencyContactName;
    if (dto.emergencyContactRelationship !== undefined) {
      update.emergencyContactRelationship = dto.emergencyContactRelationship;
    }
    if (dto.emergencyContactPhone !== undefined) update.emergencyContactPhone = dto.emergencyContactPhone;

    const after = await this.prisma.employee.update({ where: { id: employeeId }, data: update });
    await this.recordPersonalChanges(actor, employeeId, companyId, before, after, dto.reason);
    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_personal_updated',
      before: this.personalSnapshot(before),
      after: this.personalSnapshot(after),
    });
    return this.getPersonal(actor, employeeId);
  }

  private mapIdentityDocument(doc: {
    id: string;
    fileName: string;
    mimeType: string | null;
    uploadedAt: Date;
    currentVersion: number;
  }) {
    return {
      id: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      uploadedAt: doc.uploadedAt.toISOString(),
      currentVersion: doc.currentVersion,
    };
  }

  private mapEducation(item: {
    id: string;
    institution: string;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: Date | null;
    endDate: Date | null;
    isCurrent: boolean;
    description: string | null;
    sortOrder: number;
  }) {
    return {
      id: item.id,
      institution: item.institution,
      degree: item.degree,
      fieldOfStudy: item.fieldOfStudy,
      startDate: item.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: item.endDate?.toISOString().slice(0, 10) ?? null,
      isCurrent: item.isCurrent,
      description: item.description,
      sortOrder: item.sortOrder,
    };
  }

  private mapWorkExperience(item: {
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
      id: item.id,
      companyName: item.companyName,
      jobTitle: item.jobTitle,
      location: item.location,
      startDate: item.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: item.endDate?.toISOString().slice(0, 10) ?? null,
      isCurrent: item.isCurrent,
      description: item.description,
      sortOrder: item.sortOrder,
    };
  }

  private personalSnapshot(row: {
    firstName: string;
    lastName: string;
    nickname: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    nationality: string | null;
    religion: string | null;
    maritalStatus: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    nationalId: string | null;
    socialSecurityNumber: string | null;
    passportNumber: string | null;
    emergencyContactName: string | null;
    emergencyContactRelationship: string | null;
    emergencyContactPhone: string | null;
  }) {
    return {
      firstName: row.firstName,
      lastName: row.lastName,
      nickname: row.nickname,
      dateOfBirth: row.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      gender: row.gender,
      nationality: row.nationality,
      religion: row.religion,
      maritalStatus: row.maritalStatus,
      phone: row.phone,
      email: row.email,
      address: row.address,
      nationalId: row.nationalId ? maskNationalId(row.nationalId) : null,
      socialSecurityNumber: row.socialSecurityNumber ? maskSensitiveValue(row.socialSecurityNumber) : null,
      passportNumber: row.passportNumber ? maskSensitiveValue(row.passportNumber, 2, 3) : null,
      emergencyContactName: row.emergencyContactName,
      emergencyContactRelationship: row.emergencyContactRelationship,
      emergencyContactPhone: row.emergencyContactPhone,
    };
  }

  private async recordPersonalChanges(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    reason?: string,
  ) {
    const fields = [
      'firstName', 'lastName', 'nickname', 'dateOfBirth', 'gender',
      'nationality', 'religion', 'maritalStatus',
      'phone', 'email', 'address', 'nationalId',
      'socialSecurityNumber', 'passportNumber',
      'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone',
    ] as const;

    for (const field of fields) {
      const b = before[field];
      const a = after[field];
      const bNorm = b instanceof Date ? b.toISOString().slice(0, 10) : b;
      const aNorm = a instanceof Date ? a.toISOString().slice(0, 10) : a;
      if (JSON.stringify(bNorm) === JSON.stringify(aNorm)) continue;
      await this.prisma.employeeChangeHistory.create({
        data: {
          employeeId,
          companyId,
          changeType: 'profile' satisfies EmployeeChangeType,
          fieldName: field,
          beforeValueJson: bNorm == null ? undefined : (bNorm as Prisma.InputJsonValue),
          afterValueJson: aNorm == null ? undefined : (aNorm as Prisma.InputJsonValue),
          reason,
          changedBy: actor.userId,
          source: 'web',
        },
      });
    }
  }
}
