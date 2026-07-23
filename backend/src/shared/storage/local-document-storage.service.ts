// ============================================================================
// shared/storage/local-document-storage.service.ts
// DOC-001 / DOC-002b — local file storage for employee documents
// ============================================================================

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { DocumentStorageService } from './document-storage.interface';

@Injectable()
export class LocalDocumentStorageService implements DocumentStorageService, OnModuleInit {
  private readonly logger = new Logger(LocalDocumentStorageService.name);
  private baseDir = join(process.cwd(), 'storage', 'documents');

  setBasePath(path: string): void {
    this.baseDir = path;
  }

  async onModuleInit(): Promise<void> {
    try {
      await mkdir(this.baseDir, { recursive: true });
    } catch (err) {
      this.logger.error(`Document storage not writable at ${this.baseDir}`, err);
    }
  }

  async save(relativeKey: string, buffer: Buffer): Promise<string> {
    const fullPath = join(this.baseDir, relativeKey);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    this.logger.log(`Saved document: ${relativeKey}`);
    return relativeKey;
  }

  async read(relativeKey: string): Promise<Buffer> {
    return readFile(join(this.baseDir, relativeKey));
  }

  resolvePath(relativeKey: string): string {
    return join(this.baseDir, relativeKey);
  }
}
