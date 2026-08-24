/**
 * Shared plumbing for default-off provider-OAuth proxies: session and
 * organization forwarding for authenticated begins, query passthrough,
 * and manual redirect passthrough for provider callbacks.
 */
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

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

/**
 * @param {Object} options
 * @param {boolean} options.enabled - Evaluated flag; disabled proxies fall through.
 * @param {string} options.path - Upstream path.
 * @param {string[]} options.queryParams - Query parameters to forward.
 * @param {boolean} options.forwardSession - Forward cookie and organization selector.
 * @param {string} options.method - HTTP method (GET or POST).
 * @param {string} options.eventName - Structured failure event name.
 * @param {string} options.unavailableMessage - 503/502 error message.
 */
const createOAuthRouteProxy = ({
    enabled,
    path,
    queryParams = [],
    forwardSession = false,
    method = 'GET',
    eventName,
    unavailableMessage,
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
}) => {
    const baseUrl = enabled ? resolveBaseUrl(environment) : null;
    const configuredTimeout = Number(environment.OAUTH_PROXY_UPSTREAM_TIMEOUT_MS);
    const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_TIMEOUT_MS;
    const unavailableBody = () => ({
        success: false,
        error: { message: unavailableMessage, code: 'SERVICE_UNAVAILABLE' },
    });
    return async (request, response, next) => {
        if (!enabled) return next();
        if (!baseUrl) {
            return response.status(503).json(unavailableBody());
        }
        const target = new URL(path, baseUrl);
        for (const name of queryParams) {
            const value = request.query[name];
            if (typeof value === 'string') target.searchParams.set(name, value);
        }
        const headers = new Headers({ accept: 'application/json' });
        if (forwardSession) {
            for (const name of ['cookie', 'x-organization-id']) {
                const value = request.get(name);
                if (value) headers.set(name, value);
            }
        }
        const suppliedRequestId = request.requestId || request.get('x-request-id');
        const requestId = typeof suppliedRequestId === 'string'
            && REQUEST_ID.test(suppliedRequestId) ? suppliedRequestId : null;
        if (requestId) headers.set('x-request-id', requestId);
        if (request.ip) headers.set('x-forwarded-for', String(request.ip));
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const upstream = await fetchImpl(target, {
                method,
                headers,
                redirect: 'manual',
                signal: controller.signal,
            });
            const payload = await responseBody(upstream);
            response.status(upstream.status);
            for (const name of [
                'cache-control', 'content-type', 'location', 'retry-after',
                'x-content-type-options', 'x-request-id',
            ]) {
                const value = upstream.headers.get(name);
                if (value) response.set(name, value);
            }
            if (!response.get('x-request-id') && requestId) response.set('x-request-id', requestId);
            return response.send(payload);
        } catch (error) {
            logger.error?.('Provider OAuth proxy failed', {
                event: eventName,
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

module.exports = { createOAuthRouteProxy };
