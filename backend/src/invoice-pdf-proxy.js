const DEFAULT_TIMEOUT_MS = 60000;
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const enabled = (environment = process.env) =>
    environment.INVOICE_PDF_NESTJS_ENABLED === 'true';

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
    const configured = Number(environment.INVOICE_PDF_UPSTREAM_TIMEOUT_MS);
    return Number.isSafeInteger(configured) && configured > 0
        ? configured
        : DEFAULT_TIMEOUT_MS;
};

const elapsedMilliseconds = (startedAt) =>
    Number(process.hrtime.bigint() - startedAt) / 1e6;

const requestIdFor = (request) => {
    if (typeof request.requestId === 'string' && ACCEPTED_REQUEST_ID.test(request.requestId)) {
        return request.requestId;
    }
    const supplied = request.get('x-request-id');
    return typeof supplied === 'string' && ACCEPTED_REQUEST_ID.test(supplied)
        ? supplied
        : null;
};

const writeEvent = (logger, event) => {
    const writer = event.statusCode >= 500
        ? logger?.error
        : event.statusCode >= 400
            ? logger?.warn
            : logger?.info;
    if (typeof writer === 'function') {
        writer.call(logger, 'Invoice PDF proxy completed', event);
    }
};

const createInvoicePdfProxy = ({
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    const proxyEnabled = enabled(environment);
    const baseUrl = proxyEnabled ? resolveBaseUrl(environment) : null;
    const requestTimeoutMs = timeoutMs(environment);

    return async (req, res, next) => {
        if (!proxyEnabled) return next();
        const startedAt = process.hrtime.bigint();
        const requestId = requestIdFor(req);
        const event = {
            event: 'invoice_pdf_proxy_completed',
            layer: 'legacy_proxy',
            transport: 'http_proxy',
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
                error: 'Invoice PDF service is unavailable',
                code: 'SERVICE_UNAVAILABLE',
            });
        }

        const target = new URL(
            `/api/invoices/${encodeURIComponent(req.params.id)}/pdf`,
            baseUrl,
        );
        const headers = new Headers({ accept: 'application/pdf' });
        for (const name of ['cookie', 'x-organization-id']) {
            const value = req.get(name);
            if (value) headers.set(name, value);
        }
        if (requestId) headers.set('x-request-id', requestId);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
            const upstream = await fetchImpl(target, {
                method: 'GET',
                headers,
                signal: controller.signal,
            });
            res.status(upstream.status);
            for (const name of [
                'cache-control',
                'content-disposition',
                'content-length',
                'content-security-policy',
                'content-type',
                'x-content-type-options',
                'x-request-id',
            ]) {
                const value = upstream.headers.get(name);
                if (value) res.set(name, value);
            }
            if (!res.get('x-request-id') && requestId) {
                res.set('x-request-id', requestId);
            }
            const body = Buffer.from(await upstream.arrayBuffer());
            writeEvent(logger, {
                ...event,
                requestId: res.get('x-request-id') || requestId,
                statusCode: upstream.status,
                durationMs: elapsedMilliseconds(startedAt),
                outcome: upstream.status >= 400 ? 'error' : 'success',
                errorCode: upstream.status >= 400 ? 'UPSTREAM_REJECTED' : null,
            });
            return res.send(body);
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
                error: 'Invoice PDF service is unavailable',
                code: 'SERVICE_UNAVAILABLE',
            });
        } finally {
            clearTimeout(timeout);
        }
    };
};

module.exports = { createInvoicePdfProxy, enabled, resolveBaseUrl };
