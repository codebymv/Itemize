const express = require('express');
const request = require('supertest');
const {
    createPublicEstimateProxy,
    publicEstimatesEnabled,
} = require('../public-estimate-proxy');

const token = 'a'.repeat(43);

const appFor = ({ action = 'open', environment = {}, fetchImpl } = {}) => {
    const app = express();
    const path = action === 'open'
        ? '/api/public/estimates/:token'
        : `/api/public/estimates/:token/${action}`;
    app[action === 'open' ? 'get' : 'post'](
        path,
        createPublicEstimateProxy({ action, environment, fetchImpl, logger: { error: jest.fn() } }),
        (_req, res) => res.status(418).json({ fallback: true }),
    );
    return app;
};

describe('public estimate proxy', () => {
    test('is gated by one explicit flag', async () => {
        expect(publicEstimatesEnabled({ PUBLIC_ESTIMATES_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(publicEstimatesEnabled({ PUBLIC_ESTIMATES_NESTJS_ENABLED: 'false' })).toBe(false);
        expect((await request(appFor()).get(`/api/public/estimates/${token}`)).status).toBe(418);
    });

    test('forwards public reads without credentials or token logs', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ success: true, data: { estimate: { status: 'sent' } } }),
            { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } },
        ));
        const response = await request(appFor({
            environment: {
                PUBLIC_ESTIMATES_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
            },
            fetchImpl,
        })).get(`/api/public/estimates/${token}`);
        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(`https://graphql.internal/api/public/estimates/${token}`);
        expect(options.method).toBe('GET');
        expect(options.headers.get('cookie')).toBeNull();
        expect(options.headers.get('authorization')).toBeNull();
        expect(response.headers['cache-control']).toBe('private, no-store');
    });

    test.each(['accept', 'decline'])('forwards the %s transition as an empty POST', async (action) => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        ));
        const response = await request(appFor({
            action,
            environment: {
                PUBLIC_ESTIMATES_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'http://graphql.internal:3100/graphql',
            },
            fetchImpl,
        })).post(`/api/public/estimates/${token}/${action}`).send({ ignored: true });
        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(`http://graphql.internal:3100/api/public/estimates/${token}/${action}`);
        expect(options.method).toBe('POST');
        expect(options.body).toBeUndefined();
    });

    test('rejects malformed tokens before the upstream call', async () => {
        const fetchImpl = jest.fn();
        const response = await request(appFor({
            environment: {
                PUBLIC_ESTIMATES_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
            },
            fetchImpl,
        })).get('/api/public/estimates/not-a-token');
        expect(response.status).toBe(404);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
