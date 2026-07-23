// ============================================================================
// shared/storage/s3-document-storage.service.ts
// DOC-001 — S3 placeholder (configure DOCUMENT_STORAGE_DRIVER=s3 when ready)
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DocumentStorageService } from './document-storage.interface';

@Injectable()
export class S3DocumentStorageService implements DocumentStorageService {
  private readonly logger = new Logger(S3DocumentStorageService.name);

  constructor(private readonly config: ConfigService) {
    const bucket = this.config.get<string>('DOCUMENT_STORAGE_BUCKET');
    this.logger.warn(
      `S3DocumentStorageService is a placeholder — bucket=${bucket ?? '(unset)'}. ` +
      'Implement AWS SDK upload/download before production use.',
    );
  }

  async save(_relativeKey: string, _buffer: Buffer): Promise<string> {
    throw new Error('S3 document storage not implemented — set DOCUMENT_STORAGE_DRIVER=local');
  }

  async read(_relativeKey: string): Promise<Buffer> {
    throw new Error('S3 document storage not implemented — set DOCUMENT_STORAGE_DRIVER=local');
  }
}
