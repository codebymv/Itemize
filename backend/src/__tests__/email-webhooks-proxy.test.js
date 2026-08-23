const express = require('express');
const request = require('supertest');
const {
    createEmailWebhookProxy,
    emailWebhooksEnabled,
} = require('../email-webhooks-proxy');

const enabledEnvironment = {
    EMAIL_WEBHOOKS_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ environment = {}, fetchImpl } = {}) => {
    const app = express();
    app.use(express.json({
        verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); },
    }));
    app.post(
        '/api/email/webhook/resend',
        createEmailWebhookProxy({ environment, fetchImpl, logger: { error: jest.fn() } }),
        (_req, res) => res.status(418).json({ fallback: true }),
    );
    return app;
};

const jsonResponse = (body, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

describe('email webhook proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(emailWebhooksEnabled({ EMAIL_WEBHOOKS_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(emailWebhooksEnabled({})).toBe(false);
        const response = await request(appFor())
            .post('/api/email/webhook/resend')
            .send({ type: 'email.delivered' });
        expect(response.status).toBe(418);
    });

    test('forwards the exact raw bytes and svix headers, never re-serialized JSON', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ received: true }));
        // Key order and whitespace must survive: verification hashes the bytes.
        const rawPayload = '{"type": "email.delivered",  "data": {"email_id": "re_1"}}';
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .post('/api/email/webhook/resend')
            .set('Content-Type', 'application/json')
            .set('svix-id', 'msg_1')
            .set('svix-timestamp', '1755900000')
            .set('svix-signature', 'v1,abc')
            .set('Cookie', 'itemize_auth=secret')
            .send(rawPayload);
        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe('https://graphql.internal/api/email/webhook/resend');
        expect(options.method).toBe('POST');
        expect(Buffer.isBuffer(options.body)).toBe(true);
        expect(options.body.toString('utf8')).toBe(rawPayload);
        expect(options.headers.get('svix-id')).toBe('msg_1');
        expect(options.headers.get('svix-timestamp')).toBe('1755900000');
        expect(options.headers.get('svix-signature')).toBe('v1,abc');
        expect(options.headers.get('cookie')).toBeNull();
    });

    test('passes upstream verification failures through unchanged', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: 'Invalid webhook' }, 400));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .post('/api/email/webhook/resend')
            .send({ type: 'email.delivered' });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid webhook' });
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailable = await request(appFor({
            environment: { EMAIL_WEBHOOKS_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).post('/api/email/webhook/resend').send({});
        expect(unavailable.status).toBe(503);
        const failing = await request(appFor({
            environment: enabledEnvironment,
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
        })).post('/api/email/webhook/resend').send({});
        expect(failing.status).toBe(502);
        expect(JSON.stringify(failing.body)).not.toContain('socket hang up');
    });
});
