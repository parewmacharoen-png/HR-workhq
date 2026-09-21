import { Module, forwardRef } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module';
import { TelegramModule } from '../telegram/telegram.module';
import {
  ExportController,
  ImportController,
  ScheduledExportController,
  ReportTemplateController,
  SavedReportController,
  AiExportController,
} from './interface/http/data-exchange.controller';
import { ExportService } from './application/export.service';
import { EXPORT_SERVICE } from './application/export.service.token';
import { ImportService, ImportAccessService } from './application/import.service';
import { ScheduledExportService } from './application/scheduled-export.service';
import { ExportAccessService } from './application/export-access.service';
import { ExportRedactionService } from './application/export-redaction.service';
import { ExportDatasetRegistry, EmployeeExportProvider, AuditExportProvider, LeaveExportProvider } from './application/export-dataset.registry';
import { CsvExportDriver } from './application/drivers/csv-export.driver';
import { ExcelExportDriver } from './application/drivers/excel-export.driver';
import { PdfExportDriver } from './application/drivers/pdf-export.driver';
import { GoogleSheetsExportDriver } from './application/drivers/google-sheets-export.driver';
import { ExportTelegramNotifier } from './infrastructure/export-telegram.notifier';
import { ExportQueueService } from './application/export-queue.service';
import { ReportTemplateService } from './application/report-template.service';
import { SavedReportService } from './application/saved-report.service';
import { UserExportPreferenceService } from './application/user-export-preference.service';
import { AiExportService } from './application/ai-export.service';

@Module({
  imports: [PermissionModule, forwardRef(() => TelegramModule)],
  controllers: [
    ExportController,
    ImportController,
    ScheduledExportController,
    ReportTemplateController,
    SavedReportController,
    AiExportController,
  ],
  providers: [
    ExportService,
    { provide: EXPORT_SERVICE, useExisting: ExportService },
    ExportQueueService,
    ImportService,
    ImportAccessService,
    ScheduledExportService,
    ExportAccessService,
    ExportRedactionService,
    ExportDatasetRegistry,
    EmployeeExportProvider,
    AuditExportProvider,
    LeaveExportProvider,
    CsvExportDriver,
    ExcelExportDriver,
    PdfExportDriver,
    GoogleSheetsExportDriver,
    ExportTelegramNotifier,
    ReportTemplateService,
    SavedReportService,
    UserExportPreferenceService,
    AiExportService,
  ],
  exports: [ExportService, ImportService, ScheduledExportService],
})
export class DataExchangeModule {}
