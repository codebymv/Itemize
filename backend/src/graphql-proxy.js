const DEFAULT_TIMEOUT_MS = 10000;
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const ACCEPTED_OPERATION_NAME = /^[_A-Za-z][_0-9A-Za-z]{0,127}$/;

const graphqlError = (message, code) => ({
    errors: [{ message, extensions: { code } }],
    data: null,
});

const resolveUpstreamUrl = (environment = process.env) => {
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

    return upstream.toString();
};

const timeoutMs = (environment) => {
    const configured = Number(environment.GRAPHQL_UPSTREAM_TIMEOUT_MS);
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

const operationMetadata = (body) => {
    const requestedName = typeof body?.operationName === 'string'
        && ACCEPTED_OPERATION_NAME.test(body.operationName)
        ? body.operationName
        : null;
    const query = typeof body?.query === 'string' ? body.query : '';
    const definitions = [...query.matchAll(/\b(query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)\b/g)];
    const selected = requestedName
        ? definitions.find((definition) => definition[2] === requestedName)
        : definitions[0];

    return {
        operationName: requestedName || selected?.[2] || 'anonymous',
        operationType: selected?.[1] || (query.trimStart().startsWith('{') ? 'query' : 'unknown'),
    };
};

const graphqlErrorCodes = (responseBody) => {
    try {
        const parsed = JSON.parse(responseBody.toString('utf8'));
        if (!Array.isArray(parsed?.errors)) return [];
        return [...new Set(parsed.errors.map((error) => (
            typeof error?.extensions?.code === 'string'
                ? error.extensions.code
                : 'UNKNOWN'
        )))].sort();
    } catch {
        return [];
    }
};

const elapsedMilliseconds = (startedAt) => Number(process.hrtime.bigint() - startedAt) / 1e6;

const logOperation = (logger, event) => {
    const isServerError = event.statusCode >= 500
        || event.errorCodes.includes('INTERNAL_SERVER_ERROR')
        || event.errorCodes.includes('SERVICE_UNAVAILABLE');
    const level = isServerError ? 'error' : event.errorCount > 0 ? 'warn' : 'info';
    const writer = logger?.[level] || logger?.log;
    if (typeof writer === 'function') {
        writer.call(logger, 'GraphQL operation completed', event);
    }
};

const createGraphqlProxy = ({
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    const upstreamUrl = resolveUpstreamUrl(environment);
    const requestTimeoutMs = timeoutMs(environment);

    return async (req, res) => {
        const startedAt = process.hrtime.bigint();
        const requestId = requestIdFor(req);
        const operation = operationMetadata(req.body);

        if (!upstreamUrl) {
            logOperation(logger, {
                event: 'graphql_operation_completed',
                layer: 'legacy_proxy',
                transport: 'graphql_proxy',
                requestId,
                ...operation,
                statusCode: 503,
                durationMs: elapsedMilliseconds(startedAt),
                outcome: 'error',
                operationCount: 1,
                errorCount: 1,
                errorCodes: ['SERVICE_UNAVAILABLE'],
            });
            return res.status(503).json(graphqlError(
                'GraphQL service is unavailable',
                'SERVICE_UNAVAILABLE',
            ));
        }

        const headers = new Headers({
            accept: 'application/json',
            'content-type': 'application/json',
        });
        forwardHeader(req, headers, 'cookie');
        forwardHeader(req, headers, 'x-organization-id');
        forwardHeader(req, headers, 'x-csrf-token');
        if (typeof req.ip === 'string' && req.ip.length > 0) {
            headers.set('x-forwarded-for', req.ip);
        }
        if (requestId) headers.set('x-request-id', requestId);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

        try {
            const body = req.rawBody?.length
                ? req.rawBody
                : Buffer.from(JSON.stringify(req.body ?? {}));
            const upstream = await fetchImpl(upstreamUrl, {
                method: 'POST',
                headers,
                body,
                signal: controller.signal,
            });

            res.status(upstream.status);
            const contentType = upstream.headers.get('content-type');
            const upstreamRequestId = upstream.headers.get('x-request-id');
            if (contentType) res.set('content-type', contentType);
            for (const name of ['cache-control', 'pragma', 'expires', 'x-csrf-token']) {
                const value = upstream.headers.get(name);
                if (value) res.set(name, value);
            }
            const setCookies = typeof upstream.headers.getSetCookie === 'function'
                ? upstream.headers.getSetCookie()
                : [];
            const authenticationCookies = setCookies.filter((cookie) => (
                /^(itemize_auth|itemize_refresh|csrf-token)=/.test(cookie)
            ));
            if (authenticationCookies.length > 0) {
                res.setHeader('set-cookie', authenticationCookies);
            }
            if (upstreamRequestId || requestId) {
                res.set('x-request-id', upstreamRequestId || requestId);
            }

            const responseBody = Buffer.from(await upstream.arrayBuffer());
            const errorCodes = graphqlErrorCodes(responseBody);
            if (upstream.status >= 400 && errorCodes.length === 0) {
                errorCodes.push('UNKNOWN');
            }
            logOperation(logger, {
                event: 'graphql_operation_completed',
                layer: 'legacy_proxy',
                transport: 'graphql_proxy',
                requestId: upstreamRequestId || requestId,
                ...operation,
                statusCode: upstream.status,
                durationMs: elapsedMilliseconds(startedAt),
                outcome: errorCodes.length > 0 ? 'error' : 'success',
                operationCount: 1,
                errorCount: errorCodes.length > 0 ? 1 : 0,
                errorCodes,
            });
            return res.send(responseBody);
        } catch (error) {
            logOperation(logger, {
                event: 'graphql_operation_completed',
                layer: 'legacy_proxy',
                transport: 'graphql_proxy',
                requestId,
                ...operation,
                statusCode: 502,
                durationMs: elapsedMilliseconds(startedAt),
                outcome: 'error',
                operationCount: 1,
                errorCount: 1,
                errorCodes: ['SERVICE_UNAVAILABLE'],
                failureReason: error?.name === 'AbortError' ? 'timeout' : 'upstream_failure',
            });
            return res.status(502).json(graphqlError(
                'GraphQL service is unavailable',
                'SERVICE_UNAVAILABLE',
            ));
        } finally {
            clearTimeout(timeout);
        }
    };
};

module.exports = {
    createGraphqlProxy,
    resolveUpstreamUrl,
};
