// ============================================================================
// shared/storage/document-storage.module.ts
// DOC-001 — configurable document storage driver
// ============================================================================

import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DOCUMENT_STORAGE, DocumentStorageService } from './document-storage.interface';
import { LocalDocumentStorageService } from './local-document-storage.service';
import { S3DocumentStorageService } from './s3-document-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    LocalDocumentStorageService,
    S3DocumentStorageService,
    {
      provide: DOCUMENT_STORAGE,
      inject: [ConfigService, LocalDocumentStorageService, S3DocumentStorageService],
      useFactory: (
        config: ConfigService,
        local: LocalDocumentStorageService,
        s3: S3DocumentStorageService,
      ): DocumentStorageService => {
        const driver = (config.get<string>('DOCUMENT_STORAGE_DRIVER') ?? 'local').toLowerCase();
        if (driver === 's3') return s3;
        const basePath = config.get<string>('DOCUMENT_STORAGE_BASE_PATH');
        if (basePath) local.setBasePath(basePath);
        return local;
      },
    },
  ],
  exports: [DOCUMENT_STORAGE, LocalDocumentStorageService],
})
export class DocumentStorageModule {}
