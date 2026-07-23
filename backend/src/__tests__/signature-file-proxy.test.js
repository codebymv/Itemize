const express = require('express');
const request = require('supertest');
const {
    createSignatureFileReadProxy,
    createSignatureFileUploadProxy,
} = require('../signature-file-proxy');

const logger = { error: jest.fn() };

describe('Signature file NestJS proxies', () => {
    beforeEach(() => jest.clearAllMocks());

    it('falls through independently while both switches are disabled', async () => {
        const app = express();
        const fetchImpl = jest.fn();
        app.post('/api/signatures/documents/upload',
            createSignatureFileUploadProxy({
                targetPath: '/api/signatures/documents/upload',
                environment: {},
                fetchImpl,
            }),
            (_req, res) => res.status(299).json({ source: 'legacy-upload' }));
        app.get('/api/signatures/documents/:id/file',
            createSignatureFileReadProxy({
                kind: 'document-source',
                environment: {},
                fetchImpl,
            }),
            (_req, res) => res.status(298).json({ source: 'legacy-read' }));
        await request(app).post('/api/signatures/documents/upload')
            .attach('file', Buffer.from('legacy'), 'file.pdf').expect(299);
        await request(app).get('/api/signatures/documents/7/file').expect(298);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('forwards exact multipart bytes and only the required authenticated headers', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ success: true, data: { id: 7 } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        ));
        const app = express();
        app.post('/api/signatures/documents/upload',
            createSignatureFileUploadProxy({
                targetPath: '/api/signatures/documents/upload',
                environment: {
                    SIGNATURE_FILE_UPLOADS_NESTJS_ENABLED: 'true',
                    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
                },
                fetchImpl,
                logger,
            }));
        await request(app).post('/api/signatures/documents/upload')
            .set('Cookie', ['itemize_auth=token', 'csrf-token=csrf'])
            .set('X-CSRF-Token', 'csrf')
            .set('X-Organization-Id', '4')
            .field('document_id', '7')
            .attach('file', Buffer.from('%PDF-1.7'), 'file.pdf')
            .expect(200);
        const [target, options] = fetchImpl.mock.calls[0];
        expect(target.toString()).toBe(
            'https://graphql.internal/api/signatures/documents/upload',
        );
        expect(options.headers.get('cookie')).toContain('itemize_auth=token');
        expect(options.headers.get('x-csrf-token')).toBe('csrf');
        expect(options.headers.get('x-organization-id')).toBe('4');
        expect(options.headers.get('authorization')).toBeNull();
        expect(options.headers.get('content-type')).toMatch(
            /^multipart\/form-data; boundary=/,
        );
        expect(Buffer.isBuffer(options.body)).toBe(true);
    });

    it('forwards private delivery headers and never forwards authorization', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            Buffer.from('%PDF-1.7'),
            {
                status: 206,
                headers: {
                    'accept-ranges': 'bytes',
                    'cache-control': 'private, no-store',
                    'content-disposition': 'attachment; filename="signed.pdf"',
                    'content-range': 'bytes 0-8/20',
                    'content-security-policy': 'sandbox',
                    'content-type': 'application/pdf',
                    etag: '"sha256-test"',
                    'x-content-type-options': 'nosniff',
                },
            },
        ));
        const app = express();
        app.get('/api/signatures/documents/:id/download',
            createSignatureFileReadProxy({
                kind: 'document-download',
                environment: {
                    SIGNATURE_FILE_READS_NESTJS_ENABLED: 'true',
                    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
                },
                fetchImpl,
                logger,
            }));
        const response = await request(app)
            .get('/api/signatures/documents/7/download')
            .set('Cookie', 'itemize_auth=token')
            .set('Authorization', 'Bearer do-not-forward')
            .set('Range', 'bytes=0-8')
            .set('If-Range', '"sha256-test"')
            .set('If-None-Match', '"older"')
            .set('X-Organization-Id', '4')
            .expect(206);
        const [target, options] = fetchImpl.mock.calls[0];
        expect(target.toString()).toBe(
            'https://graphql.internal/api/signatures/documents/7/download',
        );
        expect(options.headers.get('authorization')).toBeNull();
        expect(options.headers.get('range')).toBe('bytes=0-8');
        expect(options.headers.get('if-range')).toBe('"sha256-test"');
        expect(options.headers.get('if-none-match')).toBe('"older"');
        expect(response.headers['content-disposition']).toContain('signed.pdf');
        expect(response.headers['accept-ranges']).toBe('bytes');
        expect(response.headers['content-range']).toBe('bytes 0-8/20');
        expect(response.headers.etag).toBe('"sha256-test"');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('fails closed for missing upstream, invalid media type, and oversized bodies', async () => {
        const missing = express();
        missing.post('/api/signatures/documents/upload',
            createSignatureFileUploadProxy({
                targetPath: '/api/signatures/documents/upload',
                environment: { SIGNATURE_FILE_UPLOADS_NESTJS_ENABLED: 'true' },
            }));
        await request(missing).post('/api/signatures/documents/upload').expect(503);

        const configured = express();
        configured.post('/api/signatures/documents/upload',
            createSignatureFileUploadProxy({
                targetPath: '/api/signatures/documents/upload',
                environment: {
                    SIGNATURE_FILE_UPLOADS_NESTJS_ENABLED: 'true',
                    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
                },
            }));
        await request(configured).post('/api/signatures/documents/upload')
            .send({ nope: true }).expect(400);
        await request(configured).post('/api/signatures/documents/upload')
            .set('Content-Type', 'multipart/form-data; boundary=x')
            .set('Content-Length', String(6 * 1024 * 1024))
            .send('--x--').expect(413);
    });

    it('rejects unrecognized proxy targets at construction time', () => {
        expect(() => createSignatureFileUploadProxy({
            targetPath: '/api/signatures/not-allowed',
        })).toThrow('not allowed');
        expect(() => createSignatureFileReadProxy({
            kind: 'arbitrary',
        })).toThrow('not allowed');
    });
});
