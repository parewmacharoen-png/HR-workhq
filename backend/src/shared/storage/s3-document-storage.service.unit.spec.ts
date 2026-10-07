import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3DocumentStorageService } from './s3-document-storage.service';

function configWith(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as never;
}

describe('S3DocumentStorageService', () => {
  let send: jest.SpyInstance;

  beforeEach(() => {
    send = jest.spyOn(S3Client.prototype, 'send');
  });

  afterEach(() => send.mockRestore());

  it('uploads privately with server-side encryption under the prefix', async () => {
    send.mockResolvedValue({});
    const storage = new S3DocumentStorageService(
      configWith({ DOCUMENT_STORAGE_BUCKET: 'docs', DOCUMENT_STORAGE_PREFIX: 'prod/' }),
    );

    await expect(storage.save('/emp-1/id.jpg', Buffer.from('x'))).resolves.toBe('/emp-1/id.jpg');

    const cmd = send.mock.calls[0][0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({
      Bucket: 'docs',
      Key: 'prod/emp-1/id.jpg',
      ServerSideEncryption: 'AES256',
    });
    expect(cmd.input).not.toHaveProperty('ACL');
  });

  it('reads the object body back into a Buffer', async () => {
    send.mockResolvedValue({ Body: { transformToByteArray: async () => new Uint8Array([104, 105]) } });
    const storage = new S3DocumentStorageService(configWith({ DOCUMENT_STORAGE_BUCKET: 'docs' }));

    const buf = await storage.read('emp-1/a.pdf');

    expect(buf.toString()).toBe('hi');
    expect((send.mock.calls[0][0] as GetObjectCommand).input).toEqual({ Bucket: 'docs', Key: 'emp-1/a.pdf' });
  });

  it('deletes by key', async () => {
    send.mockResolvedValue({});
    const storage = new S3DocumentStorageService(configWith({ DOCUMENT_STORAGE_BUCKET: 'docs' }));

    await storage.delete('emp-1/a.pdf');

    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('fails clearly when the bucket is not configured', async () => {
    const storage = new S3DocumentStorageService(configWith({}));
    await expect(storage.save('k', Buffer.from('x'))).rejects.toThrow(/DOCUMENT_STORAGE_BUCKET is required/);
    expect(send).not.toHaveBeenCalled();
  });
});
