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
});
