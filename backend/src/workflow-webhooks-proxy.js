const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const workflowWebhooksEnabled = (environment = process.env) =>
    environment.WORKFLOW_WEBHOOKS_NESTJS_ENABLED === 'true';

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
        message: 'Workflow webhook service is unavailable',
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

const createWorkflowWebhookProxy = ({
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    const enabled = workflowWebhooksEnabled(environment);
    const baseUrl = enabled ? resolveBaseUrl(environment) : null;
    const configuredTimeout = Number(environment.WORKFLOW_WEBHOOKS_UPSTREAM_TIMEOUT_MS);
    const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_TIMEOUT_MS;
    return async (request, response, next) => {
        if (!enabled) return next();
        if (!baseUrl) {
            return response.status(503).json(unavailableBody());
        }
        const workflowId = String(request.params.workflowId || '');
        // The HMAC covers the exact raw bytes; forward them untouched. When
        // no raw capture exists, fall back to the same re-serialization the
        // retained verifier signs against.
        const body = Buffer.isBuffer(request.rawBody)
            ? request.rawBody
            : Buffer.from(JSON.stringify(request.body || {}), 'utf8');
        const headers = new Headers({
            accept: 'application/json',
            'content-type': request.get('content-type') || 'application/json',
        });
        for (const name of [
            'x-itemize-signature', 'x-itemize-timestamp', 'x-itemize-delivery-id',
        ]) {
            const value = request.get(name);
            if (value) headers.set(name, value);
        }
        const suppliedRequestId = request.requestId || request.get('x-request-id');
        const requestId = typeof suppliedRequestId === 'string'
            && REQUEST_ID.test(suppliedRequestId) ? suppliedRequestId : null;
        if (requestId) headers.set('x-request-id', requestId);
        if (request.ip) headers.set('x-forwarded-for', String(request.ip));
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const upstream = await fetchImpl(
                new URL(`/api/webhooks/${encodeURIComponent(workflowId)}`, baseUrl),
                {
                    method: 'POST',
                    headers,
                    body,
                    redirect: 'error',
                    signal: controller.signal,
                },
            );
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
            logger.error?.('Workflow webhook proxy failed', {
                event: 'workflow_webhook_proxy_failed',
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
    createWorkflowWebhookProxy,
    workflowWebhooksEnabled,
};
