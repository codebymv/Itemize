const express = require('express');
const request = require('supertest');
const {
    createChatWidgetPublicProxy,
    chatWidgetPublicEnabled,
} = require('../chat-widget-public-proxy');

const enabledEnvironment = {
    CHAT_WIDGET_PUBLIC_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ action = 'config', environment = {}, fetchImpl } = {}) => {
    const app = express();
    app.use(express.json());
    const proxy = createChatWidgetPublicProxy({
        action, environment, fetchImpl, logger: { error: jest.fn() },
    });
    const fallback = (_req, res) => res.status(418).json({ fallback: true });
    if (action === 'config') app.get('/api/chat-widget/public/config/:widgetKey', proxy, fallback);
    if (action === 'session') app.post('/api/chat-widget/public/session', proxy, fallback);
    if (action === 'messages-read') app.get('/api/chat-widget/public/messages/:sessionToken', proxy, fallback);
    if (action === 'messages-send') app.post('/api/chat-widget/public/messages', proxy, fallback);
    if (action === 'end-session') app.post('/api/chat-widget/public/end-session', proxy, fallback);
    if (action === 'typing') app.post('/api/chat-widget/public/typing', proxy, fallback);
    return app;
};

const jsonResponse = (body, status = 200) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8' } },
);

describe('chat widget public proxy', () => {
    test('rejects unknown actions at construction time', () => {
        expect(() => createChatWidgetPublicProxy({ action: 'admin' }))
            .toThrow('Chat widget proxy target is not allowed');
    });

    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(chatWidgetPublicEnabled({ CHAT_WIDGET_PUBLIC_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(chatWidgetPublicEnabled({})).toBe(false);
        const response = await request(appFor()).get('/api/chat-widget/public/config/cw_abc');
        expect(response.status).toBe(418);
    });

    test('forwards config reads without credentials', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ widget_key: 'cw_abc', is_online: true }));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .get('/api/chat-widget/public/config/cw_abc')
            .set('Cookie', 'itemize_auth=secret');
        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe('https://graphql.internal/api/chat-widget/public/config/cw_abc');
        expect(options.method).toBe('GET');
        expect(options.headers.get('cookie')).toBeNull();
        expect(options.headers.get('authorization')).toBeNull();
    });

    test('forwards session starts with the JSON body and visitor evidence', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
            session_token: 'cs_' + 'a'.repeat(48), session_id: 7, resumed: false,
        }, 201));
        const response = await request(appFor({ action: 'session', environment: enabledEnvironment, fetchImpl }))
            .post('/api/chat-widget/public/session')
            .set('user-agent', 'widget-embed/1.0')
            .send({ widget_key: 'cw_abc', visitor_email: 'v@example.test' });
        expect(response.status).toBe(201);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe('https://graphql.internal/api/chat-widget/public/session');
        expect(options.method).toBe('POST');
        expect(options.headers.get('user-agent')).toBe('widget-embed/1.0');
        expect(options.headers.get('content-type')).toBe('application/json');
        expect(JSON.parse(options.body)).toEqual({ widget_key: 'cw_abc', visitor_email: 'v@example.test' });
    });

    test('forwards only the allow-listed after query parameter on message reads', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse([]));
        const token = 'cs_' + 'b'.repeat(48);
        const response = await request(appFor({ action: 'messages-read', environment: enabledEnvironment, fetchImpl }))
            .get(`/api/chat-widget/public/messages/${token}`)
            .query({ after: '2026-08-23T00:00:00.000Z', debug: '1' });
        expect(response.status).toBe(200);
        const [url] = fetchImpl.mock.calls[0];
        expect(url.pathname).toBe(`/api/chat-widget/public/messages/${token}`);
        expect(url.searchParams.get('after')).toBe('2026-08-23T00:00:00.000Z');
        expect(url.searchParams.has('debug')).toBe(false);
    });

    test('passes upstream validation errors through unchanged', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: 'Email is required' }, 400));
        const response = await request(appFor({ action: 'session', environment: enabledEnvironment, fetchImpl }))
            .post('/api/chat-widget/public/session')
            .send({ widget_key: 'cw_abc' });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Email is required' });
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailable = await request(appFor({
            action: 'typing',
            environment: { CHAT_WIDGET_PUBLIC_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).post('/api/chat-widget/public/typing').send({ session_token: 'cs_x' });
        expect(unavailable.status).toBe(503);
        const failing = await request(appFor({
            action: 'end-session',
            environment: enabledEnvironment,
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
        })).post('/api/chat-widget/public/end-session').send({ session_token: 'cs_x' });
        expect(failing.status).toBe(502);
        expect(JSON.stringify(failing.body)).not.toContain('socket hang up');
    });
});
