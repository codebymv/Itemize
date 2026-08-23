const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const IDENTIFIER = /^[^\s/\\]{1,255}$/;
const CANCELLATION_TOKEN = /^[a-f0-9]{64}$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const ACTIONS = new Set(['page', 'slots', 'create', 'cancel']);

const publicBookingsEnabled = (environment = process.env) =>
    environment.PUBLIC_BOOKINGS_NESTJS_ENABLED === 'true';

const resolveBaseUrl = (environment = process.env) => {
    const configured = environment.GRAPHQL_UPSTREAM_URL?.trim();
    if (!configured) return null;
    let upstream;
    try { upstream = new URL(configured); } catch {
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

const unavailableBody = () => ({
    success: false,
    error: {
        message: 'Booking service is unavailable',
        code: 'SERVICE_UNAVAILABLE',
    },
});

const responseBody = async (upstream) => {
    const declared = Number(upstream.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
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
            if (length > MAX_RESPONSE_BYTES) {
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

const createTarget = (baseUrl, request, action) => {
    const slug = encodeURIComponent(String(request.params.slug || ''));
    if (action === 'page') {
        return new URL(`/api/bookings/public/book/${slug}`, baseUrl);
    }
    if (action === 'slots') {
        const target = new URL(`/api/bookings/public/book/${slug}/slots`, baseUrl);
        for (const name of ['start_date', 'end_date']) {
            const value = request.query[name];
            if (typeof value === 'string') target.searchParams.set(name, value);
        }
        return target;
    }
    if (action === 'create') {
        return new URL(`/api/bookings/public/book/${slug}`, baseUrl);
    }
    const token = encodeURIComponent(String(request.params.token || ''));
    return new URL(`/api/bookings/public/book/${slug}/cancel/${token}`, baseUrl);
};

const createPublicBookingsProxy = ({
    action,
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    if (!ACTIONS.has(action)) throw new Error('Public bookings proxy target is not allowed');
    const enabled = publicBookingsEnabled(environment);
    const baseUrl = enabled ? resolveBaseUrl(environment) : null;
    const configuredTimeout = Number(environment.PUBLIC_BOOKINGS_UPSTREAM_TIMEOUT_MS);
    const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_TIMEOUT_MS;
    return async (request, response, next) => {
        if (!enabled) return next();
        if (!baseUrl) {
            return response.status(503).json(unavailableBody());
        }
        if (!IDENTIFIER.test(String(request.params.slug || ''))) {
            return response.status(404).json({ error: 'Calendar not found' });
        }
        if (action === 'cancel'
            && !CANCELLATION_TOKEN.test(String(request.params.token || ''))) {
            return response.status(404).json({
                error: 'Booking not found or already cancelled',
            });
        }
        const method = action === 'page' || action === 'slots' ? 'GET' : 'POST';
        const headers = new Headers({ accept: 'application/json' });
        const suppliedRequestId = request.requestId || request.get('x-request-id');
        const requestId = typeof suppliedRequestId === 'string'
            && REQUEST_ID.test(suppliedRequestId) ? suppliedRequestId : null;
        if (requestId) headers.set('x-request-id', requestId);
        if (request.ip) headers.set('x-forwarded-for', String(request.ip));
        const userAgent = request.get('user-agent');
        if (userAgent) headers.set('user-agent', userAgent);
        if (method === 'POST') headers.set('content-type', 'application/json');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const upstream = await fetchImpl(
                createTarget(baseUrl, request, action),
                {
                    method,
                    headers,
                    redirect: 'error',
                    signal: controller.signal,
                    ...(method === 'POST'
                        ? { body: JSON.stringify(request.body ?? {}) }
                        : {}),
                },
            );
            const payload = await responseBody(upstream);
            response.status(upstream.status);
            for (const name of [
                'cache-control', 'content-security-policy', 'content-type',
                'referrer-policy', 'retry-after', 'x-content-type-options',
                'x-request-id', 'x-robots-tag',
            ]) {
                const value = upstream.headers.get(name);
                if (value) response.set(name, value);
            }
            if (!response.get('x-request-id') && requestId) response.set('x-request-id', requestId);
            return response.send(payload);
        } catch (error) {
            logger.error?.('Public bookings proxy failed', {
                event: 'public_bookings_proxy_failed',
                action,
                requestId,
                failureReason: error?.name === 'AbortError'
                    ? 'timeout'
                    : error?.code === 'RESPONSE_TOO_LARGE'
                        ? 'response_too_large'
                        : 'upstream_failure',
            });
            return response.status(502).json(unavailableBody());
        } finally {
            clearTimeout(timeout);
        }
    };
};

module.exports = {
    createPublicBookingsProxy,
    publicBookingsEnabled,
};
