import {
  Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { DocumentType } from '@prisma/client';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { DocumentCenterService } from '../../application/document-center.service';
import { UploadDocumentDto } from '../../application/dto/document-center.dto';

@Controller()
export class DocumentCenterController {
  constructor(private readonly service: DocumentCenterService) {}

  @Get('documents/my')
  @RequirePermission('document:read')
  listMy(@CurrentActor() actor: ActorContext) {
    return this.service.listMyDocuments(actor);
  }

  @Get('documents/my/required-missing')
  @RequirePermission('document:read')
  listRequiredMissing(@CurrentActor() actor: ActorContext) {
    return this.service.listRequiredMissing(actor);
  }

  @Get('documents/my/expiring')
  @RequirePermission('document:read')
  listExpiring(@CurrentActor() actor: ActorContext) {
    return this.service.listExpiring(actor);
  }

  @Get('documents/employees/:id')
  @RequirePermission('document:read')
  listEmployee(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.listEmployeeDocuments(actor, id);
  }

  @Get('documents/employees/:id/summary')
  @RequirePermission('document:read')
  employeeSummary(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getEmployeeDocumentSummary(actor, id);
  }

  @Post('documents')
  @RequirePermission('document:write')
  upload(@CurrentActor() actor: ActorContext, @Body() dto: UploadDocumentDto) {
    return this.service.uploadDocument(actor, dto);
  }

  @Post('documents/upload')
  @RequirePermission('document:write')
  @UseInterceptors(FileInterceptor('file'))
  uploadMultipart(
    @CurrentActor() actor: ActorContext,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Body('employeeId') employeeId: string,
    @Body('docType') docType: DocumentType,
    @Body('expiresAt') expiresAt?: string,
  ) {
    if (!file) throw new Error('File required');
    return this.service.uploadMultipart(actor, employeeId, docType, file, expiresAt);
  }

  @Get('documents/dashboard')
  @RequirePermission('document:read')
  dashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.service.getDashboard(actor, companyId);
  }

  @Get('knowledge')
  @RequirePermission('document:read')
  listKnowledge(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.listKnowledgeArticles(actor, companyId);
  }

  @Get('training')
  @RequirePermission('document:read')
  listTraining() {
    return this.service.listTrainingLibrary();
  }

  @Get('documents/:id/versions')
  @RequirePermission('document:read')
  listVersions(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.listVersions(actor, id);
  }

  @Get('documents/:id')
  @RequirePermission('document:read')
  getDocument(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getDocument(actor, id);
  }

  @Get('documents/:id/download')
  @RequirePermission('document:read')
  async download(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Query('version') version: string | undefined,
    @Res() res: Response,
  ) {
    const versionNumber = version ? Number(version) : undefined;
    const { buffer, fileName, mimeType } = await this.service.downloadDocument(actor, id, versionNumber);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Post('documents/:id/acknowledge')
  @RequirePermission('document:read')
  acknowledge(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.acknowledgeDocument(actor, id);
  }

  @Delete('documents/:id')
  @RequirePermission('document:write')
  deleteDocument(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.deleteDocument(actor, id);
  }
}
