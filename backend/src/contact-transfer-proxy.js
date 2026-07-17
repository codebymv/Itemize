const DEFAULT_TIMEOUT_MS = 30000;
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const enabled = (environment = process.env) =>
    environment.CONTACT_TRANSFERS_NESTJS_ENABLED === 'true';

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

const timeoutMs = (environment) => {
    const configured = Number(environment.CONTACT_TRANSFERS_UPSTREAM_TIMEOUT_MS);
    return Number.isSafeInteger(configured) && configured > 0
        ? configured
        : DEFAULT_TIMEOUT_MS;
};

const forwardHeader = (request, headers, name) => {
    const value = request.get(name);
    if (value) headers.set(name, value);
};

const requestIdFor = (request) => {
    if (typeof request.requestId === 'string' && ACCEPTED_REQUEST_ID.test(request.requestId)) {
        return request.requestId;
    }
    const supplied = request.get('x-request-id');
    return typeof supplied === 'string' && ACCEPTED_REQUEST_ID.test(supplied)
        ? supplied
        : null;
};

const elapsedMilliseconds = (startedAt) =>
    Number(process.hrtime.bigint() - startedAt) / 1e6;

const writeEvent = (logger, event) => {
    const writer = event.statusCode >= 500
        ? logger?.error
        : event.statusCode >= 400
            ? logger?.warn
            : logger?.info;
    if (typeof writer === 'function') {
        writer.call(logger, 'Contact transfer proxy completed', event);
    }
};

const createTarget = (baseUrl, request, action) => {
    const target = new URL(
        action === 'export'
            ? '/api/contacts/export/csv'
            : '/api/contacts/import/csv',
        baseUrl,
    );
    if (action === 'export') {
        const status = request.query.status;
        const tags = request.query.tags;
        if (typeof status === 'string') target.searchParams.set('status', status);
        if (Array.isArray(tags)) {
            tags
                .filter(value => typeof value === 'string')
                .forEach(value => target.searchParams.append('tags', value));
        } else if (typeof tags === 'string') {
            target.searchParams.set('tags', tags);
        }
    }
    return target;
};

const createContactTransferProxy = ({
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    const proxyEnabled = enabled(environment);
    const baseUrl = proxyEnabled ? resolveBaseUrl(environment) : null;
    const requestTimeoutMs = timeoutMs(environment);

    return async (req, res, next) => {
        if (!proxyEnabled) return next();
        const action = req.method === 'GET' ? 'export' : 'import';
        const startedAt = process.hrtime.bigint();
        const requestId = requestIdFor(req);
        const event = {
            event: 'contact_transfer_proxy_completed',
            layer: 'legacy_proxy',
            transport: 'http_proxy',
            action,
            requestId,
        };

        if (!baseUrl) {
            writeEvent(logger, {
                ...event,
                statusCode: 503,
                durationMs: elapsedMilliseconds(startedAt),
                outcome: 'error',
                errorCode: 'SERVICE_UNAVAILABLE',
            });
            return res.status(503).json({
                error: 'Contact transfer service is unavailable',
                code: 'SERVICE_UNAVAILABLE',
            });
        }

        const headers = new Headers({
            accept: action === 'export' ? 'text/csv' : 'application/json',
        });
        forwardHeader(req, headers, 'cookie');
        forwardHeader(req, headers, 'x-organization-id');
        forwardHeader(req, headers, 'x-csrf-token');
        if (requestId) headers.set('x-request-id', requestId);
        if (action === 'import') headers.set('content-type', 'application/json');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
            const upstream = await fetchImpl(
                createTarget(baseUrl, req, action),
                {
                    method: req.method,
                    headers,
                    ...(action === 'import'
                        ? {
                            body: req.rawBody?.length
                                ? req.rawBody
                                : Buffer.from(JSON.stringify(req.body ?? {})),
                        }
                        : {}),
                    signal: controller.signal,
                },
            );
            res.status(upstream.status);
            for (const header of [
                'cache-control',
                'content-disposition',
                'content-type',
                'x-content-type-options',
                'x-request-id',
            ]) {
                const value = upstream.headers.get(header);
                if (value) res.set(header, value);
            }
            if (!res.get('x-request-id') && requestId) {
                res.set('x-request-id', requestId);
            }
            const responseBody = Buffer.from(await upstream.arrayBuffer());
            writeEvent(logger, {
                ...event,
                requestId: res.get('x-request-id') || requestId,
                statusCode: upstream.status,
                durationMs: elapsedMilliseconds(startedAt),
                outcome: upstream.status >= 400 ? 'error' : 'success',
                errorCode: upstream.status >= 400 ? 'UPSTREAM_REJECTED' : null,
            });
            return res.send(responseBody);
        } catch (error) {
            writeEvent(logger, {
                ...event,
                statusCode: 502,
                durationMs: elapsedMilliseconds(startedAt),
                outcome: 'error',
                errorCode: 'SERVICE_UNAVAILABLE',
                failureReason: error?.name === 'AbortError'
                    ? 'timeout'
                    : 'upstream_failure',
            });
            return res.status(502).json({
                error: 'Contact transfer service is unavailable',
                code: 'SERVICE_UNAVAILABLE',
            });
        } finally {
            clearTimeout(timeout);
        }
    };
};

module.exports = {
    createContactTransferProxy,
    enabled,
    resolveBaseUrl,
};
