const DEFAULT_TIMEOUT_MS = 30000;
const MAX_MULTIPART_BYTES = 2304 * 1024;
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TARGETS = new Set([
    '/api/invoices/settings/logo',
    '/api/invoices/businesses/:id/logo',
]);

const enabled = (environment = process.env) =>
    environment.INVOICE_LOGO_UPLOADS_NESTJS_ENABLED === 'true';

const resolveBaseUrl = (environment = process.env) => {
    const configured = environment.GRAPHQL_UPSTREAM_URL?.trim();
    if (!configured) return null;
    let upstream;
    try { upstream = new URL(configured); } catch { throw new Error('GRAPHQL_UPSTREAM_URL must be a valid URL'); }
    if (!['http:', 'https:'].includes(upstream.protocol)) {
        throw new Error('GRAPHQL_UPSTREAM_URL must use http or https');
    }
    if (upstream.username || upstream.password) {
        throw new Error('GRAPHQL_UPSTREAM_URL must not contain credentials');
    }
    upstream.pathname = '/'; upstream.search = ''; upstream.hash = '';
    return upstream;
};

const readBody = (request) => new Promise((resolve, reject) => {
    const declared = Number(request.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_MULTIPART_BYTES) {
        request.resume();
        return reject(Object.assign(new Error('Multipart body is too large'), { code: 'BODY_TOO_LARGE' }));
    }
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_MULTIPART_BYTES) return;
        chunks.push(chunk);
    });
    request.on('end', () => {
        if (size > MAX_MULTIPART_BYTES) {
            reject(Object.assign(new Error('Multipart body is too large'), { code: 'BODY_TOO_LARGE' }));
        } else resolve(Buffer.concat(chunks));
    });
    request.on('error', reject);
});

const createInvoiceLogoUploadProxy = ({
    targetPath,
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    if (!TARGETS.has(targetPath)) throw new Error('Invoice logo proxy target is not allowed');
    const proxyEnabled = enabled(environment);
    const baseUrl = proxyEnabled ? resolveBaseUrl(environment) : null;
    const configuredTimeout = Number(environment.INVOICE_LOGO_UPLOADS_UPSTREAM_TIMEOUT_MS);
    const timeoutMs = Number.isSafeInteger(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout : DEFAULT_TIMEOUT_MS;

    return async (req, res, next) => {
        if (!proxyEnabled) return next();
        if (!baseUrl) return res.status(503).json({
            error: 'Invoice logo upload service is unavailable', code: 'SERVICE_UNAVAILABLE',
        });
        const contentType = req.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
            return res.status(400).json({ error: 'Multipart form data is required', code: 'BAD_REQUEST' });
        }
        let body;
        try { body = await readBody(req); } catch (error) {
            const tooLarge = error?.code === 'BODY_TOO_LARGE';
            return res.status(tooLarge ? 413 : 400).json({
                error: tooLarge ? 'File too large. Maximum size is 2MB.' : 'Multipart body is invalid',
                code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
            });
        }
        const actualTarget = targetPath.includes(':id')
            ? `/api/invoices/businesses/${encodeURIComponent(req.params.id)}/logo`
            : targetPath;
        const headers = new Headers({ 'content-type': contentType });
        for (const name of ['cookie', 'x-organization-id', 'x-csrf-token']) {
            const value = req.get(name); if (value) headers.set(name, value);
        }
        const requestId = typeof req.requestId === 'string' && ACCEPTED_REQUEST_ID.test(req.requestId)
            ? req.requestId : null;
        if (requestId) headers.set('x-request-id', requestId);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const upstream = await fetchImpl(new URL(actualTarget, baseUrl), {
                method: 'POST', headers, body, signal: controller.signal,
            });
            res.status(upstream.status);
            for (const name of ['cache-control', 'content-type', 'x-request-id']) {
                const value = upstream.headers.get(name); if (value) res.set(name, value);
            }
            return res.send(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
            logger.error?.('Invoice logo upload proxy failed', {
                event: 'invoice_logo_upload_proxy_failed', requestId,
                failureReason: error?.name === 'AbortError' ? 'timeout' : 'upstream_failure',
            });
            return res.status(502).json({
                error: 'Invoice logo upload service is unavailable', code: 'SERVICE_UNAVAILABLE',
            });
        } finally { clearTimeout(timeout); }
    };
};

module.exports = { createInvoiceLogoUploadProxy, enabled, resolveBaseUrl };
