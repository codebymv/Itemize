const express = require('express');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

jest.mock('../../middleware/organization', () => () => ({
    requireOrganization: (req, _res, next) => {
        req.organizationId = 7;
        req.user = { id: 3 };
        next();
    },
}));

jest.mock('../../services/signature.service', () => ({
    getDocumentDetails: jest.fn(),
    getTemplate: jest.fn(),
    uploadDocument: jest.fn(),
    uploadTemplateFile: jest.fn(),
}));

const signatureService = require('../../services/signature.service');
const createSignatureRoutes = require('../../routes/signatures.routes');

const pass = (_req, _res, next) => next();
const signaturesDir = path.resolve(__dirname, '../../../uploads/signatures');

function createApp() {
    const pool = {
        query: jest.fn().mockResolvedValue({ rows: [{ plan: 'starter' }] }),
    };
    const app = express();
    app.use(express.json());
    app.use('/api', createSignatureRoutes(pool, pass, pass));
    return app;
}

describe('signature file transport routes', () => {
    let app;
    let filename;
    let fileUrl;

    beforeAll(async () => {
        await fs.promises.mkdir(signaturesDir, { recursive: true });
        filename = `route-test-${process.pid}-${Date.now()}.pdf`;
        fileUrl = `/uploads/signatures/${filename}`;
        await fs.promises.writeFile(path.join(signaturesDir, filename), Buffer.from('%PDF-route-test'));
        app = createApp();
    });

    afterEach(() => jest.clearAllMocks());

    afterAll(async () => {
        await fs.promises.unlink(path.join(signaturesDir, filename)).catch(() => null);
        const files = await fs.promises.readdir(signaturesDir).catch(() => []);
        await Promise.all(files
            .filter(name => name.startsWith('signature-7-') && name.endsWith('.pdf'))
            .map(name => fs.promises.unlink(path.join(signaturesDir, name)).catch(() => null)));
    });

    it('streams an organization-authorized PDF with private hardened headers', async () => {
        signatureService.getDocumentDetails.mockResolvedValue({
            document: { file_url: fileUrl, file_name: 'Customer contract.pdf' },
        });

        const response = await request(app).get('/api/signatures/documents/12/file');
        expect(response.status).toBe(200);
        expect(response.headers).toMatchObject({
            'cache-control': 'private, no-store',
            'content-disposition': 'inline; filename="Customer contract.pdf"',
            'content-type': 'application/pdf',
            'x-content-type-options': 'nosniff',
        });
        expect(response.body).toEqual(Buffer.from('%PDF-route-test'));
    });

    it('streams signed downloads as attachments instead of returning storage URLs', async () => {
        signatureService.getDocumentDetails.mockResolvedValue({
            document: { signed_file_url: fileUrl, file_name: 'Signed contract.pdf' },
        });

        const response = await request(app).get('/api/signatures/documents/12/download');

        expect(response.status).toBe(200);
        expect(response.headers['content-disposition']).toBe('attachment; filename="Signed contract.pdf"');
        expect(response.body).toEqual(Buffer.from('%PDF-route-test'));
    });

    it('serves template PDFs through the authenticated route', async () => {
        signatureService.getTemplate.mockResolvedValue({
            template: { file_url: fileUrl, file_name: 'Template.pdf' },
        });

        const response = await request(app).get('/api/signatures/templates/5/file');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('refuses arbitrary remote storage URLs without making a network request', async () => {
        signatureService.getDocumentDetails.mockResolvedValue({
            document: { file_url: 'http://127.0.0.1:5432/private', file_name: 'Remote.pdf' },
        });

        const response = await request(app).get('/api/signatures/documents/12/file');

        expect(response.status).toBe(404);
    });

    it('rejects a MIME-spoofed PDF before the storage service runs', async () => {
        const response = await request(app)
            .post('/api/signatures/documents/upload')
            .field('document_id', '12')
            .attach('file', Buffer.from('<html>payload</html>'), {
                filename: 'payload.pdf',
                contentType: 'application/pdf',
            });

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({ error: { code: 'UPLOAD_ERROR' } });
        expect(signatureService.uploadDocument).not.toHaveBeenCalled();
    });

    it('normalizes an actual PDF before passing it to storage', async () => {
        signatureService.uploadDocument.mockImplementation(async (_pool, _organizationId, id, file) => ({
            id,
            file_type: file.mimetype,
            file_name: file.originalname,
        }));

        const response = await request(app)
            .post('/api/signatures/documents/upload')
            .field('document_id', '12')
            .attach('file', Buffer.from('%PDF-1.7\n%%EOF'), {
                filename: 'contract.html',
                contentType: 'application/pdf',
            });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: 12, file_type: 'application/pdf' });
        const storedFile = signatureService.uploadDocument.mock.calls[0][3];
        expect(storedFile.filename).toMatch(/^signature-7-.*\.pdf$/);
    });
});
