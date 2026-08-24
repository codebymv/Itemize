const express = require('express');
const request = require('supertest');
const {
    createCalendarOAuthProxy,
    calendarOAuthEnabled,
} = require('../calendar-oauth-proxy');

const enabledEnvironment = {
    CALENDAR_OAUTH_NESTJS_ENABLED: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
};

const appFor = ({ action = 'auth', environment = {}, fetchImpl } = {}) => {
    const app = express();
    const proxy = createCalendarOAuthProxy({
        action, environment, fetchImpl, logger: { error: jest.fn() },
    });
    const fallback = (_req, res) => res.status(418).json({ fallback: true });
    if (action === 'auth') app.get('/api/calendar-integrations/google/auth', proxy, fallback);
    if (action === 'callback') app.get('/api/calendar-integrations/google/callback', proxy, fallback);
    if (action === 'calendars') app.get('/api/calendar-integrations/google/calendars/:connectionId', proxy, fallback);
    return app;
};

const jsonResponse = (body, status = 200, headers = {}) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } },
);

describe('calendar OAuth proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(calendarOAuthEnabled({ CALENDAR_OAUTH_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(calendarOAuthEnabled({})).toBe(false);
        const response = await request(appFor())
            .get('/api/calendar-integrations/google/auth');
        expect(response.status).toBe(418);
    });

    test('forwards the session cookie and organization selector on authenticated reads', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ authUrl: 'https://accounts.google.com/x' }));
        const response = await request(appFor({ environment: enabledEnvironment, fetchImpl }))
            .get('/api/calendar-integrations/google/auth?return_url=/calendars')
            .set('Cookie', 'itemize_auth=session-token')
            .set('x-organization-id', '7');
        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(
            'https://graphql.internal/api/calendar-integrations/google/auth?return_url=%2Fcalendars',
        );
        expect(options.headers.get('cookie')).toBe('itemize_auth=session-token');
        expect(options.headers.get('x-organization-id')).toBe('7');
        expect(options.redirect).toBe('manual');
    });

    test('passes callback redirects through without cookies or following', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(null, {
            status: 302,
            headers: { location: 'https://app.itemize.test/calendars?google_connected=true' },
        }));
        const response = await request(appFor({ action: 'callback', environment: enabledEnvironment, fetchImpl }))
            .get('/api/calendar-integrations/google/callback?code=abc&state=xyz')
            .set('Cookie', 'itemize_auth=session-token');
        expect(response.status).toBe(302);
        expect(response.headers.location).toBe(
            'https://app.itemize.test/calendars?google_connected=true',
        );
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(
            'https://graphql.internal/api/calendar-integrations/google/callback?code=abc&state=xyz',
        );
        expect(options.headers.get('cookie')).toBeNull();
    });

    test('forwards the connection id on provider-calendar reads', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse([]));
        await request(appFor({ action: 'calendars', environment: enabledEnvironment, fetchImpl }))
            .get('/api/calendar-integrations/google/calendars/42')
            .set('Cookie', 'itemize_auth=session-token');
        const [url] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(
            'https://graphql.internal/api/calendar-integrations/google/calendars/42',
        );
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailable = await request(appFor({
            environment: { CALENDAR_OAUTH_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).get('/api/calendar-integrations/google/auth');
        expect(unavailable.status).toBe(503);
        const failing = await request(appFor({
            environment: enabledEnvironment,
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
        })).get('/api/calendar-integrations/google/auth');
        expect(failing.status).toBe(502);
        expect(JSON.stringify(failing.body)).not.toContain('socket hang up');
    });
});
