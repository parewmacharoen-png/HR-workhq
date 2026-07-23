import { Injectable } from '@nestjs/common';
import { EmployeeChangeType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { PermissionService } from '../../permission/application/permission.service';
import { EmployeeAccessService } from './employee-access.service';
import {
  maskNationalId,
  maskOrReveal,
  maskSensitiveValue,
} from './employee-sensitive-fields';
import {
  EmployeeTimelineCategory,
  EmployeeTimelineEventKey,
  EmployeeTimelineItemDto,
  EmployeeTimelineResponseDto,
} from './dto/employee-timeline.dto';
import { ONBOARDING_TIMELINE_EVENTS } from '../../employee-onboarding/domain/employee-onboarding.constants';

const SKIP_AUDIT_ACTIONS = new Set([
  'employee_personal_updated',
  'employee_employment_updated',
  'employee_profile_updated',
]);

const SENSITIVE_FIELDS = new Set([
  'nationalId',
  'socialSecurityNumber',
  'passportNumber',
  'taxId',
  'bankAccountNumber',
  'bankName',
  'bankAccountHolder',
  'salaryAmount',
  'monthlySalary',
]);

const SALARY_AUDIT_ACTIONS = new Set([
  'employee_salary_updated',
  'salary_direct_edit',
  'employee_payroll_updated',
  'employee_payroll_info_updated',
]);

const FIELD_LABELS: Record<string, string> = {
  firstName: 'ชื่อ',
  lastName: 'นามสกุล',
  nickname: 'ชื่อเล่น',
  phone: 'เบอร์โทร',
  email: 'อีเมล',
  address: 'ที่อยู่',
  gender: 'เพศ',
  nationality: 'สัญชาติ',
  religion: 'ศาสนา',
  maritalStatus: 'สถานภาพสมรส',
  dateOfBirth: 'วันเกิด',
  nationalId: 'เลขบัตรประชาชน',
  socialSecurityNumber: 'ประกันสังคม',
  passportNumber: 'เลขหนังสือเดินทาง',
  department: 'แผนก',
  position: 'ตำแหน่ง',
  employmentType: 'ประเภทการจ้าง',
  employmentStatus: 'สถานะการจ้าง',
  joinDate: 'วันเริ่มงาน',
  probationEndDate: 'วันสิ้นสุดทดลองงาน',
  resignDate: 'วันลาออก',
  workLocation: 'สถานที่ทำงาน',
  companyId: 'บริษัท',
  teamId: 'ทีม',
  supervisorId: 'ผู้บังคับบัญชา',
  shift: 'กะงาน',
};

const CATEGORY_META: Record<EmployeeTimelineCategory, { icon: string; color: string }> = {
  PERSONAL: { icon: 'user', color: 'blue' },
  EMPLOYMENT: { icon: 'briefcase', color: 'purple' },
  DOCUMENT: { icon: 'file', color: 'teal' },
  EDUCATION: { icon: 'book', color: 'green' },
  WORK_EXPERIENCE: { icon: 'building', color: 'orange' },
  STATUS: { icon: 'flag', color: 'amber' },
  SYSTEM: { icon: 'cog', color: 'gray' },
  OTHER: { icon: 'dot', color: 'slate' },
};

const GOVERNMENT_FIELDS = new Set(['nationalId', 'socialSecurityNumber', 'passportNumber']);
const EMERGENCY_FIELDS = new Set([
  'emergencyContactName',
  'emergencyContactRelationship',
  'emergencyContactPhone',
]);

const EMPLOYMENT_FIELD_EVENT_KEYS: Record<string, EmployeeTimelineEventKey> = {
  companyId: 'company_transferred',
  teamId: 'team_changed',
  department: 'department_changed',
  position: 'position_changed',
  employmentStatus: 'employment_status_changed',
  probationEndDate: 'probation_date_changed',
  confirmedDate: 'confirmed_date_changed',
  resignDate: 'resign_date_changed',
  supervisorId: 'supervisor_changed',
  shift: 'shift_changed',
  workLocation: 'work_location_changed',
};

const AUDIT_ACTION_EVENT_KEYS: Record<string, EmployeeTimelineEventKey> = {
  employee_education_created: 'education_added',
  employee_education_updated: 'education_updated',
  employee_education_deleted: 'education_deleted',
  employee_work_experience_created: 'experience_added',
  employee_work_experience_updated: 'experience_updated',
  employee_work_experience_deleted: 'experience_deleted',
  employee_archived: 'status_changed',
  employee_restored: 'status_changed',
  employee_draft_deleted: 'status_changed',
  employee_access_updated: 'system_event',
  employee_change_requested: 'system_event',
  employee_salary_direct_edited: 'status_changed',
  employee_payroll_updated: 'status_changed',
  employee_payroll_info_updated: 'status_changed',
  salary_direct_edit: 'status_changed',
};

type ActorMap = Map<string, { name: string; businessRole: string | null }>;

@Injectable()
export class EmployeeTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly permissions: PermissionService,
  ) {}

  async getTimeline(actor: ActorContext, employeeId: string): Promise<EmployeeTimelineResponseDto> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);

    const canViewSensitive = await this.canViewSensitive(actor);
    const canViewSalary = await this.canViewSalary(actor);

    const [changeRows, employeeAudits, documentAudits] = await Promise.all([
      this.prisma.employeeChangeHistory.findMany({
        where: { employeeId },
        orderBy: { changedAt: 'desc' },
        take: 300,
      }),
      this.prisma.auditLog.findMany({
        where: { entityType: 'Employee', entityId: employeeId },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
      this.loadDocumentAudits(employeeId),
    ]);

    const actorIds = new Set<string>();
    for (const row of changeRows) actorIds.add(row.changedBy);
    for (const row of [...employeeAudits, ...documentAudits]) {
      if (row.actorUserId) actorIds.add(row.actorUserId);
    }
    const actors = await this.loadActors([...actorIds]);

    const fromChanges = changeRows.map((row) =>
      this.mapChangeHistory(row, actors, canViewSensitive, canViewSalary),
    );

    const fromAudits = [...employeeAudits, ...documentAudits]
      .filter((row) => !SKIP_AUDIT_ACTIONS.has(row.action))
      .map((row) => this.mapAudit(row, actors, canViewSensitive, canViewSalary));

    const items = [...fromChanges, ...fromAudits]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { items };
  }

  private async canViewSensitive(actor: ActorContext): Promise<boolean> {
    const effective = await this.permissions.getEffectivePermissions(actor.userId);
    return effective.includes('employee:sensitive:read');
  }

  private async canViewSalary(actor: ActorContext): Promise<boolean> {
    const effective = await this.permissions.getEffectivePermissions(actor.userId);
    return effective.includes('salary:read') || effective.includes('payroll:read');
  }

  private async loadDocumentAudits(employeeId: string) {
    const docs = await this.prisma.employeeDocument.findMany({
      where: { employeeId },
      select: { id: true, fileName: true, docType: true },
    });
    if (!docs.length) return [];
    const docMap = new Map(docs.map((d) => [d.id, d]));
    const rows = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'EmployeeDocument',
        entityId: { in: docs.map((d) => d.id) },
      },
      orderBy: { occurredAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      ...row,
      documentMeta: row.entityId ? docMap.get(row.entityId) ?? null : null,
    }));
  }

  private async loadActors(userIds: string[]): Promise<ActorMap> {
    if (!userIds.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        employee: { select: { firstName: true, lastName: true, nickname: true } },
        businessRoleAssignments: {
          where: { isActive: true, deletedAt: null },
          select: { role: true },
          take: 1,
        },
      },
    });
    const map: ActorMap = new Map();
    for (const user of users) {
      const name = user.employee
        ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
        : user.username;
      map.set(user.id, {
        name,
        businessRole: user.businessRoleAssignments[0]?.role ?? null,
      });
    }
    return map;
  }

  private mapChangeHistory(
    row: {
      id: string;
      changeType: EmployeeChangeType;
      fieldName: string | null;
      beforeValueJson: Prisma.JsonValue;
      afterValueJson: Prisma.JsonValue;
      changedAt: Date;
      changedBy: string;
      source: string;
    },
    actors: ActorMap,
    canViewSensitive: boolean,
    canViewSalary: boolean,
  ): EmployeeTimelineItemDto {
    const category = this.categoryFromChangeType(row.changeType);
    const meta = CATEGORY_META[category];
    const { title, description } = this.describeChange(row, canViewSensitive, canViewSalary);
    const eventKey = this.eventKeyFromChangeHistory(row);

    return {
      id: `ch-${row.id}`,
      timestamp: row.changedAt.toISOString(),
      category,
      eventKey,
      title,
      description,
      actor: actors.get(row.changedBy) ?? { name: 'Unknown', businessRole: null },
      source: this.formatSource(row.source),
      icon: meta.icon,
      color: meta.color,
    };
  }

  private mapAudit(
    row: {
      id: bigint;
      action: string;
      occurredAt: Date;
      actorUserId: string | null;
      before: Prisma.JsonValue;
      after: Prisma.JsonValue;
      documentMeta?: { fileName: string; docType: string } | null;
    },
    actors: ActorMap,
    canViewSensitive: boolean,
    canViewSalary: boolean,
  ): EmployeeTimelineItemDto {
    const category = this.categoryFromAuditAction(row.action, !!row.documentMeta);
    const meta = CATEGORY_META[category];
    const { title, description } = this.describeAudit(row, canViewSensitive, canViewSalary);
    const eventKey = this.eventKeyFromAudit(row);

    return {
      id: `au-${row.id.toString()}`,
      timestamp: row.occurredAt.toISOString(),
      category,
      eventKey,
      title,
      description,
      actor: row.actorUserId
        ? actors.get(row.actorUserId) ?? { name: 'System', businessRole: null }
        : { name: 'System', businessRole: null },
      source: 'Web Admin',
      icon: meta.icon,
      color: meta.color,
    };
  }

  private categoryFromChangeType(changeType: EmployeeChangeType): EmployeeTimelineCategory {
    switch (changeType) {
      case 'profile': return 'PERSONAL';
      case 'employment': return 'EMPLOYMENT';
      case 'education': return 'EDUCATION';
      case 'experience': return 'WORK_EXPERIENCE';
      case 'payroll':
      case 'salary': return 'STATUS';
      case 'access': return 'SYSTEM';
      case 'archive':
      case 'restore':
      case 'delete': return 'STATUS';
      default: return 'OTHER';
    }
  }

  private categoryFromAuditAction(action: string, isDocument: boolean): EmployeeTimelineCategory {
    if (isDocument || action.startsWith('document_')) return 'DOCUMENT';
    if (action.includes('education')) return 'EDUCATION';
    if (action.includes('experience') || action.includes('work_experience')) return 'WORK_EXPERIENCE';
    if (action.includes('employment')) return 'EMPLOYMENT';
    if (action.includes('personal') || action.includes('profile')) return 'PERSONAL';
    if (SALARY_AUDIT_ACTIONS.has(action) || action.includes('salary') || action.includes('payroll')) {
      return 'STATUS';
    }
    if (action.includes('archive') || action.includes('restore') || action.includes('terminate')) {
      return 'STATUS';
    }
    if (action.includes('access') || action.includes('permission')) return 'SYSTEM';
    return 'OTHER';
  }

  private describeChange(
    row: {
      changeType: EmployeeChangeType;
      fieldName: string | null;
      beforeValueJson: Prisma.JsonValue;
      afterValueJson: Prisma.JsonValue;
    },
    canViewSensitive: boolean,
    canViewSalary: boolean,
  ): { title: string; description: string } {
    if (row.fieldName === 'onboarding') {
      const json = row.afterValueJson as Record<string, unknown> | null;
      const eventKey = String(json?.event ?? '');
      const title = ONBOARDING_TIMELINE_EVENTS[eventKey as keyof typeof ONBOARDING_TIMELINE_EVENTS]
        ?? 'การรับพนักงาน';
      const reason = json?.reason ? String(json.reason) : '';
      return { title, description: reason };
    }

    if (row.changeType === 'education') {
      return this.describeRecordChange('Education', row.beforeValueJson, row.afterValueJson);
    }
    if (row.changeType === 'experience') {
      return this.describeRecordChange('Work experience', row.beforeValueJson, row.afterValueJson);
    }

    const field = row.fieldName ?? 'field';
    const label = FIELD_LABELS[field] ?? field;
    const before = this.maskValue(field, row.beforeValueJson, canViewSensitive, canViewSalary);
    const after = this.maskValue(field, row.afterValueJson, canViewSensitive, canViewSalary);

    const changeKind = row.changeType === 'employment' ? 'Employment' : 'Personal';
    if (before == null && after != null) {
      return { title: `${changeKind} updated`, description: `Set ${label} to ${after}` };
    }
    if (before != null && after == null) {
      return { title: `${changeKind} updated`, description: `Cleared ${label}` };
    }
    return { title: `${changeKind} updated`, description: `Changed ${label} from ${before ?? '—'} to ${after ?? '—'}` };
  }

  private describeRecordChange(
    label: string,
    before: Prisma.JsonValue,
    after: Prisma.JsonValue,
  ): { title: string; description: string } {
    const afterObj = after && typeof after === 'object' && !Array.isArray(after)
      ? after as Record<string, unknown>
      : null;
    const beforeObj = before && typeof before === 'object' && !Array.isArray(before)
      ? before as Record<string, unknown>
      : null;

    if (!beforeObj && afterObj) {
      const name = String(afterObj.institution ?? afterObj.companyName ?? label);
      return { title: `${label} added`, description: name };
    }
    if (beforeObj && !afterObj) {
      const name = String(beforeObj.institution ?? beforeObj.companyName ?? label);
      return { title: `${label} removed`, description: name };
    }
    const name = String(afterObj?.institution ?? afterObj?.companyName ?? beforeObj?.institution ?? beforeObj?.companyName ?? label);
    return { title: `${label} updated`, description: name };
  }

  private describeAudit(
    row: {
      action: string;
      before: Prisma.JsonValue;
      after: Prisma.JsonValue;
      documentMeta?: { fileName: string; docType: string } | null;
    },
    canViewSensitive: boolean,
    canViewSalary: boolean,
  ): { title: string; description: string } {
    if (row.documentMeta) {
      return {
        title: this.auditActionTitle(row.action),
        description: `${row.documentMeta.fileName} (${row.documentMeta.docType})`,
      };
    }

    if (SALARY_AUDIT_ACTIONS.has(row.action) && !canViewSalary) {
      return {
        title: this.auditActionTitle(row.action),
        description: 'Salary details hidden',
      };
    }

    const afterObj = row.after && typeof row.after === 'object' && !Array.isArray(row.after)
      ? row.after as Record<string, unknown>
      : null;
    if (afterObj?.reason && typeof afterObj.reason === 'string') {
      return {
        title: this.auditActionTitle(row.action),
        description: afterObj.reason,
      };
    }

    if (afterObj) {
      const parts = Object.entries(afterObj)
        .slice(0, 3)
        .map(([key, value]) => {
          const masked = this.maskValue(key, value as Prisma.JsonValue, canViewSensitive, canViewSalary);
          return `${FIELD_LABELS[key] ?? key}: ${masked ?? '—'}`;
        });
      if (parts.length) {
        return { title: this.auditActionTitle(row.action), description: parts.join(' · ') };
      }
    }

    return { title: this.auditActionTitle(row.action), description: 'Employee record updated' };
  }

  private auditActionTitle(action: string): string {
    const titles: Record<string, string> = {
      employee_education_created: 'Education added',
      employee_education_updated: 'Education updated',
      employee_education_deleted: 'Education removed',
      employee_work_experience_created: 'Work experience added',
      employee_work_experience_updated: 'Work experience updated',
      employee_work_experience_deleted: 'Work experience removed',
      employee_archive: 'Employee archived',
      employee_restored: 'Employee restored',
      employee_draft_deleted: 'Employee deleted',
      document_uploaded: 'Document uploaded',
      document_replaced: 'Document replaced',
      document_deleted: 'Document deleted',
      document_downloaded: 'Document downloaded',
      document_acknowledged: 'Document acknowledged',
      salary_direct_edit: 'Salary updated',
      employee_payroll_updated: 'Payroll updated',
    };
    return titles[action] ?? action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private maskValue(
    field: string,
    value: Prisma.JsonValue,
    canViewSensitive: boolean,
    canViewSalary: boolean,
  ): string | null {
    if (value == null) return null;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (!canViewSalary && (field.includes('salary') || field.includes('payroll') || field.includes('bank'))) {
      return '****';
    }
    if (!canViewSensitive && SENSITIVE_FIELDS.has(field)) {
      if (field === 'nationalId') return maskOrReveal(str, false, maskNationalId) ?? '****';
      if (field === 'passportNumber') return maskOrReveal(str, false, (v) => maskSensitiveValue(v, 2, 3)) ?? '****';
      return maskOrReveal(str, false, (v) => maskSensitiveValue(v)) ?? '****';
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return str;
  }

  private formatSource(source: string): string {
    switch (source) {
      case 'web': return 'Web Admin';
      case 'telegram': return 'Telegram';
      case 'api': return 'API';
      case 'system': return 'System';
      default: return source;
    }
  }

  private eventKeyFromChangeHistory(row: {
    changeType: EmployeeChangeType;
    fieldName: string | null;
    beforeValueJson: Prisma.JsonValue;
    afterValueJson: Prisma.JsonValue;
  }): EmployeeTimelineEventKey {
    if (row.changeType === 'education') {
      return this.eventKeyFromRecordChange(row.beforeValueJson, row.afterValueJson, 'education');
    }
    if (row.changeType === 'experience') {
      return this.eventKeyFromRecordChange(row.beforeValueJson, row.afterValueJson, 'experience');
    }
    if (row.changeType === 'access' && row.fieldName === 'businessRole') {
      return 'business_role_changed';
    }
    if (row.changeType === 'access' && row.fieldName === 'onboarding') {
      return 'system_event';
    }
    if (row.changeType === 'archive' || row.changeType === 'restore' || row.changeType === 'delete') {
      return 'status_changed';
    }
    if (row.changeType === 'payroll' || row.changeType === 'salary') {
      return 'status_changed';
    }
    if (row.changeType === 'employment') {
      const field = row.fieldName ?? '';
      return EMPLOYMENT_FIELD_EVENT_KEYS[field] ?? 'employment_updated';
    }
    if (row.changeType === 'profile') {
      const field = row.fieldName ?? '';
      if (GOVERNMENT_FIELDS.has(field)) return 'government_info_updated';
      if (EMERGENCY_FIELDS.has(field)) return 'emergency_contact_updated';
      return 'personal_updated';
    }
    return 'other';
  }

  private eventKeyFromRecordChange(
    before: Prisma.JsonValue,
    after: Prisma.JsonValue,
    kind: 'education' | 'experience',
  ): EmployeeTimelineEventKey {
    const beforeObj = before && typeof before === 'object' && !Array.isArray(before);
    const afterObj = after && typeof after === 'object' && !Array.isArray(after);
    const prefix = kind === 'education' ? 'education' : 'experience';
    if (!beforeObj && afterObj) return `${prefix}_added` as EmployeeTimelineEventKey;
    if (beforeObj && !afterObj) return `${prefix}_deleted` as EmployeeTimelineEventKey;
    return `${prefix}_updated` as EmployeeTimelineEventKey;
  }

  private eventKeyFromAudit(row: {
    action: string;
    documentMeta?: { fileName: string; docType: string } | null;
  }): EmployeeTimelineEventKey {
    const mapped = AUDIT_ACTION_EVENT_KEYS[row.action];
    if (mapped) return mapped;

    const docType = row.documentMeta?.docType;
    const isIdentityDoc = docType === 'national_id' || docType === 'passport';
    if (row.action === 'document_uploaded' && isIdentityDoc) return 'identity_document_uploaded';
    if (row.action === 'document_replaced' && isIdentityDoc) return 'identity_document_replaced';
    if (row.action === 'document_deleted' && isIdentityDoc) return 'identity_document_deleted';

    if (row.action.includes('probation_pass')) return 'probation_passed';
    if (
      row.action === 'employee_created'
      || row.action.includes('employee_onboard')
      || row.action === 'employee_draft_created'
    ) {
      return 'employee_created';
    }
    if (row.action.includes('terminate')) return 'status_changed';
    if (row.action.includes('employment')) return 'employment_updated';
    if (row.action.includes('personal') || row.action.includes('profile')) return 'personal_updated';

    return 'other';
  }
}
