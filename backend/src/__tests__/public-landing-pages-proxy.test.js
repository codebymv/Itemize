const express = require('express');
const cookieParser = require('cookie-parser');
const request = require('supertest');
const {
    createPublicLandingPagesProxy,
    publicLandingPagesEnabled,
} = require('../public-landing-pages-proxy');

const enabledEnvironment = {
    PUBLIC_LANDING_PAGES_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ action = 'page', environment = {}, fetchImpl } = {}) => {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    const proxy = createPublicLandingPagesProxy({
        action, environment, fetchImpl, logger: { error: jest.fn() },
    });
    const fallback = (_req, res) => res.status(418).json({ fallback: true });
    if (action === 'page') app.get('/api/pages/public/page/:slug', proxy, fallback);
    if (action === 'analytics') app.post('/api/pages/public/page/:slug/analytics', proxy, fallback);
    return app;
};

const jsonResponse = (body, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

describe('public landing pages proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(publicLandingPagesEnabled({ PUBLIC_LANDING_PAGES_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(publicLandingPagesEnabled({})).toBe(false);
        const response = await request(appFor()).get('/api/pages/public/page/launch');
        expect(response.status).toBe(418);
    });

    test('forwards page reads with the visitor cookie, password header, and UTM query', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ id: 7 }));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .get('/api/pages/public/page/launch?utm_source=news&password=pw&admin=true')
            .set('Cookie', 'visitor_id=visitor-123')
            .set('x-page-password', 'pw')
            .set('referer', 'https://ref.example.com');
        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(
            'https://graphql.internal/api/pages/public/page/launch?password=pw&utm_source=news',
        );
        expect(options.headers.get('cookie')).toBe('visitor_id=visitor-123');
        expect(options.headers.get('x-page-password')).toBe('pw');
        expect(options.headers.get('referer')).toBe('https://ref.example.com');
    });

    test('passes upstream password and expiry statuses through unchanged', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(
            { error: 'Password required', password_protected: true },
            401,
        ));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .get('/api/pages/public/page/launch');
        expect(response.status).toBe(401);
        expect(response.body).toEqual({ error: 'Password required', password_protected: true });
    });

    test('forwards the analytics beacon body as JSON', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true }));
        await request(appFor({ action: 'analytics', environment: enabledEnvironment, fetchImpl }))
            .post('/api/pages/public/page/launch/analytics')
            .send({ visitor_id: 'v-1', session_id: 's-1', scroll_depth: 80 });
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(
            'https://graphql.internal/api/pages/public/page/launch/analytics',
        );
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body)).toEqual({
            visitor_id: 'v-1', session_id: 's-1', scroll_depth: 80,
        });
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailable = await request(appFor({
            environment: { PUBLIC_LANDING_PAGES_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).get('/api/pages/public/page/launch');
        expect(unavailable.status).toBe(503);
        const failing = await request(appFor({
            environment: enabledEnvironment,
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
        })).get('/api/pages/public/page/launch');
        expect(failing.status).toBe(502);
        expect(JSON.stringify(failing.body)).not.toContain('socket hang up');
    });
});
