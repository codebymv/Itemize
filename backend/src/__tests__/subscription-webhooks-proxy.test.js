const express = require('express');
const request = require('supertest');
const {
    createSubscriptionWebhookProxy,
    subscriptionWebhooksEnabled,
} = require('../subscription-webhooks-proxy');

const enabledEnvironment = {
    SUBSCRIPTION_WEBHOOKS_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ environment = {}, fetchImpl } = {}) => {
    const app = express();
    // Mirrors the origin: this path is parsed raw before any JSON parser.
    app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
    app.post(
        '/api/billing/webhook',
        createSubscriptionWebhookProxy({ environment, fetchImpl, logger: { error: jest.fn() } }),
        (_req, res) => res.status(418).json({ fallback: true }),
    );
    return app;
};

const jsonResponse = (body, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

describe('subscription webhook proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(subscriptionWebhooksEnabled({ SUBSCRIPTION_WEBHOOKS_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(subscriptionWebhooksEnabled({})).toBe(false);
        const response = await request(appFor())
            .post('/api/billing/webhook')
            .set('Content-Type', 'application/json')
            .send('{}');
        expect(response.status).toBe(418);
    });

    test('forwards the exact signed bytes and the Stripe signature', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ received: true }));
        const rawPayload = '{"id": "evt_1",  "type": "customer.subscription.updated"}';
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .post('/api/billing/webhook')
            .set('Content-Type', 'application/json')
            .set('Stripe-Signature', 't=1,v1=abc')
            .set('Cookie', 'itemize_auth=secret')
            .send(rawPayload);
        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe('https://graphql.internal/api/billing/webhook');
        expect(options.body.toString('utf8')).toBe(rawPayload);
        expect(options.headers.get('stripe-signature')).toBe('t=1,v1=abc');
        expect(options.headers.get('cookie')).toBeNull();
    });

    test('passes upstream verification failures through unchanged', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: 'Invalid webhook' }, 400));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .post('/api/billing/webhook')
            .set('Content-Type', 'application/json')
            .send('{}');
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid webhook' });
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailable = await request(appFor({
            environment: { SUBSCRIPTION_WEBHOOKS_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).post('/api/billing/webhook').set('Content-Type', 'application/json').send('{}');
        expect(unavailable.status).toBe(503);
        const failing = await request(appFor({
            environment: enabledEnvironment,
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
        })).post('/api/billing/webhook').set('Content-Type', 'application/json').send('{}');
        expect(failing.status).toBe(502);
        expect(JSON.stringify(failing.body)).not.toContain('socket hang up');
    });
});
