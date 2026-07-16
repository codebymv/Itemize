const DEFAULT_TIMEOUT_MS = 10000;

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

const createGraphqlProxy = ({
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    const upstreamUrl = resolveUpstreamUrl(environment);
    const requestTimeoutMs = timeoutMs(environment);

    return async (req, res) => {
        if (!upstreamUrl) {
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
        forwardHeader(req, headers, 'x-request-id');

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
            const requestId = upstream.headers.get('x-request-id');
            if (contentType) res.set('content-type', contentType);
            if (requestId) res.set('x-request-id', requestId);

            const responseBody = Buffer.from(await upstream.arrayBuffer());
            return res.send(responseBody);
        } catch (error) {
            logger.error('GraphQL upstream request failed', {
                error: error?.name === 'AbortError' ? 'timeout' : error?.message,
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
