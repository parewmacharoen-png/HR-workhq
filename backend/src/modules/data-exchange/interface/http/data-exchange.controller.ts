// ============================================================================
// Data Exchange HTTP controllers
// ============================================================================

import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ExportFormat, ExportMode, ImportSourceType } from '@prisma/client';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { ExportService } from '../../application/export.service';
import { ImportService } from '../../application/import.service';
import { ScheduledExportService } from '../../application/scheduled-export.service';
import { ReportTemplateService } from '../../application/report-template.service';
import { SavedReportService } from '../../application/saved-report.service';
import { UserExportPreferenceService } from '../../application/user-export-preference.service';
import { AiExportService } from '../../application/ai-export.service';
import { columnsForModule } from '../../domain/column-catalog';

@Controller('exports')
export class ExportController {
  constructor(
    private readonly exports: ExportService,
    private readonly preferences: UserExportPreferenceService,
  ) {}

  @Post()
  @RequirePermission('employee:export')
  create(@CurrentActor() actor: ActorContext, @Body() body: {
    module: string; companyId: string; format?: ExportFormat;
    mode?: ExportMode; shareMode?: string; filters?: Record<string, unknown>;
    columns?: string[]; reportTemplateId?: string; savedReportId?: string; async?: boolean;
  }) {
    return this.exports.create(actor, body);
  }

  @Get('columns/:module')
  @RequirePermission('settings:read')
  columns(@Param('module') module: string) {
    return columnsForModule(module);
  }

  @Get('preferences/:module')
  @RequirePermission('settings:read')
  preferencesGet(@CurrentActor() actor: ActorContext, @Param('module') module: string) {
    return this.preferences.get(actor, module);
  }

  @Post('preferences/:module')
  @RequirePermission('settings:read')
  preferencesSave(@CurrentActor() actor: ActorContext, @Param('module') module: string, @Body() body: Record<string, unknown>) {
    return this.preferences.save(actor, { module, ...body } as never);
  }

  @Get()
  @RequirePermission('settings:read')
  list(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.exports.list(actor, companyId);
  }

  @Get(':id')
  @RequirePermission('settings:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.exports.get(actor, id);
  }

  @Get(':id/download')
  @RequirePermission('settings:read')
  async download(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, fileName, mimeType } = await this.exports.getDownloadBuffer(actor, id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Post(':id/retry')
  @RequirePermission('settings:read')
  retry(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.exports.retry(actor, id);
  }

  @Post(':id/cancel')
  @RequirePermission('settings:read')
  cancel(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.exports.cancel(actor, id);
  }

  @Delete(':id')
  @RequirePermission('settings:read')
  delete(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.exports.deleteRecord(actor, id);
  }
}

@Controller('report-templates')
export class ReportTemplateController {
  constructor(private readonly templates: ReportTemplateService) {}

  @Get()
  @RequirePermission('settings:read')
  list(
    @CurrentActor() actor: ActorContext,
    @Query('module') module?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.templates.list(actor, module, companyId);
  }

  @Post()
  @RequirePermission('settings:read')
  create(@CurrentActor() actor: ActorContext, @Body() body: Record<string, unknown>) {
    return this.templates.create(actor, body as never);
  }

  @Post(':id/archive')
  @RequirePermission('settings:read')
  archive(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.templates.archive(actor, id);
  }
}

@Controller('saved-reports')
export class SavedReportController {
  constructor(private readonly reports: SavedReportService) {}

  @Get()
  @RequirePermission('settings:read')
  list(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('module') module?: string,
  ) {
    return this.reports.list(actor, companyId, module);
  }

  @Post()
  @RequirePermission('settings:read')
  create(@CurrentActor() actor: ActorContext, @Body() body: Record<string, unknown>) {
    return this.reports.create(actor, body as never);
  }

  @Patch(':id')
  @RequirePermission('settings:read')
  update(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.reports.update(actor, id, body as never);
  }

  @Post(':id/run')
  @RequirePermission('settings:read')
  run(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.reports.run(actor, id);
  }

  @Post(':id/favorite')
  @RequirePermission('settings:read')
  favorite(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body('isFavorite') isFavorite: boolean) {
    return this.reports.favorite(actor, id, isFavorite);
  }
}

@Controller('imports')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Get('templates/:module')
  @RequirePermission('settings:read')
  template(@Param('module') module: string, @Query('format') format: 'csv' | 'xlsx' = 'csv') {
    return this.imports.getTemplate(module, format);
  }

  @Post()
  @RequirePermission('settings:read')
  create(@CurrentActor() actor: ActorContext, @Body() body: {
    module: string; companyId: string; sourceType: ImportSourceType; sourceUrl?: string;
  }) {
    return this.imports.create(actor, body);
  }

  @Get()
  @RequirePermission('settings:read')
  list(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.imports.list(actor, companyId);
  }

  @Get(':id/preview')
  @RequirePermission('settings:read')
  preview(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.imports.preview(actor, id);
  }

  @Get(':id/error-report')
  @RequirePermission('settings:read')
  async errorReport(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const report = await this.imports.errorReport(actor, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
    res.send(report.content);
  }

  @Get(':id')
  @RequirePermission('settings:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.imports.get(actor, id);
  }

  @Post(':id/upload')
  @RequirePermission('settings:read')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
  ) {
    return this.imports.parseBuffer(actor, id, file.buffer, file.originalname);
  }

  @Post(':id/map')
  @RequirePermission('settings:read')
  map(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() body: { mapping: Record<string, string>; duplicateStrategy?: string },
  ) {
    return this.imports.mapColumns(actor, id, body.mapping, body.duplicateStrategy);
  }

  @Post(':id/apply')
  @RequirePermission('settings:read')
  apply(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.imports.apply(actor, id);
  }

  @Post(':id/rollback')
  @RequirePermission('settings:read')
  rollback(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.imports.rollback(actor, id);
  }

  @Post(':id/cancel')
  @RequirePermission('settings:read')
  cancel(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.imports.cancel(actor, id);
  }
}

@Controller('scheduled-exports')
export class ScheduledExportController {
  constructor(private readonly scheduled: ScheduledExportService) {}

  @Post()
  @RequirePermission('settings:read')
  create(@CurrentActor() actor: ActorContext, @Body() body: {
    companyId: string; module: string; scheduleCron: string; format?: ExportFormat;
    filters?: Record<string, unknown>; shareMode?: string; savedReportId?: string;
    reportTemplateId?: string; columns?: string[];
  }) {
    return this.scheduled.create(actor, body);
  }

  @Get()
  @RequirePermission('settings:read')
  list(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.scheduled.list(actor, companyId);
  }

  @Get(':id')
  @RequirePermission('settings:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.scheduled.get(actor, id);
  }

  @Patch(':id')
  @RequirePermission('settings:read')
  update(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.scheduled.update(actor, id, body as never);
  }

  @Post(':id/run-now')
  @RequirePermission('settings:read')
  runNow(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.scheduled.runNow(actor, id);
  }

  @Post(':id/enable')
  @RequirePermission('settings:read')
  enable(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.scheduled.enable(actor, id);
  }

  @Post(':id/disable')
  @RequirePermission('settings:read')
  disable(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.scheduled.disable(actor, id);
  }

  @Delete(':id')
  @RequirePermission('settings:read')
  delete(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.scheduled.delete(actor, id);
  }
}

@Controller('ai/export')
export class AiExportController {
  constructor(private readonly aiExport: AiExportService) {}

  @Post('parse')
  @RequirePermission('settings:read')
  parse(@CurrentActor() actor: ActorContext, @Body() body: { companyId: string; prompt: string }) {
    return this.aiExport.parse(actor, body.companyId, body.prompt);
  }

  @Post(':id/confirm')
  @RequirePermission('settings:read')
  confirm(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.aiExport.confirm(actor, id);
  }

  @Post(':id/cancel')
  @RequirePermission('settings:read')
  cancel(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.aiExport.cancel(actor, id);
  }
}
