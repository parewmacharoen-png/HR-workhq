import { Module, forwardRef } from '@nestjs/common';
import { EmployeeModule } from '../employee/employee.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { TelegramModule } from '../telegram/telegram.module';
import { DocumentStorageModule } from '../../shared/storage/document-storage.module';
import { DocumentRequestService } from './application/document-request.service';
import { DocumentPdfService } from './application/document-pdf.service';
import { DocumentRequestController } from './interface/http/document-request.controller';

@Module({
  imports: [
    forwardRef(() => EmployeeModule),
    WorkflowModule,
    DocumentStorageModule,
    forwardRef(() => TelegramModule),
  ],
  controllers: [DocumentRequestController],
  providers: [DocumentRequestService, DocumentPdfService],
  exports: [DocumentRequestService, DocumentPdfService],
})
export class DocumentRequestModule {}
