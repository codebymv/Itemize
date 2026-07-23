import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { LegacySignatureFileStorage } from './signature-file-storage.provider';

describe('LegacySignatureFileStorage', () => {
  const getFile = jest.fn();
  const deleteFile = jest.fn();
  const uploadFile = jest.fn();
  const s3 = {
    bucket: 'private-itemize',
    region: 'us-west-2',
    isConfigured: true,
    getFile,
    deleteFile,
    uploadFile,
  };
  class TestStorage extends LegacySignatureFileStorage {
    protected override s3Service() {
      return s3;
    }
  }
  const storage = new TestStorage();

  beforeEach(() => {
    jest.clearAllMocks();
    getFile.mockResolvedValue({
      Body: { transformToByteArray: async () => Buffer.from('%PDF-1.7') },
    });
    deleteFile.mockResolvedValue(undefined);
    uploadFile.mockResolvedValue(
      'https://private-itemize.s3.us-west-2.amazonaws.com/signatures/new.pdf',
    );
  });

  it('stores under an unguessable signature key', async () => {
    await storage.store({
      buffer: Buffer.from('%PDF-1.7'),
      organizationId: 4,
      resourceId: 7,
      scope: 'document',
    });
    expect(uploadFile).toHaveBeenCalledWith(
      Buffer.from('%PDF-1.7'),
      expect.stringMatching(
        /^signatures\/signature-4-document-7-[0-9a-f-]+\.pdf$/,
      ),
      'application/pdf',
    );
  });

  it('reads and removes only the exact configured S3 host and prefix', async () => {
    const url =
      'https://private-itemize.s3.us-west-2.amazonaws.com/signatures/owned.pdf';
    await expect(storage.read(url)).resolves.toEqual(Buffer.from('%PDF-1.7'));
    expect(getFile).toHaveBeenCalledWith('signatures/owned.pdf');
    await expect(storage.remove(url)).resolves.toBeUndefined();
    expect(deleteFile).toHaveBeenCalledWith('signatures/owned.pdf');
  });

  it('rejects traversal, lookalike hosts, other prefixes, and arbitrary URLs', async () => {
    const rejected = [
      '/uploads/signatures/../secret.pdf',
      'https://private-itemize.s3.us-west-2.amazonaws.com/signatures/../secret.pdf',
      'https://private-itemize.s3.us-west-2.amazonaws.com/logos/file.pdf',
      'https://private-itemize.s3.us-west-2.amazonaws.com.evil.test/signatures/file.pdf',
      'https://example.test/signatures/file.pdf',
    ];
    for (const url of rejected) {
      await expect(storage.read(url)).resolves.toBeNull();
      await expect(storage.remove(url)).rejects.toThrow('not server-owned');
    }
    expect(getFile).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('uses a self-contained private S3 client when the legacy backend is absent', async () => {
    const previous = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
      bucket: process.env.AWS_S3_BUCKET,
      region: process.env.AWS_REGION,
    };
    process.env.AWS_ACCESS_KEY_ID = 'test-access';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
    process.env.AWS_SESSION_TOKEN = 'test-session';
    process.env.AWS_S3_BUCKET = 'standalone-private';
    process.env.AWS_REGION = 'us-east-1';
    const send = jest.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        return {
          Body: {
            transformToByteArray: async () => Buffer.from('%PDF-native'),
          },
        };
      }
      return {};
    });
    class NativeStorage extends LegacySignatureFileStorage {
      protected override legacyS3Service() {
        return null;
      }
      protected override createS3Client() {
        return { send } as never;
      }
    }
    try {
      const native = new NativeStorage();
      const url = await native.store({
        buffer: Buffer.from('%PDF-native'),
        organizationId: 9,
        resourceId: 12,
        scope: 'document',
      });
      expect(url).toMatch(
        /^https:\/\/standalone-private\.s3\.us-east-1\.amazonaws\.com\/signatures\/signature-9-document-12-[0-9a-f-]+\.pdf$/,
      );
      await expect(native.read(url)).resolves.toEqual(
        Buffer.from('%PDF-native'),
      );
      await expect(native.remove(url)).resolves.toBeUndefined();
      expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
      expect((send.mock.calls[0][0] as PutObjectCommand).input).toMatchObject({
        Bucket: 'standalone-private',
        ContentType: 'application/pdf',
        ServerSideEncryption: 'AES256',
      });
      expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
      expect(send.mock.calls[2][0]).toBeInstanceOf(DeleteObjectCommand);
    } finally {
      const restore = (
        key: keyof typeof previous,
        environmentKey: string,
      ) => {
        const value = previous[key];
        if (value === undefined) delete process.env[environmentKey];
        else process.env[environmentKey] = value;
      };
      restore('accessKeyId', 'AWS_ACCESS_KEY_ID');
      restore('secretAccessKey', 'AWS_SECRET_ACCESS_KEY');
      restore('sessionToken', 'AWS_SESSION_TOKEN');
      restore('bucket', 'AWS_S3_BUCKET');
      restore('region', 'AWS_REGION');
    }
  });
});
