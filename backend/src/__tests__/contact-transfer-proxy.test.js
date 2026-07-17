const express = require('express');
const request = require('supertest');
const {
    createContactTransferProxy,
    enabled,
    resolveBaseUrl,
} = require('../contact-transfer-proxy');

const testApp = ({
    environment = {},
    fetchImpl,
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}) => {
    const app = express();
    app.use(express.json({
        verify: (req, _res, buffer) => {
            req.rawBody = Buffer.from(buffer);
        },
    }));
    app.use((req, _res, next) => {
        req.requestId = 'legacy-transfer-request';
        next();
    });
    const proxy = createContactTransferProxy({ environment, fetchImpl, logger });
    app.get('/api/contacts/export/csv', proxy, (_req, res) => {
        res.status(299).send('legacy-export');
    });
    app.post('/api/contacts/import/csv', proxy, (_req, res) => {
        res.status(299).json({ source: 'legacy-import' });
    });
    return { app, logger };
};

describe('contact transfer NestJS proxy', () => {
    it('passes through to legacy routes unless explicitly enabled', async () => {
        const fetchImpl = jest.fn();
        const { app } = testApp({ fetchImpl });

        await request(app)
            .get('/api/contacts/export/csv')
            .expect(299, 'legacy-export');
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(enabled({ CONTACT_TRANSFERS_NESTJS_ENABLED: 'false' })).toBe(false);
    });

    it('proxies safe export context and preserves download headers', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            'First Name,Email\n"Safe","safe@example.test"',
            {
                status: 200,
                headers: {
                    'cache-control': 'private, no-store',
                    'content-disposition': 'attachment; filename=contacts-export.csv',
                    'content-type': 'text/csv; charset=utf-8',
                    'x-content-type-options': 'nosniff',
                    'x-request-id': 'nestjs-export-request',
                    'set-cookie': 'must-not-forward=true',
                },
            },
        ));
        const { app, logger } = testApp({
            environment: {
                CONTACT_TRANSFERS_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
            },
            fetchImpl,
        });

        const response = await request(app)
            .get('/api/contacts/export/csv?status=active&tags=vip,newsletter&ignored=secret')
            .set('Cookie', 'itemize_auth=signed')
            .set('x-organization-id', '42')
            .set('Authorization', 'Bearer must-not-forward')
            .expect(200);

        const [target, options] = fetchImpl.mock.calls[0];
        expect(target.toString()).toBe(
            'https://graphql.internal/api/contacts/export/csv?status=active&tags=vip%2Cnewsletter',
        );
        expect(options.method).toBe('GET');
        expect(options.headers.get('cookie')).toBe('itemize_auth=signed');
        expect(options.headers.get('x-organization-id')).toBe('42');
        expect(options.headers.get('authorization')).toBeNull();
        expect(options.body).toBeUndefined();
        expect(response.headers).toMatchObject({
            'cache-control': 'private, no-store',
            'content-disposition': 'attachment; filename=contacts-export.csv',
            'content-type': 'text/csv; charset=utf-8',
            'x-content-type-options': 'nosniff',
            'x-request-id': 'nestjs-export-request',
        });
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(logger.info).toHaveBeenCalledWith(
            'Contact transfer proxy completed',
            expect.objectContaining({
                event: 'contact_transfer_proxy_completed',
                action: 'export',
                statusCode: 200,
                outcome: 'success',
                requestId: 'nestjs-export-request',
                durationMs: expect.any(Number),
            }),
        );
    });

    it('proxies the exact parsed import body and CSRF context without logging rows', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ imported: 1, skipped: 0, errors: [] }),
            {
                status: 201,
                headers: { 'content-type': 'application/json; charset=utf-8' },
            },
        ));
        const { app, logger } = testApp({
            environment: {
                CONTACT_TRANSFERS_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'http://graphql.internal:3100/graphql',
            },
            fetchImpl,
        });
        const privateValue = 'private-contact@example.test';
        const response = await request(app)
            .post('/api/contacts/import/csv')
            .set('Cookie', 'itemize_auth=signed; csrf-token=proof')
            .set('x-organization-id', '42')
            .set('x-csrf-token', 'proof')
            .send({
                contacts: [{ first_name: 'Private', email: privateValue }],
                skipDuplicates: true,
            })
            .expect(201);

        expect(response.body.imported).toBe(1);
        const [target, options] = fetchImpl.mock.calls[0];
        expect(target.toString()).toBe(
            'http://graphql.internal:3100/api/contacts/import/csv',
        );
        expect(options.headers.get('x-csrf-token')).toBe('proof');
        expect(JSON.parse(options.body.toString())).toEqual({
            contacts: [{ first_name: 'Private', email: privateValue }],
            skipDuplicates: true,
        });
        expect(JSON.stringify(logger.info.mock.calls)).not.toContain(privateValue);
    });

    it('fails closed on missing configuration and upstream failures', async () => {
        const missing = testApp({
            environment: { CONTACT_TRANSFERS_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        });
        const unavailable = await request(missing.app)
            .get('/api/contacts/export/csv')
            .expect(503);
        expect(unavailable.body.code).toBe('SERVICE_UNAVAILABLE');

        const failed = testApp({
            environment: {
                CONTACT_TRANSFERS_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
            },
            fetchImpl: jest.fn().mockRejectedValue(new Error('private DNS failure')),
        });
        const response = await request(failed.app)
            .post('/api/contacts/import/csv')
            .send({ contacts: [{}], skipDuplicates: true })
            .expect(502);
        expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
        expect(failed.logger.error).toHaveBeenCalledWith(
            'Contact transfer proxy completed',
            expect.objectContaining({
                action: 'import',
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
