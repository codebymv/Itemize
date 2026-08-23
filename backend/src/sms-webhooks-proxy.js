const DEFAULT_TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const ACTIONS = new Set(['status', 'inbound']);

const smsWebhooksEnabled = (environment = process.env) =>
    environment.SMS_WEBHOOKS_NESTJS_ENABLED === 'true';

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

const forwardedBody = (request) => {
    if (Buffer.isBuffer(request.rawBody)) return request.rawBody;
    // Twilio signatures are computed over the sorted parsed parameters, so
    // a stable re-serialization keeps validation intact when the raw form
    // bytes were not captured.
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(request.body ?? {})) {
        params.append(name, String(value));
    }
    return Buffer.from(params.toString(), 'utf8');
};

const createSmsWebhookProxy = ({
    action,
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    if (!ACTIONS.has(action)) throw new Error('SMS webhook proxy target is not allowed');
    const enabled = smsWebhooksEnabled(environment);
    const baseUrl = enabled ? resolveBaseUrl(environment) : null;
    const configuredTimeout = Number(environment.SMS_WEBHOOKS_UPSTREAM_TIMEOUT_MS);
    const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : DEFAULT_TIMEOUT_MS;
    return async (request, response, next) => {
        if (!enabled) return next();
        if (!baseUrl) {
            return response.status(503).send('Webhook verification unavailable');
        }
        const headers = new Headers({
            accept: 'text/plain, text/xml, application/json',
            'content-type': request.get('content-type') || 'application/x-www-form-urlencoded',
        });
        const twilioSignature = request.get('x-twilio-signature');
        if (twilioSignature) headers.set('x-twilio-signature', twilioSignature);
        // The signature binds the public URL Twilio posted to; hand the
        // original protocol and host to the upstream verifier.
        headers.set('x-forwarded-proto', request.protocol);
        const host = request.get('host');
        if (host) headers.set('x-forwarded-host', host);
        const suppliedRequestId = request.requestId || request.get('x-request-id');
        const requestId = typeof suppliedRequestId === 'string'
            && REQUEST_ID.test(suppliedRequestId) ? suppliedRequestId : null;
        if (requestId) headers.set('x-request-id', requestId);
        if (request.ip) headers.set('x-forwarded-for', String(request.ip));
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const upstream = await fetchImpl(
                new URL(`/api/sms-templates/webhook/${action}`, baseUrl),
                {
                    method: 'POST',
                    headers,
                    body: forwardedBody(request),
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
            logger.error?.('SMS webhook proxy failed', {
                event: 'sms_webhook_proxy_failed',
                action,
                requestId,
                failureReason: error?.name === 'AbortError'
                    ? 'timeout'
                    : error?.code === 'RESPONSE_TOO_LARGE'
                        ? 'response_too_large'
                        : 'upstream_failure',
            });
            return response.status(502).send('Error');
        } finally {
            clearTimeout(timeout);
        }
    };
};

module.exports = {
    createSmsWebhookProxy,
    smsWebhooksEnabled,
};
