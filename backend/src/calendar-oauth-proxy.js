const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const ACTIONS = new Set(['auth', 'callback', 'calendars']);

const calendarOAuthEnabled = (environment = process.env) =>
    environment.CALENDAR_OAUTH_NESTJS_ENABLED === 'true';

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
        message: 'Calendar integration service is unavailable',
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

const createCalendarOAuthProxy = ({
    action,
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    if (!ACTIONS.has(action)) throw new Error('Calendar OAuth proxy target is not allowed');
    const enabled = calendarOAuthEnabled(environment);
    const baseUrl = enabled ? resolveBaseUrl(environment) : null;
    const configuredTimeout = Number(environment.CALENDAR_OAUTH_UPSTREAM_TIMEOUT_MS);
    const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_TIMEOUT_MS;
    return async (request, response, next) => {
        if (!enabled) return next();
        if (!baseUrl) {
            return response.status(503).json(unavailableBody());
        }
        let target;
        if (action === 'auth') {
            target = new URL('/api/calendar-integrations/google/auth', baseUrl);
            const returnUrl = request.query.return_url;
            if (typeof returnUrl === 'string') target.searchParams.set('return_url', returnUrl);
        } else if (action === 'callback') {
            target = new URL('/api/calendar-integrations/google/callback', baseUrl);
            for (const name of ['code', 'state', 'error']) {
                const value = request.query[name];
                if (typeof value === 'string') target.searchParams.set(name, value);
            }
        } else {
            target = new URL(
                `/api/calendar-integrations/google/calendars/${encodeURIComponent(String(request.params.connectionId || ''))}`,
                baseUrl,
            );
        }
        const headers = new Headers({ accept: 'application/json' });
        if (action !== 'callback') {
            // These routes authenticate with the shared cookie session and the
            // organization selector; both stay inside our own origin-to-service hop.
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
                method: 'GET',
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
            logger.error?.('Calendar OAuth proxy failed', {
                event: 'calendar_oauth_proxy_failed',
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
    createCalendarOAuthProxy,
    calendarOAuthEnabled,
};
