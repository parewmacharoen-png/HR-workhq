// ============================================================================
// shared/storage/s3-document-storage.service.ts
// DOC-001 — S3 document storage (AWS S3 or any S3-compatible endpoint)
//
// Env:
//   DOCUMENT_STORAGE_DRIVER=s3
//   DOCUMENT_STORAGE_BUCKET      bucket name (required)
//   DOCUMENT_STORAGE_REGION      defaults to AWS_REGION, then ap-southeast-1
//   DOCUMENT_STORAGE_PREFIX      optional key prefix, e.g. "prod/"
//   DOCUMENT_STORAGE_ENDPOINT    optional, for S3-compatible services (R2, Spaces)
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  picked up by the SDK default chain
//
// Objects are private and encrypted at rest (SSE-S3). Files are only ever
// served through the API after a permission check — never via public URLs.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { DocumentStorageService } from './document-storage.interface';

@Injectable()
export class S3DocumentStorageService implements DocumentStorageService {
  private readonly logger = new Logger(S3DocumentStorageService.name);
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  private get bucket(): string {
    const bucket = this.config.get<string>('DOCUMENT_STORAGE_BUCKET');
    if (!bucket) throw new Error('DOCUMENT_STORAGE_BUCKET is required when DOCUMENT_STORAGE_DRIVER=s3');
    return bucket;
  }

  private objectKey(relativeKey: string): string {
    const prefix = this.config.get<string>('DOCUMENT_STORAGE_PREFIX') ?? '';
    return `${prefix}${relativeKey.replace(/^\/+/, '')}`;
  }

  /** Lazily built so the local driver never needs AWS config. */
  private getClient(): S3Client {
    if (!this.client) {
      const endpoint = this.config.get<string>('DOCUMENT_STORAGE_ENDPOINT') || undefined;
      this.client = new S3Client({
        region:
          this.config.get<string>('DOCUMENT_STORAGE_REGION') ??
          this.config.get<string>('AWS_REGION') ??
          'ap-southeast-1',
        endpoint,
        forcePathStyle: Boolean(endpoint),
      });
    }
    return this.client;
  }

  async save(relativeKey: string, buffer: Buffer): Promise<string> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(relativeKey),
        Body: buffer,
        ServerSideEncryption: 'AES256',
      }),
    );
    this.logger.log(`Saved document to S3: ${relativeKey}`);
    return relativeKey;
  }

  async read(relativeKey: string): Promise<Buffer> {
    const res = await this.getClient().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(relativeKey) }),
    );
    if (!res.Body) throw new Error(`Empty S3 object: ${relativeKey}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(relativeKey: string): Promise<void> {
    await this.getClient().send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(relativeKey) }),
    );
  }
}
