const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const socialWebhooksEnabled = (environment = process.env) =>
    environment.SOCIAL_WEBHOOKS_NESTJS_ENABLED === 'true';

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

const createSocialWebhookProxy = ({
    method,
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    if (!['verify', 'receive'].includes(method)) {
        throw new Error('Social webhook proxy target is not allowed');
    }
    const enabled = socialWebhooksEnabled(environment);
    const baseUrl = enabled ? resolveBaseUrl(environment) : null;
    const configuredTimeout = Number(environment.SOCIAL_WEBHOOKS_UPSTREAM_TIMEOUT_MS);
    const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_TIMEOUT_MS;
    return async (request, response, next) => {
        if (!enabled) return next();
        if (!baseUrl) {
            return response.sendStatus(503);
        }
        const target = new URL('/api/social/webhook', baseUrl);
        const headers = new Headers({ accept: 'text/plain, application/json' });
        let body;
        if (method === 'verify') {
            for (const name of ['hub.mode', 'hub.verify_token', 'hub.challenge']) {
                const value = request.query[name];
                if (typeof value === 'string') target.searchParams.set(name, value);
            }
        } else {
            // The HMAC covers the exact raw bytes; the flag-on stack parses
            // this path raw before the proxy runs.
            body = Buffer.isBuffer(request.body)
                ? request.body
                : Buffer.isBuffer(request.rawBody)
                    ? request.rawBody
                    : Buffer.from(JSON.stringify(request.body || {}), 'utf8');
            headers.set('content-type', request.get('content-type') || 'application/json');
            const signature = request.get('x-hub-signature-256');
            if (signature) headers.set('x-hub-signature-256', signature);
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
                method: method === 'verify' ? 'GET' : 'POST',
                headers,
                redirect: 'error',
                signal: controller.signal,
                ...(method === 'receive' ? { body } : {}),
            });
            const payload = await responseBody(upstream);
            response.status(upstream.status);
            for (const name of [
                'cache-control', 'content-type', 'retry-after',
                'x-content-type-options', 'x-request-id',
            ]) {
                const value = upstream.headers.get(name);
                if (value) response.set(name, value);
            }
            if (!response.get('x-request-id') && requestId) response.set('x-request-id', requestId);
            return response.send(payload);
        } catch (error) {
            logger.error?.('Social webhook proxy failed', {
                event: 'social_webhook_proxy_failed',
                method,
                requestId,
                failureReason: error?.name === 'AbortError'
                    ? 'timeout'
                    : error?.code === 'RESPONSE_TOO_LARGE'
                        ? 'response_too_large'
                        : 'upstream_failure',
            });
            return response.sendStatus(502);
        } finally {
            clearTimeout(timeout);
        }
    };
};

module.exports = {
    createSocialWebhookProxy,
    socialWebhooksEnabled,
};
