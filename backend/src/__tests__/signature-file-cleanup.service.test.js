const {
    SignatureFileCleanupService,
    redactedError,
} = require('../services/signature-file-cleanup.service');

describe('SignatureFileCleanupService', () => {
    const claim = {
        id: 7,
        organization_id: 3,
        document_id: 9,
        file_url: '/uploads/signatures/owned.pdf',
        attempt_count: 1,
    };

    test('deletes only validated local and S3 storage locators', async () => {
        const unlink = jest.fn().mockResolvedValue(undefined);
        const s3 = { isConfigured: true, deleteFile: jest.fn().mockResolvedValue(undefined) };
        const service = new SignatureFileCleanupService({}, {
            unlink,
            s3Service: s3,
            getLocalFilePath: value => value === claim.file_url ? 'C:\\safe\\owned.pdf' : null,
            getS3KeyFromUrl: value => value === 'https://owned.test/signatures/key.pdf'
                ? 'signatures/key.pdf' : null,
        });

        await service.removeOwnedFile(claim.file_url);
        expect(unlink).toHaveBeenCalledWith('C:\\safe\\owned.pdf');
        await service.removeOwnedFile('https://owned.test/signatures/key.pdf');
        expect(s3.deleteFile).toHaveBeenCalledWith('signatures/key.pdf');
        await expect(service.removeOwnedFile('https://attacker.test/file.pdf'))
            .rejects.toMatchObject({ retryable: false });
    });

    test('treats an already absent local file as successful deletion', async () => {
        const service = new SignatureFileCleanupService({}, {
            unlink: jest.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
            getLocalFilePath: () => 'C:\\safe\\missing.pdf',
            s3Service: null,
        });
        await expect(service.removeOwnedFile(claim.file_url)).resolves.toBeUndefined();
    });

    test('defers referenced storage and completes an unreferenced leased claim', async () => {
        const service = new SignatureFileCleanupService({});
        jest.spyOn(service, 'claim')
            .mockResolvedValueOnce(claim)
            .mockResolvedValueOnce({ ...claim, id: 8 })
            .mockResolvedValue(null);
        jest.spyOn(service, 'isReferenced')
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false);
        jest.spyOn(service, 'defer').mockResolvedValue(undefined);
        jest.spyOn(service, 'removeOwnedFile').mockResolvedValue(undefined);
        jest.spyOn(service, 'complete').mockResolvedValue(undefined);

        await expect(service.run()).resolves.toEqual({
            claimed: 2, deleted: 1, deferred: 1, retry: 0, deadLetter: 0,
        });
    });

    test('treats immutable document versions as live storage references', async () => {
        const query = jest.fn().mockResolvedValue({ rows: [{ referenced: true }] });
        const service = new SignatureFileCleanupService({ query });
        await expect(service.isReferenced(claim.file_url)).resolves.toBe(true);
        expect(query.mock.calls[0][0]).toContain(
            'SELECT 1 FROM signature_document_versions WHERE file_url=$1'
        );
        expect(query).toHaveBeenCalledWith(expect.any(String), [claim.file_url]);
    });

    test('redacts stored failures and classifies unowned storage as terminal', async () => {
        expect(redactedError(
            new Error('delete https://bucket.test/private.pdf for signer@example.com sk-secret'),
        )).toBe('delete [redacted-url] for [redacted-email] [redacted-secret]');
        const service = new SignatureFileCleanupService({});
        jest.spyOn(service, 'claim').mockResolvedValueOnce(claim);
        jest.spyOn(service, 'isReferenced').mockResolvedValue(false);
        jest.spyOn(service, 'removeOwnedFile').mockRejectedValue(
            Object.assign(new Error('unowned'), { retryable: false }),
        );
        jest.spyOn(service, 'fail').mockResolvedValue('dead_letter');
        await expect(service.run({ jobId: 7 })).resolves.toMatchObject({
            claimed: 1, deadLetter: 1,
        });
        expect(service.fail).toHaveBeenCalledWith(claim, expect.any(Error), false, 5);
    });
});
