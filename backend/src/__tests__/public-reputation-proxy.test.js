const express = require('express');
const request = require('supertest');
const {
    createPublicReputationProxy,
    publicReputationEnabled,
} = require('../public-reputation-proxy');

const WIDGET_KEY = 'ab'.repeat(16);
const TOKEN = 'cd'.repeat(32);
const enabledEnvironment = {
    PUBLIC_REPUTATION_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ action = 'widget', environment = {}, fetchImpl } = {}) => {
    const app = express();
    app.use(express.json());
    const proxy = createPublicReputationProxy({
        action, environment, fetchImpl, logger: { error: jest.fn() },
    });
    const fallback = (_req, res) => res.status(418).json({ fallback: true });
    if (action === 'widget') app.get('/api/reputation/public/widget/:widgetKey', proxy, fallback);
    if (action === 'review-read') app.get('/api/reputation/public/review/:token', proxy, fallback);
    if (action === 'review-submit') app.post('/api/reputation/public/review/:token', proxy, fallback);
    return app;
};

const jsonResponse = (body, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

describe('public reputation proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(publicReputationEnabled({ PUBLIC_REPUTATION_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(publicReputationEnabled({})).toBe(false);
        const response = await request(appFor())
            .get(`/api/reputation/public/widget/${WIDGET_KEY}`);
        expect(response.status).toBe(418);
    });

    test('forwards widget reads without credentials and keeps no-store', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ config: {}, reviews: [] }));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .get(`/api/reputation/public/widget/${WIDGET_KEY}`)
            .set('Cookie', 'itemize_auth=secret');
        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(`https://graphql.internal/api/reputation/public/widget/${WIDGET_KEY}`);
        expect(options.headers.get('cookie')).toBeNull();
        expect(response.headers['cache-control']).toBe('no-store');
    });

    test('rejects malformed keys and tokens before the upstream call with kind dialects', async () => {
        const fetchImpl = jest.fn();
        const widget = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .get('/api/reputation/public/widget/not-a-key');
        expect(widget.status).toBe(404);
        expect(widget.body).toEqual({ error: 'Widget not found' });
        const read = await request(appFor({ action: 'review-read', environment: enabledEnvironment, fetchImpl }))
            .get('/api/reputation/public/review/not-a-token');
        expect(read.body).toEqual({ error: 'Review request not found or expired' });
        const submit = await request(appFor({ action: 'review-submit', environment: enabledEnvironment, fetchImpl }))
            .post('/api/reputation/public/review/not-a-token')
            .send({ rating: 5 });
        expect(submit.body).toEqual({ error: 'Review request not found' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('forwards the review submission body as JSON', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true, redirect_url: null }));
        await request(appFor({ action: 'review-submit', environment: enabledEnvironment, fetchImpl }))
            .post(`/api/reputation/public/review/${TOKEN}`)
            .send({ rating: 5, review_text: 'Great' });
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(`https://graphql.internal/api/reputation/public/review/${TOKEN}`);
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({ rating: 5, review_text: 'Great' });
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailable = await request(appFor({
            environment: { PUBLIC_REPUTATION_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).get(`/api/reputation/public/widget/${WIDGET_KEY}`);
        expect(unavailable.status).toBe(503);
        const failing = await request(appFor({
            environment: enabledEnvironment,
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
        })).get(`/api/reputation/public/widget/${WIDGET_KEY}`);
        expect(failing.status).toBe(502);
        expect(JSON.stringify(failing.body)).not.toContain('socket hang up');
    });
});
