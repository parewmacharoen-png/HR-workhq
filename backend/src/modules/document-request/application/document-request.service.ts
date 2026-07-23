// ============================================================================
// modules/document-request/application/document-request.service.ts
// DOC-002 — Document Request Module
// ============================================================================

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext, SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { DocumentPdfService } from './document-pdf.service';
import {
  CreateDocumentRequestDto,
  DocumentRequestResponse,
} from './dto/document-request.dto';
import { DateProvider } from '../../../shared/time/date.provider';

const DEFAULT_TYPES = [
  { key: 'employment_certificate', nameTh: 'หนังสือรับรองการทำงาน', nameEn: 'Employment Certificate' },
  { key: 'salary_certificate', nameTh: 'หนังสือรับรองเงินเดือน', nameEn: 'Salary Certificate' },
  { key: 'tax_documents', nameTh: 'ใบรับรองภาษี', nameEn: 'Tax Certificate' },
  { key: 'employment_verification', nameTh: 'ใบรับรองการจ้างงาน', nameEn: 'Employment Verification' },
  { key: 'custom', nameTh: 'เอกสารอื่นๆ', nameEn: 'Custom Document' },
] as const;

@Injectable()
export class DocumentRequestService implements OnModuleInit {
  private readonly logger = new Logger(DocumentRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly telegram: TelegramGatewayService,
    private readonly pdf: DocumentPdfService,
    private readonly dates: DateProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const t of DEFAULT_TYPES) {
      await this.prisma.documentRequestType.upsert({
        where: { key: t.key },
        create: { key: t.key, nameTh: t.nameTh, nameEn: t.nameEn, description: t.nameEn },
        update: {},
      });
    }
  }

  async listTypes(): Promise<Array<{ key: string; nameTh: string; nameEn: string }>> {
    const rows = await this.prisma.documentRequestType.findMany({
      where: { isActive: true },
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => ({ key: r.key, nameTh: r.nameTh, nameEn: r.nameEn }));
  }

  async submit(
    actor: ActorContext,
    employeeId: string,
    dto: CreateDocumentRequestDto,
  ): Promise<DocumentRequestResponse> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, dto.companyId);

    const type = await this.prisma.documentRequestType.findFirst({
      where: { key: dto.typeKey, isActive: true },
    });
    if (!type) throw new Error(`Unknown document type: ${dto.typeKey}`);

    const requestId = randomUUID();
    await this.prisma.documentRequest.create({
      data: {
        id: requestId,
        employeeId,
        companyId: dto.companyId,
        typeId: type.id,
        status: 'pending',
        formData: (dto.formData ?? {}) as Prisma.InputJsonValue,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    const { instanceId } = await this.workflow.start(actor, {
      entityType: 'document_request',
      entityId: requestId,
      companyId: dto.companyId,
      workflowType: 'document_request',
      approvalContext: { employeeId, companyId: dto.companyId },
    });

    await this.prisma.documentRequest.update({
      where: { id: requestId },
      data: { workflowInstanceId: instanceId },
    });

    await this.audit.record(actor, {
      entityType: 'DocumentRequest',
      entityId: requestId,
      action: 'submitted',
      after: { typeKey: dto.typeKey, workflowInstanceId: instanceId },
    });

    return this.get(actor, requestId);
  }

  /** Request Platform path — approval already done; generate PDF immediately. */
  async fulfillFromRequestPlatform(
    actor: ActorContext,
    input: {
      employeeId: string;
      companyId: string;
      typeKey: string;
      requestInstanceId: string;
      formData?: Record<string, unknown>;
    },
  ): Promise<{ documentRequestId: string }> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, input.employeeId, input.companyId);

    const normalizedKey = normalizeDocumentTypeKey(input.typeKey);
    const type = await this.prisma.documentRequestType.findFirst({
      where: { key: normalizedKey, isActive: true },
    });
    if (!type) throw new Error(`Unknown document type: ${input.typeKey}`);

    const requestId = randomUUID();
    await this.prisma.documentRequest.create({
      data: {
        id: requestId,
        employeeId: input.employeeId,
        companyId: input.companyId,
        typeId: type.id,
        status: 'pending',
        formData: {
          ...(input.formData ?? {}),
          requestInstanceId: input.requestInstanceId,
        } as Prisma.InputJsonValue,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.onWorkflowResolved(requestId, 'approved');
    return { documentRequestId: requestId };
  }

  async listMine(actor: ActorContext): Promise<DocumentRequestResponse[]> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) return [];

    const rows = await this.prisma.documentRequest.findMany({
      where: { employeeId: user.employeeId },
      include: { type: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => this.toResponse(r));
  }

  async get(actor: ActorContext, id: string): Promise<DocumentRequestResponse> {
    const row = await this.prisma.documentRequest.findFirst({
      where: { id },
      include: { type: true, employee: { select: { id: true } } },
    });
    if (!row) throw new Error('Document request not found');
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, row.employeeId, row.companyId);
    return this.toResponse(row);
  }

  async onWorkflowResolved(
    entityId: string,
    status: 'approved' | 'rejected' | 'cancelled',
  ): Promise<void> {
    const request = await this.prisma.documentRequest.findFirst({
      where: { id: entityId },
      include: { type: true, employee: true },
    });
    if (!request) {
      this.logger.warn(`onWorkflowResolved: document request ${entityId} not found`);
      return;
    }

    if (status === 'approved') {
      await this.prisma.documentRequest.update({
        where: { id: entityId },
        data: { status: 'generating' },
      });

      const jobId = randomUUID();
      await this.prisma.documentGenerationJob.create({
        data: { id: jobId, documentRequestId: entityId, status: 'processing', startedAt: this.dates.now() },
      });

      try {
        const company = await this.prisma.company.findFirst({
          where: { id: request.companyId, deletedAt: null },
          select: { name: true },
        });
        const docNumber = this.pdf.newDocumentNumber();
        const generated = await this.pdf.generate({
          documentNumber: docNumber,
          typeKey: request.type.key,
          typeName: request.type.nameTh,
          employeeName: `${request.employee.firstName} ${request.employee.lastName}`,
          companyName: company?.name ?? 'WorkHQ',
          employeeId: request.employeeId,
          requestId: entityId,
        });

        const docId = randomUUID();

        await this.prisma.$transaction(async (tx) => {
          await tx.employeeDocument.create({
            data: {
              id: docId,
              employeeId: request.employeeId,
              docType: 'certificate',
              fileKey: generated.fileKey,
              fileName: generated.fileName,
              mimeType: 'application/pdf',
              sourceType: 'hr_generated',
              createdBy: SYSTEM_ACTOR.userId,
              updatedBy: SYSTEM_ACTOR.userId,
            },
          });
          await tx.documentGenerationJob.update({
            where: { id: jobId },
            data: {
              status: 'completed',
              outputFileKey: generated.fileKey,
              completedAt: this.dates.now(),
            },
          });
          await tx.documentRequest.update({
            where: { id: entityId },
            data: {
              status: 'ready',
              employeeDocumentId: docId,
            },
          });
        });

        await this.audit.record(SYSTEM_ACTOR, {
          entityType: 'DocumentRequest',
          entityId,
          action: 'document_generated',
          after: { employeeDocumentId: docId, fileKey: generated.fileKey, docNumber },
        });

        await this.notifyRequesterReady(request.createdBy, entityId, generated.fileName, docId);
      } catch (err: unknown) {
        await this.prisma.documentGenerationJob.update({
          where: { id: jobId },
          data: { status: 'failed', errorMessage: (err as Error).message, completedAt: this.dates.now() },
        });
        await this.prisma.documentRequest.update({
          where: { id: entityId },
          data: { status: 'failed' },
        });
        this.logger.error('Document generation failed', err);
      }
    } else {
      await this.prisma.documentRequest.update({
        where: { id: entityId },
        data: { status: 'rejected' },
      });
      await this.notifyRequesterOutcome(request.createdBy, entityId, 'rejected');
    }
  }

  private async notifyRequesterReady(
    userId: string | null,
    requestId: string,
    fileName: string,
    documentId: string,
  ): Promise<void> {
    if (!userId) return;
    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId, isActive: true, deletedAt: null },
    });
    if (!account?.chatId) return;

    await this.telegram.sendMessage({
      chatId: Number(account.chatId),
      text: [
        '✅ <b>เอกสารพร้อมดาวน์โหลดแล้ว</b>',
        `ไฟล์: ${fileName}`,
        `รหัสคำขอ: ${requestId.slice(0, 8)}…`,
      ].join('\n'),
      parseMode: 'HTML',
      telegramAccountId: account.id,
      messageType: 'document_ready',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📥 ดาวน์โหลด', callback_data: `document:download:${documentId}` }],
          [{ text: '📄 เอกสารของฉัน', callback_data: 'document-center:my' }],
        ],
      },
    }).catch((err) => this.logger.warn('Document ready notification failed', err));
  }

  private async notifyRequesterOutcome(
    userId: string | null,
    requestId: string,
    outcome: 'rejected',
  ): Promise<void> {
    if (!userId) return;
    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId, isActive: true, deletedAt: null },
    });
    if (!account?.chatId) return;

    await this.telegram.sendMessage({
      chatId: Number(account.chatId),
      text: `❌ คำขอเอกสาร ${requestId.slice(0, 8)}… ไม่ได้รับการอนุมัติ`,
      telegramAccountId: account.id,
      messageType: 'document_rejected',
    }).catch(() => undefined);
  }

  private toResponse(row: {
    id: string;
    employeeId: string;
    companyId: string;
    status: string;
    workflowInstanceId: string | null;
    employeeDocumentId: string | null;
    rejectionReason: string | null;
    createdAt: Date;
    type: { key: string; nameTh: string };
  }): DocumentRequestResponse {
    return {
      id: row.id,
      employeeId: row.employeeId,
      companyId: row.companyId,
      typeKey: row.type.key,
      typeName: row.type.nameTh,
      status: row.status,
      workflowInstanceId: row.workflowInstanceId,
      employeeDocumentId: row.employeeDocumentId,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function normalizeDocumentTypeKey(raw: string): string {
  const key = raw.trim();
  const aliases: Record<string, string> = {
    tax_document: 'tax_documents',
    other: 'custom',
  };
  return aliases[key] ?? key;
}
