import { Module, forwardRef } from '@nestjs/common';
import { PermissionModule } from '../permission/permission.module';
import { TelegramModule } from '../telegram/telegram.module';
import { DocumentRequestModule } from '../document-request/document-request.module';
import { DocumentStorageModule } from '../../shared/storage/document-storage.module';
import { DocumentCenterController } from './interface/http/document-center.controller';
import { DocumentCenterService } from './application/document-center.service';
import { DocumentCenterTelegramHandler } from './application/document-center.handler';

@Module({
  imports: [
    PermissionModule,
    DocumentStorageModule,
    forwardRef(() => TelegramModule),
    DocumentRequestModule,
  ],
  controllers: [DocumentCenterController],
  providers: [DocumentCenterService, DocumentCenterTelegramHandler],
  exports: [DocumentCenterService, DocumentCenterTelegramHandler],
})
export class DocumentCenterModule {}
