const path = require('path');
const {
    allocateUploadedFile,
    assertPdfUpload,
    buildUploadKey,
    finalizeStagedFile,
    getLocalFilePath,
    getS3KeyFromUrl,
    registerStagedFile,
} = require('../../services/signature/storage');
const {
    effectiveRange,
    fileHeaders,
    notModified,
    parseRange,
    safeFilename,
    sendSignatureFile,
    strongEtag,
} = require('../../services/signature/file-delivery');

describe('signature local storage boundary', () => {
    it('resolves stored upload URLs under the backend uploads root', () => {
        const resolved = getLocalFilePath('/uploads/signatures/document.pdf');
        expect(resolved).toBe(path.resolve(__dirname, '../../../uploads/signatures/document.pdf'));
    });

    it('rejects traversal and non-upload URLs', () => {
        expect(getLocalFilePath('/uploads/../../secrets.env')).toBeNull();
        expect(getLocalFilePath('/uploads/signatures/../secrets.env')).toBeNull();
        expect(getLocalFilePath('/uploads/logos/public.png')).toBeNull();
        expect(getLocalFilePath('https://example.com/document.pdf')).toBeNull();
    });

    it('accepts actual PDF bytes and rejects MIME-spoofed content', async () => {
        const pdf = { buffer: Buffer.from('%PDF-1.7\ncontent'), mimetype: 'text/html' };
        await expect(assertPdfUpload(pdf)).resolves.toBe(pdf);
        expect(pdf.mimetype).toBe('application/pdf');
        await expect(assertPdfUpload({ buffer: Buffer.from('<html>not a pdf</html>') }))
            .rejects.toMatchObject({ code: 'INVALID_FILE_CONTENT' });
    });

    it('forces PDF storage keys and accepts only owned signature S3 keys', () => {
        expect(buildUploadKey(7, 9, 'payload.html')).toMatch(/^signatures\/7\/9\/payload-.*\.pdf$/);
        expect(getS3KeyFromUrl('https://itemize-uploads.s3.us-west-2.amazonaws.com/signatures/7/9/file.pdf'))
            .toBe('signatures/7/9/file.pdf');
        expect(getS3KeyFromUrl('https://itemize-uploads.s3.us-west-2.amazonaws.com/logos/file.png')).toBeNull();
        expect(getS3KeyFromUrl('https://attacker.example/signatures/7/9/file.pdf')).toBeNull();
        expect(getS3KeyFromUrl('https://itemize-uploads.s3.attacker.example/signatures/7/9/file.pdf')).toBeNull();
    });

    it('registers a delayed cleanup receipt before finalization', async () => {
        const allocation = allocateUploadedFile(7, 9, 'agreement.pdf');
        expect(allocation).toMatchObject({
            fileUrl: expect.stringMatching(/^\/uploads\/signatures\/agreement-.*\.pdf$/),
            key: null,
        });
        const database = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        await registerStagedFile(database, 7, 9, allocation.fileUrl);
        await finalizeStagedFile(database, 7, allocation.fileUrl);
        expect(database.query.mock.calls[0][0]).toContain("INTERVAL '1 hour'");
        expect(database.query.mock.calls[0][1]).toEqual([7, 9, allocation.fileUrl]);
        expect(database.query.mock.calls[1][0]).toContain(
            'DELETE FROM signature_file_deletion_jobs'
        );
        expect(database.query.mock.calls[1][1]).toEqual([7, allocation.fileUrl]);
    });

    it('sets private PDF delivery headers and sanitizes filenames', () => {
        expect(safeFilename('../../evil".html')).toBe('evil_.html.pdf');
        expect(fileHeaders('contract.pdf', 'attachment')).toMatchObject({
            'Cache-Control': 'private, no-store',
            'Accept-Ranges': 'bytes',
            'Content-Disposition': 'attachment; filename="contract.pdf"',
            'Content-Type': 'application/pdf',
            'X-Content-Type-Options': 'nosniff',
        });
    });

    it('normalizes single ranges and applies evidence-backed validators', () => {
        const etag = strongEtag('a'.repeat(64));
        expect(etag).toBe(`"sha256-${'a'.repeat(64)}"`);
        expect(parseRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
        expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
        expect(parseRange('bytes=10-', 10)).toBe(false);
        expect(parseRange('bytes=0-1,3-4', 10)).toBe(false);
        expect(notModified(`W/${etag}`, etag)).toBe(true);
        expect(effectiveRange({ range: 'bytes=0-2', ifRange: etag }, etag))
            .toBe('bytes=0-2');
        expect(effectiveRange({ range: 'bytes=0-2', ifRange: '"stale"' }, etag))
            .toBeNull();
    });

    it('refuses arbitrary remote file URLs instead of fetching them server-side', async () => {
        await expect(sendSignatureFile({}, 'http://127.0.0.1:5432/private'))
            .resolves.toBe(false);
    });
});
