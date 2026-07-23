import { createHash } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { UploadDocumentDto } from './dto/document-center.dto';
import { AuditService } from '../../../shared/audit/audit.service';
import { DateProvider } from '../../../shared/time/date.provider';
import {
  DOCUMENT_STORAGE,
  DocumentStorageService,
} from '../../../shared/storage/document-storage.interface';

const REQUIRED_DOC_TYPES: DocumentType[] = [
  'national_id',
  'house_registration',
  'bank_account',
  'employment_contract',
];

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_FILE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class DocumentCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorageService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async listMyDocuments(actor: ActorContext) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) return [];
    return this.prisma.employeeDocument.findMany({
      where: { employeeId: access.employeeId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async listEmployeeDocuments(actor: ActorContext, employeeId: string) {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null },
      orderBy: { isPrimaryCompany: 'desc' },
      select: { companyId: true },
    });
    if (!assignment) throw new Error('Employee not found');
    await this.companyAccess.assertCompanyAccess(actor, assignment.companyId);
    return this.prisma.employeeDocument.findMany({
      where: { employeeId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
  }

  async uploadDocument(actor: ActorContext, dto: UploadDocumentDto) {
    await this.assertUploadAccess(actor, dto.employeeId);
    return this.prisma.employeeDocument.create({
      data: {
        employeeId: dto.employeeId,
        docType: dto.docType,
        fileKey: dto.fileKey,
        fileName: dto.fileName,
        mimeType: dto.mimeType ?? null,
        expiresAt: dto.expiresAt ? this.dates.parseDate(dto.expiresAt) : null,
        sourceType: 'hr_upload',
        createdBy: actor.userId,
        updatedBy: actor.userId,
        versions: {
          create: {
            versionNumber: 1,
            fileName: dto.fileName,
            storageKey: dto.fileKey,
            mimeType: dto.mimeType ?? null,
            uploadedBy: actor.userId,
          },
        },
      },
    });
  }

  async uploadMultipart(
    actor: ActorContext,
    employeeId: string,
    docType: DocumentType,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    expiresAt?: string,
  ) {
    if (file.size > MAX_FILE_BYTES) throw new Error('File exceeds maximum size (10MB)');
    if (!ALLOWED_MIME.has(file.mimetype)) throw new Error('File type not allowed');

    await this.assertUploadAccess(actor, employeeId);
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const storageKey = `${employeeId}/${docType}/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.save(storageKey, file.buffer);

    const existing = await this.prisma.employeeDocument.findFirst({
      where: { employeeId, docType, deletedAt: null },
    });

    if (existing) {
      const nextVersion = existing.currentVersion + 1;
      await this.prisma.employeeDocumentVersion.create({
        data: {
          documentId: existing.id,
          versionNumber: nextVersion,
          fileName: file.originalname,
          storageKey,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          checksum,
          uploadedBy: actor.userId,
        },
      });
      const updated = await this.prisma.employeeDocument.update({
        where: { id: existing.id },
        data: {
          fileKey: storageKey,
          fileName: file.originalname,
          mimeType: file.mimetype,
          currentVersion: nextVersion,
          uploadedAt: this.dates.now(),
          updatedBy: actor.userId,
          ...(expiresAt ? { expiresAt: this.dates.parseDate(expiresAt) } : {}),
        },
      });
      await this.audit.record(actor, {
        entityType: 'EmployeeDocument',
        entityId: existing.id,
        action: 'document_replaced',
        after: { versionNumber: nextVersion, fileName: file.originalname },
      });
      return updated;
    }

    const created = await this.prisma.employeeDocument.create({
      data: {
        employeeId,
        docType,
        fileKey: storageKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        expiresAt: expiresAt ? this.dates.parseDate(expiresAt) : null,
        sourceType: 'employee_upload',
        currentVersion: 1,
        createdBy: actor.userId,
        updatedBy: actor.userId,
        versions: {
          create: {
            versionNumber: 1,
            fileName: file.originalname,
            storageKey,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            checksum,
            uploadedBy: actor.userId,
          },
        },
      },
    });
    await this.audit.record(actor, {
      entityType: 'EmployeeDocument',
      entityId: created.id,
      action: 'document_uploaded',
      after: { fileName: file.originalname, docType },
    });
    return created;
  }

  async listKnowledgeArticles(actor: ActorContext, companyId?: string) {
    if (companyId) await this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.prisma.kbArticle.findMany({
      where: {
        deletedAt: null,
        isPublished: true,
        ...(companyId ? { OR: [{ companyId }, { companyId: null }] } : {}),
      },
      select: {
        id: true,
        title: true,
        category: true,
        tags: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async listTrainingLibrary() {
    return this.prisma.trainingCourse.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        isMandatory: true,
      },
      orderBy: { title: 'asc' },
      take: 50,
    });
  }

  async getDashboard(actor: ActorContext, companyId: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const assignments = await this.prisma.employeeAssignment.findMany({
      where: { companyId, effectiveTo: null, deletedAt: null },
      select: { employeeId: true },
    });
    const employeeIds = [...new Set(assignments.map((a) => a.employeeId))];

    const docs = await this.prisma.employeeDocument.findMany({
      where: { employeeId: { in: employeeIds }, deletedAt: null },
      select: { employeeId: true, docType: true, expiresAt: true, acknowledgedAt: true, uploadedAt: true, fileName: true },
      orderBy: { uploadedAt: 'desc' },
    });

    const now = this.dates.now();
    const expiringThreshold = this.dates.addDays(now, 30);

    let missingRequired = 0;
    for (const empId of employeeIds) {
      const types = new Set(
        docs.filter((d) => d.employeeId === empId).map((d) => d.docType),
      );
      if (REQUIRED_DOC_TYPES.some((t) => !types.has(t))) missingRequired++;
    }

    const expiring = docs.filter(
      (d) => d.expiresAt && d.expiresAt <= expiringThreshold && d.expiresAt >= now,
    ).length;

    const acknowledged = docs.filter((d) => d.acknowledgedAt).length;
    const pendingAck = docs.length - acknowledged;

    const failedJobs = await this.prisma.documentGenerationJob.count({
      where: {
        status: 'failed',
        documentRequest: { companyId },
      },
    });

    return {
      missingRequired,
      expiringSoon: expiring,
      recentlyUploaded: docs.slice(0, 5).map((d) => ({
        fileName: d.fileName,
        docType: d.docType,
        uploadedAt: d.uploadedAt,
      })),
      failedDocumentJobs: failedJobs,
      uploadStatus: {
        total: docs.length,
        acknowledged,
        pendingAcknowledgement: pendingAck,
      },
    };
  }

  async getEmployeeDocumentSummary(actor: ActorContext, employeeId: string) {
    const docs = await this.listEmployeeDocuments(actor, employeeId);
    const now = this.dates.now();
    const expiringThreshold = this.dates.addDays(now, 30);
    const presentTypes = new Set(docs.map((d) => d.docType));
    const requiredMissing = REQUIRED_DOC_TYPES.filter((t) => !presentTypes.has(t));
    const expiring = docs.filter(
      (d) => d.expiresAt && d.expiresAt <= expiringThreshold && d.expiresAt >= now,
    );

    const downloadHistory = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'EmployeeDocument',
        action: { in: ['document_downloaded', 'document_version_downloaded'] },
        entityId: { in: docs.map((d) => d.id) },
      },
      orderBy: { occurredAt: 'desc' },
      take: 20,
    });

    return {
      documents: docs,
      requiredMissing,
      expiring,
      downloadHistory: downloadHistory.map((r) => ({
        documentId: r.entityId,
        action: r.action,
        occurredAt: r.occurredAt,
      })),
    };
  }

  async getDocument(actor: ActorContext, id: string) {
    const doc = await this.prisma.employeeDocument.findFirst({
      where: { id, deletedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!doc) throw new Error('Document not found');
    await this.assertDocumentAccess(actor, doc.employeeId);
    return doc;
  }

  async listVersions(actor: ActorContext, id: string) {
    const doc = await this.getDocument(actor, id);
    return doc.versions;
  }

  async downloadDocument(actor: ActorContext, id: string, versionNumber?: number) {
    const doc = await this.getDocument(actor, id);
    let storageKey = doc.fileKey;
    let fileName = doc.fileName;
    let mimeType = doc.mimeType ?? 'application/octet-stream';

    if (versionNumber != null && versionNumber !== doc.currentVersion) {
      const version = doc.versions.find((v) => v.versionNumber === versionNumber);
      if (!version) throw new Error('Version not found');
      storageKey = version.storageKey;
      fileName = version.fileName;
      mimeType = version.mimeType ?? mimeType;
      await this.audit.record(actor, {
        entityType: 'EmployeeDocument',
        entityId: id,
        action: 'document_version_downloaded',
        after: { fileName, versionNumber },
      });
    } else {
      await this.audit.record(actor, {
        entityType: 'EmployeeDocument',
        entityId: id,
        action: 'document_downloaded',
        after: { fileName: doc.fileName },
      });
    }

    const buffer = await this.storage.read(storageKey);
    return { buffer, fileName, mimeType };
  }

  async deleteDocument(actor: ActorContext, id: string) {
    const doc = await this.getDocument(actor, id);
    await this.assertUploadAccess(actor, doc.employeeId);
    const now = this.dates.now();
    await this.prisma.employeeDocument.update({
      where: { id },
      data: { deletedAt: now, deletedBy: actor.userId, updatedBy: actor.userId },
    });
    await this.audit.record(actor, {
      entityType: 'EmployeeDocument',
      entityId: id,
      action: 'document_deleted',
      before: { fileName: doc.fileName, docType: doc.docType },
    });
    return { ok: true, id };
  }

  async acknowledgeDocument(actor: ActorContext, id: string) {
    const doc = await this.getDocument(actor, id);
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId !== doc.employeeId) throw new Error('Only document owner can acknowledge');
    const updated = await this.prisma.employeeDocument.update({
      where: { id },
      data: { acknowledgedAt: this.dates.now(), updatedBy: actor.userId },
    });
    await this.audit.record(actor, {
      entityType: 'EmployeeDocument',
      entityId: id,
      action: 'document_acknowledged',
    });
    return updated;
  }

  async listRequiredMissing(actor: ActorContext) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) return REQUIRED_DOC_TYPES;
    const docs = await this.prisma.employeeDocument.findMany({
      where: { employeeId: access.employeeId, deletedAt: null },
      select: { docType: true },
    });
    const present = new Set(docs.map((d) => d.docType));
    return REQUIRED_DOC_TYPES.filter((t) => !present.has(t));
  }

  async listExpiring(actor: ActorContext, withinDays = 30) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) return [];
    const now = this.dates.now();
    const threshold = this.dates.addDays(now, withinDays);
    return this.prisma.employeeDocument.findMany({
      where: {
        employeeId: access.employeeId,
        deletedAt: null,
        expiresAt: { lte: threshold, gte: now },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  private async assertUploadAccess(actor: ActorContext, employeeId: string) {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null },
      orderBy: { isPrimaryCompany: 'desc' },
      select: { companyId: true },
    });
    if (!assignment) throw new Error('Employee not found');
    const access = await this.permissions.findUserAccess(actor.userId);
    const isSelf = access?.employeeId === employeeId;
    if (!isSelf) {
      await this.companyAccess.assertCompanyAccess(actor, assignment.companyId);
    }
  }

  private async assertDocumentAccess(actor: ActorContext, employeeId: string) {
    const access = await this.permissions.findUserAccess(actor.userId);
    const isSelf = access?.employeeId === employeeId;
    if (!isSelf) {
      const assignment = await this.prisma.employeeAssignment.findFirst({
        where: { employeeId, effectiveTo: null, deletedAt: null },
        select: { companyId: true },
      });
      if (assignment) await this.companyAccess.assertCompanyAccess(actor, assignment.companyId);
    }
  }
}
