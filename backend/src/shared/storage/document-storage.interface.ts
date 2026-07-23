// ============================================================================
// shared/storage/document-storage.interface.ts
// DOC-001 — storage abstraction (local | s3)
// ============================================================================

export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');

export interface DocumentStorageService {
  save(relativeKey: string, buffer: Buffer): Promise<string>;
  read(relativeKey: string): Promise<Buffer>;
  delete?(relativeKey: string): Promise<void>;
}
