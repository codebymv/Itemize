const express = require('express');
const request = require('supertest');
const {
    createStripeInvoiceWebhookProxy,
    enabled,
    resolveBaseUrl,
} = require('../stripe-invoice-webhook-proxy');

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
        req.requestId = 'legacy-stripe-request';
        next();
    });
    app.post(
        '/api/invoices/webhook/stripe',
        createStripeInvoiceWebhookProxy({ environment, fetchImpl, logger }),
        (_req, res) => res.status(299).json({ source: 'legacy' }),
    );
    return { app, logger };
};

describe('Stripe invoice webhook NestJS proxy', () => {
    it('passes through to Express unless explicitly enabled', async () => {
        const fetchImpl = jest.fn();
        const { app } = testApp({ fetchImpl });

        await request(app)
            .post('/api/invoices/webhook/stripe')
            .send({ id: 'evt_legacy' })
            .expect(299);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(enabled({ STRIPE_INVOICE_WEBHOOK_NESTJS_ENABLED: 'false' })).toBe(false);
    });

    it('forwards exact raw bytes and only signature-safe headers', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ success: true, data: { received: true } }),
            {
                status: 200,
                headers: {
                    'cache-control': 'no-store',
                    'content-type': 'application/json; charset=utf-8',
                    'x-request-id': 'nestjs-stripe-request',
                    'set-cookie': 'must-not-forward=true',
                },
            },
        ));
        const { app, logger } = testApp({
            environment: {
                STRIPE_INVOICE_WEBHOOK_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
            },
            fetchImpl,
        });
        const raw = '{ "id": "evt_exact", "data": {"object": {}} }';
        const response = await request(app)
            .post('/api/invoices/webhook/stripe?ignored=private')
            .set('Content-Type', 'application/json')
            .set('Stripe-Signature', 't=1,v1=exact-signature')
            .set('Cookie', 'must-not-forward=true')
            .set('Authorization', 'Bearer must-not-forward')
            .send(raw)
            .expect(200);

        const [target, options] = fetchImpl.mock.calls[0];
        expect(target.toString()).toBe(
            'https://graphql.internal/api/invoices/webhook/stripe',
        );
        expect(options.method).toBe('POST');
        expect(Buffer.from(options.body).toString('utf8')).toBe(raw);
        expect(options.headers.get('stripe-signature')).toBe('t=1,v1=exact-signature');
        expect(options.headers.get('cookie')).toBeNull();
        expect(options.headers.get('authorization')).toBeNull();
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers).toMatchObject({
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8',
            'x-request-id': 'nestjs-stripe-request',
        });
        expect(logger.info).toHaveBeenCalledWith(
            'Stripe invoice webhook proxy completed',
            expect.objectContaining({
                event: 'stripe_invoice_webhook_proxy_completed',
                statusCode: 200,
                outcome: 'success',
                requestId: 'nestjs-stripe-request',
            }),
        );
    });

    it('fails closed without raw bytes, upstream configuration, or connectivity', async () => {
        const noParser = express();
        noParser.post(
            '/api/invoices/webhook/stripe',
            createStripeInvoiceWebhookProxy({
                environment: {
                    STRIPE_INVOICE_WEBHOOK_NESTJS_ENABLED: 'true',
                    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
                },
                fetchImpl: jest.fn(),
                logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
            }),
        );
        await request(noParser)
            .post('/api/invoices/webhook/stripe')
            .send('{}')
            .expect(400);

        const missing = testApp({
            environment: { STRIPE_INVOICE_WEBHOOK_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        });
        await request(missing.app)
            .post('/api/invoices/webhook/stripe')
            .send({ id: 'evt_missing' })
            .expect(503);

        const failed = testApp({
            environment: {
                STRIPE_INVOICE_WEBHOOK_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
            },
            fetchImpl: jest.fn().mockRejectedValue(new Error('private DNS failure')),
        });
        const response = await request(failed.app)
            .post('/api/invoices/webhook/stripe')
            .send({ id: 'evt_failed' })
            .expect(502);
        expect(response.body.code).toBe('SERVICE_UNAVAILABLE');
        expect(failed.logger.error).toHaveBeenCalledWith(
            'Stripe invoice webhook proxy completed',
            expect.objectContaining({ failureReason: 'upstream_failure' }),
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
