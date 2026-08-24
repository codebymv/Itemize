const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const ROUTES = Object.freeze({
    config: { method: 'GET', path: (req) => `/api/chat-widget/public/config/${encodeURIComponent(String(req.params.widgetKey || ''))}` },
    session: { method: 'POST', path: () => '/api/chat-widget/public/session' },
    'messages-read': {
        method: 'GET',
        path: (req) => `/api/chat-widget/public/messages/${encodeURIComponent(String(req.params.sessionToken || ''))}`,
        queryParams: ['after'],
    },
    'messages-send': { method: 'POST', path: () => '/api/chat-widget/public/messages' },
    'end-session': { method: 'POST', path: () => '/api/chat-widget/public/end-session' },
    typing: { method: 'POST', path: () => '/api/chat-widget/public/typing' },
});

const chatWidgetPublicEnabled = (environment = process.env) =>
    environment.CHAT_WIDGET_PUBLIC_NESTJS_ENABLED === 'true';

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
        message: 'Chat widget service is unavailable',
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

const createChatWidgetPublicProxy = ({
    action,
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    const route = ROUTES[action];
    if (!route) throw new Error('Chat widget proxy target is not allowed');
    const enabled = chatWidgetPublicEnabled(environment);
    const baseUrl = enabled ? resolveBaseUrl(environment) : null;
    const configuredTimeout = Number(environment.CHAT_WIDGET_PUBLIC_UPSTREAM_TIMEOUT_MS);
    const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_TIMEOUT_MS;
    return async (request, response, next) => {
        if (!enabled) return next();
        if (!baseUrl) {
            return response.status(503).json(unavailableBody());
        }
        const target = new URL(route.path(request), baseUrl);
        for (const name of route.queryParams || []) {
            const value = request.query[name];
            if (typeof value === 'string') target.searchParams.set(name, value);
        }
        const headers = new Headers({ accept: 'application/json' });
        const suppliedRequestId = request.requestId || request.get('x-request-id');
        const requestId = typeof suppliedRequestId === 'string'
            && REQUEST_ID.test(suppliedRequestId) ? suppliedRequestId : null;
        if (requestId) headers.set('x-request-id', requestId);
        if (request.ip) headers.set('x-forwarded-for', String(request.ip));
        const userAgent = request.get('user-agent');
        if (userAgent) headers.set('user-agent', userAgent);
        if (route.method === 'POST') headers.set('content-type', 'application/json');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const upstream = await fetchImpl(target, {
                method: route.method,
                headers,
                redirect: 'error',
                signal: controller.signal,
                ...(route.method === 'POST'
                    ? { body: JSON.stringify(request.body ?? {}) }
                    : {}),
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
            logger.error?.('Chat widget public proxy failed', {
                event: 'chat_widget_public_proxy_failed',
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
    createChatWidgetPublicProxy,
    chatWidgetPublicEnabled,
};
