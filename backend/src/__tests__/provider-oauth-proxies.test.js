const express = require('express');
const request = require('supertest');
const {
    createSocialOAuthProxies,
    createStripeConnectProxies,
    socialOAuthEnabled,
    stripeConnectEnabled,
} = require('../provider-oauth-proxies');

const enabledEnvironment = (flag) => ({
    [flag]: 'true',
    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
});

const jsonResponse = (body, status = 200, headers = {}) => new Response(
    JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } },
);

describe('provider OAuth proxies', () => {
    test('are gated by their explicit flags and fall through when disabled', async () => {
        expect(socialOAuthEnabled({ SOCIAL_OAUTH_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(socialOAuthEnabled({})).toBe(false);
        expect(stripeConnectEnabled({ STRIPE_CONNECT_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(stripeConnectEnabled({})).toBe(false);

        const proxies = createSocialOAuthProxies({ environment: {} });
        const app = express();
        app.get('/api/social/connect/facebook', proxies.connect, (_req, res) => res.status(418).send('fallback'));
        const response = await request(app).get('/api/social/connect/facebook');
        expect(response.status).toBe(418);
    });

    test('forwards the session on authenticated begins and strips it on callbacks', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ auth_url: 'https://facebook.example/x' }));
        const proxies = createSocialOAuthProxies({
            environment: enabledEnvironment('SOCIAL_OAUTH_NESTJS_ENABLED'),
            fetchImpl,
            logger: { error: jest.fn() },
        });
        const app = express();
        app.get('/api/social/connect/facebook', proxies.connect);
        app.get('/api/social/callback/facebook', proxies.callback);

        await request(app)
            .get('/api/social/connect/facebook')
            .set('Cookie', 'itemize_auth=session-token')
            .set('x-organization-id', '3');
        let [, options] = fetchImpl.mock.calls[0];
        expect(options.headers.get('cookie')).toBe('itemize_auth=session-token');
        expect(options.headers.get('x-organization-id')).toBe('3');

        fetchImpl.mockResolvedValue(new Response(null, {
            status: 302,
            headers: { location: 'https://app.itemize.test/calendar-integrations?success=facebook_connected' },
        }));
        const callback = await request(app)
            .get('/api/social/callback/facebook?code=abc&state=xyz')
            .set('Cookie', 'itemize_auth=session-token');
        expect(callback.status).toBe(302);
        expect(callback.headers.location).toContain('success=facebook_connected');
        [, options] = fetchImpl.mock.calls[1];
        expect(options.headers.get('cookie')).toBeNull();
        expect(fetchImpl.mock.calls[1][0].toString()).toBe(
            'https://graphql.internal/api/social/callback/facebook?code=abc&state=xyz',
        );
    });

    test('routes the Stripe trio with session forwarding on connect and disconnect', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ success: true }));
        const proxies = createStripeConnectProxies({
            environment: enabledEnvironment('STRIPE_CONNECT_NESTJS_ENABLED'),
            fetchImpl,
            logger: { error: jest.fn() },
        });
        const app = express();
        app.get('/api/invoice-integrations/stripe/connect', proxies.connect);
        app.post('/api/invoice-integrations/stripe/disconnect', proxies.disconnect);

        await request(app)
            .get('/api/invoice-integrations/stripe/connect?return_url=/payment-settings')
            .set('Cookie', 'itemize_auth=session-token');
        expect(fetchImpl.mock.calls[0][0].toString()).toBe(
            'https://graphql.internal/api/invoice-integrations/stripe/connect?return_url=%2Fpayment-settings',
        );
        expect(fetchImpl.mock.calls[0][1].headers.get('cookie')).toBe('itemize_auth=session-token');

        await request(app)
            .post('/api/invoice-integrations/stripe/disconnect')
            .set('Cookie', 'itemize_auth=session-token');
        expect(fetchImpl.mock.calls[1][1].method).toBe('POST');
        expect(fetchImpl.mock.calls[1][1].headers.get('cookie')).toBe('itemize_auth=session-token');
    });

    test('serves 503 without an upstream URL and 502 on upstream failure', async () => {
        const unavailableProxies = createStripeConnectProxies({
            environment: { STRIPE_CONNECT_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
            logger: { error: jest.fn() },
        });
        const app = express();
        app.get('/api/invoice-integrations/stripe/connect', unavailableProxies.connect);
        const unavailable = await request(app).get('/api/invoice-integrations/stripe/connect');
        expect(unavailable.status).toBe(503);

        const failingProxies = createStripeConnectProxies({
            environment: enabledEnvironment('STRIPE_CONNECT_NESTJS_ENABLED'),
            fetchImpl: jest.fn().mockRejectedValue(new Error('socket hang up')),
            logger: { error: jest.fn() },
        });
        const failingApp = express();
        failingApp.get('/api/invoice-integrations/stripe/connect', failingProxies.connect);
        const failing = await request(failingApp).get('/api/invoice-integrations/stripe/connect');
        expect(failing.status).toBe(502);
        expect(JSON.stringify(failing.body)).not.toContain('socket hang up');
    });
});
