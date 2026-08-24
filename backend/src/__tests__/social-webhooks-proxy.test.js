const express = require('express');
const request = require('supertest');
const {
    createSocialWebhookProxy,
    socialWebhooksEnabled,
} = require('../social-webhooks-proxy');

const enabledEnvironment = {
    SOCIAL_WEBHOOKS_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ method = 'verify', environment = {}, fetchImpl } = {}) => {
    const app = express();
    const proxy = createSocialWebhookProxy({
        method, environment, fetchImpl, logger: { error: jest.fn() },
    });
    const fallback = (_req, res) => res.status(418).send('fallback');
    if (method === 'verify') {
        app.get('/api/social/webhook', proxy, fallback);
    } else {
        app.post(
            '/api/social/webhook',
            express.raw({ type: () => true, limit: '1mb' }),
            proxy,
            fallback,
        );
    }
    return app;
};

const textResponse = (body, status = 200) =>
    new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('social webhook proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(socialWebhooksEnabled({ SOCIAL_WEBHOOKS_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(socialWebhooksEnabled({})).toBe(false);
        const response = await request(appFor())
            .get('/api/social/webhook?hub.mode=subscribe');
        expect(response.status).toBe(418);
    });

    test('forwards the challenge query parameters on verification', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(textResponse('challenge-123'));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .get('/api/social/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=challenge-123&extra=1');
        expect(response.status).toBe(200);
        expect(response.text).toBe('challenge-123');
        const [url] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(
            'https://graphql.internal/api/social/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=challenge-123',
        );
    });

    test('forwards the exact raw bytes and the hub signature on receive', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(textResponse('EVENT_RECEIVED'));
        const rawPayload = '{"object": "page",  "entry": []}';
        const response = await request(appFor({ method: 'receive', environment: enabledEnvironment, fetchImpl }))
            .post('/api/social/webhook')
            .set('Content-Type', 'application/json')
            .set('x-hub-signature-256', `sha256=${'ab'.repeat(32)}`)
            .send(rawPayload);
        expect(response.status).toBe(200);
        expect(response.text).toBe('EVENT_RECEIVED');
        const [, options] = fetchImpl.mock.calls[0];
        expect(options.body.toString('utf8')).toBe(rawPayload);
        expect(options.headers.get('x-hub-signature-256')).toBe(`sha256=${'ab'.repeat(32)}`);
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailable = await request(appFor({
            environment: { SOCIAL_WEBHOOKS_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).get('/api/social/webhook?hub.mode=subscribe');
        expect(unavailable.status).toBe(503);
        const failing = await request(appFor({
            environment: enabledEnvironment,
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
        })).get('/api/social/webhook?hub.mode=subscribe');
        expect(failing.status).toBe(502);
    });
});
