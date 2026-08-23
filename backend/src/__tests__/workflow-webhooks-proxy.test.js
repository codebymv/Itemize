const express = require('express');
const request = require('supertest');
const {
    createWorkflowWebhookProxy,
    workflowWebhooksEnabled,
} = require('../workflow-webhooks-proxy');

const enabledEnvironment = {
    WORKFLOW_WEBHOOKS_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ environment = {}, fetchImpl } = {}) => {
    const app = express();
    app.use(express.json({
        verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); },
    }));
    app.post(
        '/api/webhooks/:workflowId',
        createWorkflowWebhookProxy({ environment, fetchImpl, logger: { error: jest.fn() } }),
        (_req, res) => res.status(418).json({ fallback: true }),
    );
    return app;
};

const jsonResponse = (body, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

describe('workflow webhook proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(workflowWebhooksEnabled({ WORKFLOW_WEBHOOKS_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(workflowWebhooksEnabled({})).toBe(false);
        const response = await request(appFor())
            .post('/api/webhooks/12')
            .send({ eventType: 'contact_added' });
        expect(response.status).toBe(418);
    });

    test('forwards the exact raw bytes and itemize signature headers', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true }, 202));
        const rawPayload = '{"eventType": "contact_added",  "entityData": {"entityId": 42}}';
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .post('/api/webhooks/12')
            .set('Content-Type', 'application/json')
            .set('x-itemize-signature', 'ab'.repeat(32))
            .set('x-itemize-timestamp', '1755900000000')
            .set('x-itemize-delivery-id', 'delivery-1')
            .set('Cookie', 'itemize_auth=secret')
            .send(rawPayload);
        expect(response.status).toBe(202);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe('https://graphql.internal/api/webhooks/12');
        expect(options.body.toString('utf8')).toBe(rawPayload);
        expect(options.headers.get('x-itemize-signature')).toBe('ab'.repeat(32));
        expect(options.headers.get('x-itemize-timestamp')).toBe('1755900000000');
        expect(options.headers.get('x-itemize-delivery-id')).toBe('delivery-1');
        expect(options.headers.get('cookie')).toBeNull();
    });

    test('passes upstream rejection statuses and bodies through unchanged', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: 'Invalid webhook signature' }, 401));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .post('/api/webhooks/12')
            .send({ eventType: 'contact_added' });
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Invalid webhook signature' });
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailable = await request(appFor({
            environment: { WORKFLOW_WEBHOOKS_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).post('/api/webhooks/12').send({});
        expect(unavailable.status).toBe(503);
        expect(unavailable.body.error.code).toBe('SERVICE_UNAVAILABLE');
        const failing = await request(appFor({
            environment: enabledEnvironment,
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
        })).post('/api/webhooks/12').send({});
        expect(failing.status).toBe(502);
        expect(JSON.stringify(failing.body)).not.toContain('socket hang up');
    });
});
