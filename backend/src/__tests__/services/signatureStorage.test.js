const path = require('path');
const {
    assertPdfUpload,
    buildUploadKey,
    getLocalFilePath,
    getS3KeyFromUrl,
} = require('../../services/signature/storage');
const { fileHeaders, safeFilename, sendSignatureFile } = require('../../services/signature/file-delivery');

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

    it('sets private PDF delivery headers and sanitizes filenames', () => {
        expect(safeFilename('../../evil".html')).toBe('evil_.html.pdf');
        expect(fileHeaders('contract.pdf', 'attachment')).toMatchObject({
            'Cache-Control': 'private, no-store',
            'Content-Disposition': 'attachment; filename="contract.pdf"',
            'Content-Type': 'application/pdf',
            'X-Content-Type-Options': 'nosniff',
        });
    });

    it('refuses arbitrary remote file URLs instead of fetching them server-side', async () => {
        await expect(sendSignatureFile({}, 'http://127.0.0.1:5432/private'))
            .resolves.toBe(false);
    });
});
