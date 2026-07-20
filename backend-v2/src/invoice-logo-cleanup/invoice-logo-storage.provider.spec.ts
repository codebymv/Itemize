import { LegacyInvoiceLogoStorage } from './invoice-logo-storage.provider';

describe('LegacyInvoiceLogoStorage', () => {
  const deleteFile = jest.fn();
  class TestStorage extends LegacyInvoiceLogoStorage {
    protected s3Service() {
      return {
        bucket: 'itemize-test',
        region: 'us-west-2',
        deleteFile,
      };
    }
  }

  beforeEach(() => deleteFile.mockReset().mockResolvedValue(undefined));

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
