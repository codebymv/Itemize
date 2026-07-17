const express = require('express');
const request = require('supertest');
const { createGraphqlProxy, resolveUpstreamUrl } = require('../graphql-proxy');

const testApp = ({ environment = {}, fetchImpl, logger = { error: jest.fn() } }) => {
    const app = express();
    app.use(express.json({
        verify: (req, _res, buffer) => {
            req.rawBody = Buffer.from(buffer);
        },
    }));
    app.post('/graphql', createGraphqlProxy({ environment, fetchImpl, logger }));
    return { app, logger };
};

describe('legacy-origin GraphQL proxy', () => {
    it('forwards only the browser identity/context headers and preserves the GraphQL response', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ data: { readiness: 'ready' } }),
            {
                status: 200,
                headers: {
                    'content-type': 'application/json; charset=utf-8',
                    'x-request-id': 'upstream-request',
                },
            },
        ));
        const { app } = testApp({
            environment: { GRAPHQL_UPSTREAM_URL: 'http://graphql.internal:3100/graphql' },
            fetchImpl,
        });

        const response = await request(app)
            .post('/graphql')
            .set('Cookie', 'itemize_auth=signed-token')
            .set('X-Organization-Id', '42')
            .set('X-Request-Id', 'browser-request')
            .set('X-CSRF-Token', 'csrf-value')
            .set('Authorization', 'Bearer must-not-forward')
            .send({ query: 'query { readiness }' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ data: { readiness: 'ready' } });
        expect(response.headers['x-request-id']).toBe('upstream-request');
        expect(fetchImpl).toHaveBeenCalledTimes(1);

        const [url, options] = fetchImpl.mock.calls[0];
        expect(url).toBe('http://graphql.internal:3100/graphql');
        expect(options.method).toBe('POST');
        expect(options.headers.get('cookie')).toBe('itemize_auth=signed-token');
        expect(options.headers.get('x-organization-id')).toBe('42');
        expect(options.headers.get('x-request-id')).toBe('browser-request');
        expect(options.headers.get('x-csrf-token')).toBe('csrf-value');
        expect(options.headers.get('authorization')).toBeNull();
        expect(JSON.parse(options.body.toString())).toEqual({ query: 'query { readiness }' });
    });

    it('preserves upstream GraphQL errors and HTTP status', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ errors: [{ message: 'Authentication required' }], data: null }),
            { status: 401, headers: { 'content-type': 'application/json' } },
        ));
        const { app } = testApp({
            environment: { GRAPHQL_UPSTREAM_URL: 'https://graphql.example/graphql' },
            fetchImpl,
        });

        const response = await request(app)
            .post('/graphql')
            .send({ query: 'query { contacts { nodes { id } } }' });

        expect(response.status).toBe(401);
        expect(response.body.errors[0].message).toBe('Authentication required');
    });

    it('fails closed when the upstream is not configured', async () => {
        const fetchImpl = jest.fn();
        const { app } = testApp({ fetchImpl });

        const response = await request(app)
            .post('/graphql')
            .send({ query: 'query { readiness }' });

        expect(response.status).toBe(503);
        expect(response.body.errors[0].extensions.code).toBe('SERVICE_UNAVAILABLE');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('maps upstream transport failures to a stable GraphQL envelope', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('private DNS unavailable'));
        const { app, logger } = testApp({
            environment: { GRAPHQL_UPSTREAM_URL: 'http://graphql.internal:3100/graphql' },
            fetchImpl,
        });

        const response = await request(app)
            .post('/graphql')
            .send({ query: 'query { readiness }' });

        expect(response.status).toBe(502);
        expect(response.body.errors[0].extensions.code).toBe('SERVICE_UNAVAILABLE');
        expect(logger.error).toHaveBeenCalledWith(
            'GraphQL upstream request failed',
            expect.objectContaining({ error: 'private DNS unavailable' }),
        );
    });

    it('rejects invalid or credential-bearing upstream URLs at startup', () => {
        expect(() => resolveUpstreamUrl({ GRAPHQL_UPSTREAM_URL: 'ftp://example.com/graphql' }))
            .toThrow('must use http or https');
        expect(() => resolveUpstreamUrl({ GRAPHQL_UPSTREAM_URL: 'https://user:pass@example.com/graphql' }))
            .toThrow('must not contain credentials');
    });
});
