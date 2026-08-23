const express = require('express');
const request = require('supertest');
const {
    createPublicSharingProxy,
    publicSharingEnabled,
} = require('../public-sharing-proxy');

const token = '00000000-0000-4000-8000-000000000042';

const appFor = ({ kind = 'list', environment = {}, fetchImpl } = {}) => {
    const app = express();
    app.get(
        `/api/shared/${kind}/:token`,
        createPublicSharingProxy({ kind, environment, fetchImpl, logger: { error: jest.fn() } }),
        (_req, res) => res.status(418).json({ fallback: true }),
    );
    return app;
};

describe('public sharing proxy', () => {
    test('is gated by one explicit flag and falls through to legacy when disabled', async () => {
        expect(publicSharingEnabled({ PUBLIC_SHARING_NESTJS_ENABLED: 'true' })).toBe(true);
        expect(publicSharingEnabled({ PUBLIC_SHARING_NESTJS_ENABLED: 'false' })).toBe(false);
        expect(publicSharingEnabled({})).toBe(false);
        expect((await request(appFor()).get(`/api/shared/list/${token}`)).status).toBe(418);
    });

    test('rejects unknown capability kinds at creation', () => {
        expect(() => createPublicSharingProxy({ kind: 'document' }))
            .toThrow('Public sharing proxy target is not allowed');
    });

    test.each(['list', 'note', 'whiteboard', 'wireframe', 'vault'])(
        'forwards %s reads without credentials',
        async (kind) => {
            const fetchImpl = jest.fn().mockResolvedValue(new Response(
                JSON.stringify({ id: 1, type: kind }),
                {
                    status: 200,
                    headers: {
                        'content-type': 'application/json; charset=utf-8',
                        'cache-control': 'private, no-store',
                        'referrer-policy': 'no-referrer',
                        'x-robots-tag': 'noindex, nofollow',
                    },
                },
            ));
            const response = await request(appFor({
                kind,
                environment: {
                    PUBLIC_SHARING_NESTJS_ENABLED: 'true',
                    GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
                },
                fetchImpl,
            })).get(`/api/shared/${kind}/${token}`).set('Cookie', 'itemize_auth=secret');
            expect(response.status).toBe(200);
            const [url, options] = fetchImpl.mock.calls[0];
            expect(url.toString()).toBe(`https://graphql.internal/api/shared/${kind}/${token}`);
            expect(options.method).toBe('GET');
            expect(options.headers.get('cookie')).toBeNull();
            expect(options.headers.get('authorization')).toBeNull();
            expect(response.headers['cache-control']).toBe('private, no-store');
            expect(response.headers['referrer-policy']).toBe('no-referrer');
            expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
            expect(response.body).toEqual({ id: 1, type: kind });
        },
    );

    test('rejects malformed tokens before the upstream call with the kind dialect', async () => {
        const fetchImpl = jest.fn();
        const environment = {
            PUBLIC_SHARING_NESTJS_ENABLED: 'true',
            GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
        };
        const listResponse = await request(appFor({ kind: 'list', environment, fetchImpl }))
            .get('/api/shared/list/not-a-token');
        expect(listResponse.status).toBe(404);
        expect(listResponse.body).toEqual({
            error: 'Shared content not found or no longer available',
        });
        const vaultResponse = await request(appFor({ kind: 'vault', environment, fetchImpl }))
            .get('/api/shared/vault/not-a-token');
        expect(vaultResponse.status).toBe(404);
        expect(vaultResponse.body).toEqual({
            success: false,
            error: { message: 'Shared vault not found', code: 'NOT_FOUND' },
        });
        expect(listResponse.headers['cache-control']).toBe('private, no-store');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('serves 503 when enabled without an upstream URL', async () => {
        const response = await request(appFor({
            environment: { PUBLIC_SHARING_NESTJS_ENABLED: 'true' },
            fetchImpl: jest.fn(),
        })).get(`/api/shared/list/${token}`);
        expect(response.status).toBe(503);
        expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    test('passes upstream error statuses and bodies through unchanged', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ error: 'Shared content not found or no longer available' }),
            { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } },
        ));
        const response = await request(appFor({
            environment: {
                PUBLIC_SHARING_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
            },
            fetchImpl,
        })).get(`/api/shared/list/${token}`);
        expect(response.status).toBe(404);
        expect(response.body).toEqual({
            error: 'Shared content not found or no longer available',
        });
    });

    test('maps upstream failures to 502 without leaking the failure', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('socket hang up'));
        const response = await request(appFor({
            environment: {
                PUBLIC_SHARING_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
            },
            fetchImpl,
        })).get(`/api/shared/list/${token}`);
        expect(response.status).toBe(502);
        expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(JSON.stringify(response.body)).not.toContain('socket hang up');
    });

    test('bounds oversized upstream responses', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ ok: true }),
            {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                    'content-length': String(64 * 1024 * 1024),
                },
            },
        ));
        const response = await request(appFor({
            environment: {
                PUBLIC_SHARING_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
            },
            fetchImpl,
        })).get(`/api/shared/list/${token}`);
        expect(response.status).toBe(502);
    });

    test('forwards an accepted request id and never a malformed one', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ id: 1 }),
            { status: 200, headers: { 'content-type': 'application/json' } },
        ));
        await request(appFor({
            environment: {
                PUBLIC_SHARING_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
            },
            fetchImpl,
        })).get(`/api/shared/list/${token}`).set('x-request-id', 'req-123');
        expect(fetchImpl.mock.calls[0][1].headers.get('x-request-id')).toBe('req-123');
        await request(appFor({
            environment: {
                PUBLIC_SHARING_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
            },
            fetchImpl,
        })).get(`/api/shared/list/${token}`).set('x-request-id', 'bad~id!value');
        expect(fetchImpl.mock.calls[1][1].headers.get('x-request-id')).toBeNull();
    });
});
