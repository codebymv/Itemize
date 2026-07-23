const DEFAULT_READ_TIMEOUT_MS = 60000;
const DEFAULT_WRITE_TIMEOUT_MS = 30000;
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_FILE_RESPONSE_BYTES = 25 * 1024 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;
const READ_KINDS = new Set(['session', 'file', 'download']);
const WRITE_KINDS = new Set(['verify', 'submit', 'decline']);

const publicSigningReadsEnabled = (environment = process.env) =>
    environment.PUBLIC_SIGNING_READS_NESTJS_ENABLED === 'true';
const publicSigningMutationsEnabled = (environment = process.env) =>
    environment.PUBLIC_SIGNING_MUTATIONS_NESTJS_ENABLED === 'true';

const resolveBaseUrl = (environment = process.env) => {
    const configured = environment.GRAPHQL_UPSTREAM_URL?.trim();
    if (!configured) return null;
    let upstream;
    try {
        upstream = new URL(configured);
    } catch {
        throw new Error('GRAPHQL_UPSTREAM_URL must be a valid URL');
    }
    if (!['http:', 'https:'].includes(upstream.protocol)) {
        throw new Error('GRAPHQL_UPSTREAM_URL must use http or https');
    }
    if (upstream.username || upstream.password) {
        throw new Error('GRAPHQL_UPSTREAM_URL must not contain credentials');
    }
    upstream.pathname = '/';
    upstream.search = '';
    upstream.hash = '';
    return upstream;
};

const configuredTimeout = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const pathFor = (kind, token) => {
    const encoded = encodeURIComponent(token);
    if (kind === 'session' || kind === 'submit') return `/api/public/sign/${encoded}`;
    return `/api/public/sign/${encoded}/${kind}`;
};

const responseBody = async (upstream, limit) => {
    const declared = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > limit) {
        throw Object.assign(new Error('Upstream response is too large'), {
            code: 'RESPONSE_TOO_LARGE',
        });
    }
    if (!upstream.body) return Buffer.alloc(0);
    const reader = upstream.body.getReader();
    const chunks = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > limit) {
                throw Object.assign(new Error('Upstream response is too large'), {
                    code: 'RESPONSE_TOO_LARGE',
                });
            }
            chunks.push(Buffer.from(value));
        }
    } finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks);
};

const copyHeaders = (upstream, response, names) => {
    for (const name of names) {
        const value = upstream.headers.get(name);
        if (value) response.set(name, value);
    }
};

const createPublicSigningProxy = ({
    kind,
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    if (!READ_KINDS.has(kind) && !WRITE_KINDS.has(kind)) {
        throw new Error('Public signing proxy target is not allowed');
    }
    const read = READ_KINDS.has(kind);
    const enabled = read
        ? publicSigningReadsEnabled(environment)
        : publicSigningMutationsEnabled(environment);
    const baseUrl = enabled ? resolveBaseUrl(environment) : null;
    const timeoutMs = configuredTimeout(
        read
            ? environment.PUBLIC_SIGNING_READS_UPSTREAM_TIMEOUT_MS
            : environment.PUBLIC_SIGNING_MUTATIONS_UPSTREAM_TIMEOUT_MS,
        read ? DEFAULT_READ_TIMEOUT_MS : DEFAULT_WRITE_TIMEOUT_MS,
    );
    return async (request, response, next) => {
        if (!enabled) return next();
        if (!baseUrl) {
            return response.status(503).json({
                success: false,
                error: {
                    message: 'Public signing service is unavailable',
                    code: 'SERVICE_UNAVAILABLE',
                },
            });
        }
        const token = String(request.params.token || '');
        if (!TOKEN.test(token)) {
            return response.status(404).json({
                success: false,
                error: {
                    message: 'Signing link is invalid or expired',
                    code: 'NOT_FOUND',
                },
            });
        }
        let body;
        if (!read) {
            body = Buffer.from(JSON.stringify(request.body || {}));
            if (body.length > MAX_JSON_BYTES) {
                return response.status(413).json({
                    success: false,
                    error: {
                        message: 'Signature payload is too large',
                        code: 'PAYLOAD_TOO_LARGE',
                    },
                });
            }
        }
        const headers = new Headers();
        headers.set('accept', read && kind !== 'session'
            ? 'application/pdf'
            : 'application/json');
        if (read && kind !== 'session') {
            for (const name of ['if-none-match', 'if-range', 'range']) {
                const value = request.get(name);
                if (value) headers.set(name, value);
            }
        }
        if (!read) headers.set('content-type', 'application/json');
        if (request.ip) headers.set('x-forwarded-for', String(request.ip));
        const userAgent = request.get('user-agent');
        if (userAgent) headers.set('user-agent', userAgent);
        const suppliedRequestId = request.requestId || request.get('x-request-id');
        const requestId = typeof suppliedRequestId === 'string'
            && REQUEST_ID.test(suppliedRequestId)
            ? suppliedRequestId
            : null;
        if (requestId) headers.set('x-request-id', requestId);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const upstream = await fetchImpl(
                new URL(pathFor(kind, token), baseUrl),
                {
                    method: read ? 'GET' : 'POST',
                    headers,
                    ...(body ? { body } : {}),
                    redirect: 'error',
                    signal: controller.signal,
                },
            );
            const binary = read && kind !== 'session';
            const payload = await responseBody(
                upstream,
                binary ? MAX_FILE_RESPONSE_BYTES : MAX_JSON_RESPONSE_BYTES,
            );
            response.status(upstream.status);
            copyHeaders(upstream, response, [
                'accept-ranges',
                'cache-control',
                'content-disposition',
                'content-length',
                'content-range',
                'content-security-policy',
                'content-type',
                'etag',
                'referrer-policy',
                'retry-after',
                'x-content-type-options',
                'x-request-id',
                'x-robots-tag',
            ]);
            if (!response.get('x-request-id') && requestId) {
                response.set('x-request-id', requestId);
            }
            return response.send(payload);
        } catch (error) {
            logger.error?.('Public signing proxy failed', {
                event: 'public_signing_proxy_failed',
                kind,
                requestId,
                failureReason: error?.name === 'AbortError'
                    ? 'timeout'
                    : error?.code === 'RESPONSE_TOO_LARGE'
                        ? 'response_too_large'
                        : 'upstream_failure',
            });
            return response.status(502).json({
                success: false,
                error: {
                    message: 'Public signing service is unavailable',
                    code: 'SERVICE_UNAVAILABLE',
                },
            });
        } finally {
            clearTimeout(timeout);
        }
    };
};

module.exports = {
    createPublicSigningProxy,
    publicSigningMutationsEnabled,
    publicSigningReadsEnabled,
    resolveBaseUrl,
};
