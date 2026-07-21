import { LegacyInvoiceLogoStorage } from './invoice-logo-storage.provider';

describe('LegacyInvoiceLogoStorage', () => {
  const deleteFile = jest.fn();
  const uploadFile = jest.fn();
  class TestStorage extends LegacyInvoiceLogoStorage {
    protected s3Service() {
      return {
        bucket: 'itemize-test',
        region: 'us-west-2',
        isConfigured: true,
        uploadFile,
        deleteFile,
      };
    }
  }

  beforeEach(() => {
    deleteFile.mockReset().mockResolvedValue(undefined);
    uploadFile.mockReset().mockResolvedValue(
      'https://itemize-test.s3.us-west-2.amazonaws.com/logos/new.png',
    );
  });

  it('stores a bounded logo under the owned S3 prefix', async () => {
    const buffer = Buffer.from('png');
    await expect(new TestStorage().store({
      buffer, mimetype: 'image/png', extension: '.png', organizationId: 4,
      scope: 'business', resourceId: 7,
    })).resolves.toContain('itemize-test.s3.us-west-2.amazonaws.com/logos/');
    expect(uploadFile).toHaveBeenCalledWith(
      buffer, expect.stringMatching(/^logos\/logo-4-business-7-[\w-]+\.png$/), 'image/png',
    );
    const original = process.env.NODE_ENV;
    class NoS3Storage extends LegacyInvoiceLogoStorage {
      protected s3Service(): null { return null; }
    }
    process.env.NODE_ENV = 'production';
    try {
      await expect(new NoS3Storage().store({
        buffer: Buffer.from('png'), mimetype: 'image/png', extension: '.png',
        organizationId: 4, scope: 'settings', resourceId: null,
      })).rejects.toThrow('Shared invoice logo storage is unavailable');
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('deletes only a key on the configured S3 logo host', async () => {
    await expect(new TestStorage().remove(
      'https://itemize-test.s3.us-west-2.amazonaws.com/logos/logo-4.png',
    )).resolves.toEqual({ kind: 'deleted' });
    expect(deleteFile).toHaveBeenCalledWith('logos/logo-4.png');
  });

  it('rejects foreign, traversal, and non-logo URLs without storage access', async () => {
    for (const url of [
      'https://attacker.invalid/logos/logo-4.png',
      'https://itemize-test.s3.us-west-2.amazonaws.com/private/secret.txt',
      'https://itemize-test.s3.us-west-2.amazonaws.com/logos/../secret.txt',
      '/uploads/logos/../../secret.txt',
      '/uploads/logos/..',
      '/uploads/logos/.',
    ]) {
      await expect(new TestStorage().remove(url)).resolves.toMatchObject({
        kind: 'rejected',
      });
    }
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('treats an already-absent safe local logo as deleted', async () => {
    await expect(new TestStorage().remove(
      '/uploads/logos/definitely-absent-logo.png',
    )).resolves.toEqual({ kind: 'deleted' });
    expect(deleteFile).not.toHaveBeenCalled();
  });
});
