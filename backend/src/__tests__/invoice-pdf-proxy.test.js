const express = require('express');
const request = require('supertest');
const {
    createInvoicePdfProxy,
    enabled,
    resolveBaseUrl,
} = require('../invoice-pdf-proxy');

const testApp = ({
    environment = {},
    fetchImpl,
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}) => {
    const app = express();
    app.use((req, _res, next) => {
        req.requestId = 'legacy-pdf-request';
        next();
    });
    app.get(
        '/api/invoices/:id/pdf',
        createInvoicePdfProxy({ environment, fetchImpl, logger }),
        (_req, res) => res.status(299).send('legacy-pdf'),
    );
    return { app, logger };
};

describe('invoice PDF NestJS proxy', () => {
    it('passes through to the legacy route unless explicitly enabled', async () => {
        const fetchImpl = jest.fn();
        const { app } = testApp({ fetchImpl });

        await request(app).get('/api/invoices/12/pdf').expect(299, 'legacy-pdf');
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(enabled({ INVOICE_PDF_NESTJS_ENABLED: 'false' })).toBe(false);
    });

    it('proxies only safe request context and preserves hardened PDF headers', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            Buffer.from('%PDF-1.7\nproxy-test'),
            {
                status: 200,
                headers: {
                    'cache-control': 'private, no-store',
                    'content-disposition': 'attachment; filename="INV-12.pdf"',
                    'content-security-policy': 'sandbox',
                    'content-type': 'application/pdf',
                    'x-content-type-options': 'nosniff',
                    'x-request-id': 'nestjs-pdf-request',
                    'set-cookie': 'must-not-forward=true',
                },
            },
        ));
        const { app, logger } = testApp({
            environment: {
                INVOICE_PDF_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
            },
            fetchImpl,
        });

        const response = await request(app)
            .get('/api/invoices/12/pdf?ignored=private')
            .set('Cookie', 'itemize_auth=signed')
            .set('x-organization-id', '42')
            .set('Authorization', 'Bearer must-not-forward')
            .expect(200);

        const [target, options] = fetchImpl.mock.calls[0];
        expect(target.toString()).toBe('https://graphql.internal/api/invoices/12/pdf');
        expect(options.method).toBe('GET');
        expect(options.headers.get('accept')).toBe('application/pdf');
        expect(options.headers.get('cookie')).toBe('itemize_auth=signed');
        expect(options.headers.get('x-organization-id')).toBe('42');
        expect(options.headers.get('authorization')).toBeNull();
        expect(response.headers).toMatchObject({
            'cache-control': 'private, no-store',
            'content-disposition': 'attachment; filename="INV-12.pdf"',
            'content-security-policy': 'sandbox',
            'content-type': 'application/pdf',
            'x-content-type-options': 'nosniff',
            'x-request-id': 'nestjs-pdf-request',
        });
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
        expect(logger.info).toHaveBeenCalledWith(
            'Invoice PDF proxy completed',
            expect.objectContaining({
                event: 'invoice_pdf_proxy_completed',
                statusCode: 200,
                outcome: 'success',
                requestId: 'nestjs-pdf-request',
                durationMs: expect.any(Number),
            }),
        );
    });

    it('fails closed on missing configuration and upstream failures', async () => {
        const missing = testApp({
            environment: { INVOICE_PDF_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        });
        const unavailable = await request(missing.app)
            .get('/api/invoices/12/pdf')
            .expect(503);
        expect(unavailable.body.code).toBe('SERVICE_UNAVAILABLE');

        const failed = testApp({
            environment: {
                INVOICE_PDF_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
            },
            fetchImpl: jest.fn().mockRejectedValue(new Error('private DNS failure')),
        });
        const response = await request(failed.app)
            .get('/api/invoices/12/pdf')
            .expect(502);
        expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
        expect(failed.logger.error).toHaveBeenCalledWith(
            'Invoice PDF proxy completed',
            expect.objectContaining({
                outcome: 'error',
                failureReason: 'upstream_failure',
            }),
        );
    });

    it('rejects invalid or credential-bearing upstream URLs', () => {
        expect(() => resolveBaseUrl({
            GRAPHQL_UPSTREAM_URL: 'ftp://example.test/graphql',
        })).toThrow('must use http or https');
        expect(() => resolveBaseUrl({
            GRAPHQL_UPSTREAM_URL: 'https://user:pass@example.test/graphql',
        })).toThrow('must not contain credentials');
    });
});
