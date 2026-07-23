const express = require('express');
const request = require('supertest');
const {
    createPublicSigningProxy,
    publicSigningMutationsEnabled,
    publicSigningReadsEnabled,
} = require('../public-signing-proxy');

const token = 'a'.repeat(64);

const appFor = ({ kind, environment, fetchImpl }) => {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    const proxy = createPublicSigningProxy({
        kind,
        environment,
        fetchImpl,
        logger: { error: jest.fn() },
    });
    const path = kind === 'session' || kind === 'submit'
        ? '/api/public/sign/:token'
        : `/api/public/sign/:token/${kind}`;
    app[kind === 'session' || ['file', 'download'].includes(kind) ? 'get' : 'post'](
        path,
        proxy,
        (_req, res) => res.status(418).json({ legacy: true }),
    );
    return app;
};

describe('public signing proxy', () => {
    it('falls through independently while both switches are absent', async () => {
        const fetchImpl = jest.fn();
        expect((await request(appFor({
            kind: 'session',
            environment: {},
            fetchImpl,
        })).get(`/api/public/sign/${token}`)).status).toBe(418);
        expect((await request(appFor({
            kind: 'submit',
            environment: {},
            fetchImpl,
        })).post(`/api/public/sign/${token}`).send({ fields: [] })).status).toBe(418);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(publicSigningReadsEnabled({})).toBe(false);
        expect(publicSigningMutationsEnabled({})).toBe(false);
    });

    it('forwards a public session without cookies or token logging headers', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ success: true, data: { fields: [] } }),
            {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                    'cache-control': 'private, no-store',
                    'x-robots-tag': 'noindex, nofollow',
                },
            },
        ));
        const response = await request(appFor({
            kind: 'session',
            environment: {
                PUBLIC_SIGNING_READS_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal/graphql',
            },
            fetchImpl,
        }))
            .get(`/api/public/sign/${token}`)
            .set('Cookie', 'token=secret-cookie')
            .set('X-Request-Id', 'public-request-1');

        expect(response.status).toBe(200);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url.toString()).toBe(`https://graphql.internal/api/public/sign/${token}`);
        expect(options.method).toBe('GET');
        expect(options.headers.get('cookie')).toBeNull();
        expect(options.headers.get('x-request-id')).toBe('public-request-1');
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    });

    it('forwards bounded signing JSON and preserves only safe response headers', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(new Response(
            JSON.stringify({ success: true, data: { completionQueued: true } }),
            {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                    'set-cookie': 'should-not-forward=yes',
                    'x-internal-token': 'secret',
                },
            },
        ));
        const payload = { fields: [{ id: 3, value: 'true' }] };
        const response = await request(appFor({
            kind: 'submit',
            environment: {
                PUBLIC_SIGNING_MUTATIONS_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'http://graphql.internal:3100/graphql',
            },
            fetchImpl,
        })).post(`/api/public/sign/${token}`).send(payload);

        expect(response.status).toBe(200);
        const [, options] = fetchImpl.mock.calls[0];
        expect(options.method).toBe('POST');
        expect(options.headers.get('content-type')).toBe('application/json');
        expect(JSON.parse(options.body.toString())).toEqual(payload);
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers['x-internal-token']).toBeUndefined();
    });

    it('streams bounded PDF responses with the hardened header allowlist', async () => {
        const bytes = Buffer.from('%PDF-public');
        const fetchImpl = jest.fn().mockResolvedValue(new Response(bytes, {
            status: 206,
            headers: {
                'accept-ranges': 'bytes',
                'content-type': 'application/pdf',
                'content-length': String(bytes.length),
                'content-disposition': 'inline; filename="document.pdf"',
                'content-range': `bytes 0-${bytes.length - 1}/30`,
                'content-security-policy': 'sandbox',
                etag: '"sha256-public"',
                'x-content-type-options': 'nosniff',
                'x-storage-key': 'secret',
            },
        }));
        const response = await request(appFor({
            kind: 'file',
            environment: {
                PUBLIC_SIGNING_READS_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
            },
            fetchImpl,
        }))
            .get(`/api/public/sign/${token}/file`)
            .set('Range', `bytes=0-${bytes.length - 1}`)
            .set('If-Range', '"sha256-public"')
            .set('If-None-Match', '"older"');

        expect(response.status).toBe(206);
        const [, options] = fetchImpl.mock.calls[0];
        expect(options.headers.get('range')).toBe(`bytes=0-${bytes.length - 1}`);
        expect(options.headers.get('if-range')).toBe('"sha256-public"');
        expect(options.headers.get('if-none-match')).toBe('"older"');
        expect(response.headers['accept-ranges']).toBe('bytes');
        expect(response.headers['content-range']).toBe(
            `bytes 0-${bytes.length - 1}/30`
        );
        expect(response.headers.etag).toBe('"sha256-public"');
        expect(response.headers['content-type']).toContain('application/pdf');
        expect(response.headers['content-security-policy']).toBe('sandbox');
        expect(response.headers['x-storage-key']).toBeUndefined();
    });

    it('rejects malformed capabilities locally and fails closed on upstream errors', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('contains secret URL'));
        const app = appFor({
            kind: 'session',
            environment: {
                PUBLIC_SIGNING_READS_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://graphql.internal',
            },
            fetchImpl,
        });
        expect((await request(app).get('/api/public/sign/not-a-token')).status).toBe(404);
        expect(fetchImpl).not.toHaveBeenCalled();
        const failed = await request(app).get(`/api/public/sign/${token}`);
        expect(failed.status).toBe(502);
        expect(failed.body.error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('rejects unsafe upstream configuration', () => {
        expect(() => createPublicSigningProxy({
            kind: 'session',
            environment: {
                PUBLIC_SIGNING_READS_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'ftp://graphql.internal',
            },
        })).toThrow('http or https');
        expect(() => createPublicSigningProxy({
            kind: 'session',
            environment: {
                PUBLIC_SIGNING_READS_NESTJS_ENABLED: 'true',
                GRAPHQL_UPSTREAM_URL: 'https://user:pass@graphql.internal',
            },
        })).toThrow('must not contain credentials');
    });
});
