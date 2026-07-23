import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { parseThaiDateInput, THAI_DATE_VALIDATION_ERROR } from '../../../shared/time/thai-date-input.util';
import { parseThaiTimeInput, THAI_TIME_VALIDATION_ERROR } from '../../../shared/time/thai-time-input.util';
import { RequestAccessService } from './request-access.service';
import { RequestTypeService } from './request-type.service';
import {
  RequestNotFoundError, RequestValidationError,
} from '../domain/errors/request.errors';
import {
  CreateFormFieldDto, ReorderFieldsDto, UpdateFormFieldDto,
} from './dto/request.dto';
import { evaluateCondition, FieldCondition } from './request-condition.util';

@Injectable()
export class RequestFormFieldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: RequestAccessService,
    private readonly types: RequestTypeService,
  ) {}

  async create(actor: ActorContext, typeId: string, versionId: string, dto: CreateFormFieldDto) {
    await this.assertDraftVersion(actor, typeId, versionId);
    const field = await this.prisma.requestFormField.create({
      data: {
        id: randomUUID(),
        requestTypeVersionId: versionId,
        key: dto.key,
        labelTh: dto.labelTh,
        labelEn: dto.labelEn,
        description: dto.description,
        fieldType: dto.fieldType as never,
        placeholder: dto.placeholder,
        helpText: dto.helpText,
        required: dto.required ?? false,
        order: dto.order ?? 999,
        defaultValueJson: dto.defaultValueJson as object | undefined,
        optionsJson: dto.optionsJson as object | undefined,
        validationJson: dto.validationJson as object | undefined,
        visibilityConditionJson: dto.visibilityConditionJson as object | undefined,
        formulaJson: dto.formulaJson as object | undefined,
        sourceJson: dto.sourceJson as object | undefined,
      },
    });
    await this.audit.record(actor, { entityType: 'RequestFormField', entityId: field.id, action: 'create', after: field });
    return field;
  }

  async update(actor: ActorContext, fieldId: string, dto: UpdateFormFieldDto) {
    const field = await this.getFieldOrThrow(fieldId);
    await this.assertDraftVersion(actor, field.requestTypeVersion.requestTypeId, field.requestTypeVersionId);
    if (field.isSystem && dto.key && dto.key !== field.key) {
      throw new RequestValidationError('Cannot change key of system field');
    }
    const updated = await this.prisma.requestFormField.update({
      where: { id: fieldId },
      data: {
        ...(dto.key !== undefined ? { key: dto.key } : {}),
        ...(dto.labelTh !== undefined ? { labelTh: dto.labelTh } : {}),
        ...(dto.labelEn !== undefined ? { labelEn: dto.labelEn } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.fieldType !== undefined ? { fieldType: dto.fieldType as never } : {}),
        ...(dto.placeholder !== undefined ? { placeholder: dto.placeholder } : {}),
        ...(dto.helpText !== undefined ? { helpText: dto.helpText } : {}),
        ...(dto.required !== undefined ? { required: dto.required } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.defaultValueJson !== undefined ? { defaultValueJson: dto.defaultValueJson as object } : {}),
        ...(dto.optionsJson !== undefined ? { optionsJson: dto.optionsJson as object } : {}),
        ...(dto.validationJson !== undefined ? { validationJson: dto.validationJson as object } : {}),
        ...(dto.visibilityConditionJson !== undefined ? { visibilityConditionJson: dto.visibilityConditionJson as object } : {}),
      },
    });
    await this.audit.record(actor, { entityType: 'RequestFormField', entityId: fieldId, action: 'update', after: updated });
    return updated;
  }

  async delete(actor: ActorContext, fieldId: string) {
    const field = await this.getFieldOrThrow(fieldId);
    await this.assertDraftVersion(actor, field.requestTypeVersion.requestTypeId, field.requestTypeVersionId);
    if (field.isSystem) throw new RequestValidationError('Cannot delete system field');
    await this.prisma.requestFormField.delete({ where: { id: fieldId } });
    await this.audit.record(actor, { entityType: 'RequestFormField', entityId: fieldId, action: 'delete' });
    return { ok: true };
  }

  async clone(actor: ActorContext, fieldId: string) {
    const field = await this.getFieldOrThrow(fieldId);
    await this.assertDraftVersion(actor, field.requestTypeVersion.requestTypeId, field.requestTypeVersionId);
    const copy = await this.prisma.requestFormField.create({
      data: {
        requestTypeVersionId: field.requestTypeVersionId,
        key: `${field.key}_copy`,
        labelTh: `${field.labelTh} (สำเนา)`,
        labelEn: field.labelEn,
        description: field.description,
        fieldType: field.fieldType,
        placeholder: field.placeholder,
        helpText: field.helpText,
        required: field.required,
        order: field.order + 1,
        defaultValueJson: field.defaultValueJson ?? undefined,
        optionsJson: field.optionsJson ?? undefined,
        validationJson: field.validationJson ?? undefined,
        visibilityConditionJson: field.visibilityConditionJson ?? undefined,
        isSystem: false,
      },
    });
    return copy;
  }

  async reorder(actor: ActorContext, typeId: string, versionId: string, dto: ReorderFieldsDto) {
    await this.assertDraftVersion(actor, typeId, versionId);
    await this.prisma.$transaction(
      dto.fieldIds.map((id, idx) => this.prisma.requestFormField.update({
        where: { id },
        data: { order: idx + 1 },
      })),
    );
    return this.listForVersion(versionId);
  }

  async preview(actor: ActorContext, typeId: string, versionId: string, sampleValues?: Record<string, unknown>) {
    await this.types.get(actor, typeId);
    const fields = await this.listForVersion(versionId);
    const values = sampleValues ?? {};
    return fields.filter((f) => evaluateCondition(
      f.visibilityConditionJson as FieldCondition | null,
      values,
    ));
  }

  validateFieldValue(
    field: { key: string; labelTh: string; fieldType: string; required: boolean; validationJson?: unknown; optionsJson?: unknown },
    value: unknown,
  ): string | null {
    if (field.required && (value === null || value === undefined || value === '')) {
      return `${field.labelTh} จำเป็นต้องกรอก`;
    }
    if (value === null || value === undefined || value === '') return null;

    const v = field.validationJson as Record<string, unknown> | null;
    if (field.fieldType === 'number' || field.fieldType === 'currency' || field.fieldType === 'quick_amount') {
      const n = Number(value);
      if (Number.isNaN(n)) return `${field.labelTh} ต้องเป็นตัวเลข`;
      if (v?.min !== undefined && n < Number(v.min)) return `${field.labelTh} ต้องไม่น้อยกว่า ${v.min}`;
      if (v?.max !== undefined && n > Number(v.max)) return `${field.labelTh} ต้องไม่เกิน ${v.max}`;
    }
    if (field.fieldType === 'text' || field.fieldType === 'textarea') {
      const s = String(value);
      if (v?.minLength !== undefined && s.length < Number(v.minLength)) return `${field.labelTh} สั้นเกินไป`;
      if (v?.maxLength !== undefined && s.length > Number(v.maxLength)) return `${field.labelTh} ยาวเกินไป`;
    }
    if (['select', 'radio', 'button_select', 'leave_type_picker', 'shift_picker', 'document_type_picker', 'bank_picker', 'relationship_picker'].includes(field.fieldType)) {
      const opts = (field.optionsJson as Array<{ value: string }> | null) ?? [];
      if (opts.length && !opts.some((o) => o.value === String(value))) {
        return `${field.labelTh} ไม่ถูกต้อง`;
      }
    }
    if (['date', 'quick_date'].includes(field.fieldType)) {
      if (!parseThaiDateInput(String(value))) {
        return `${field.labelTh} ${THAI_DATE_VALIDATION_ERROR}`;
      }
    }
    if (['time', 'quick_time'].includes(field.fieldType)) {
      if (!parseThaiTimeInput(String(value))) {
        return `${field.labelTh} ${THAI_TIME_VALIDATION_ERROR}`;
      }
    }
    return null;
  }

  visibleFields<T extends { visibilityConditionJson?: unknown }>(
    fields: T[],
    values: Record<string, unknown>,
  ): T[] {
    return fields.filter((f) => evaluateCondition(f.visibilityConditionJson as FieldCondition | null, values));
  }

  private async listForVersion(versionId: string) {
    return this.prisma.requestFormField.findMany({
      where: { requestTypeVersionId: versionId },
      orderBy: { order: 'asc' },
    });
  }

  private async getFieldOrThrow(fieldId: string) {
    const field = await this.prisma.requestFormField.findUnique({
      where: { id: fieldId },
      include: { requestTypeVersion: true },
    });
    if (!field) throw new RequestNotFoundError('Field not found');
    return field;
  }

  private async assertDraftVersion(actor: ActorContext, typeId: string, versionId: string) {
    const type = await this.types.get(actor, typeId);
    const version = type.versions.find((v) => v.id === versionId);
    if (!version) throw new RequestNotFoundError('Version not found');
    if (version.status !== 'draft') throw new RequestValidationError('Published version fields are immutable');
  }
}
