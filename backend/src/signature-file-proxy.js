const DEFAULT_UPLOAD_TIMEOUT_MS = 30000;
const DEFAULT_READ_TIMEOUT_MS = 60000;
const MAX_MULTIPART_BYTES = 5 * 1024 * 1024 + 128 * 1024;
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const UPLOAD_TARGETS = new Set([
    '/api/signatures/documents/upload',
    '/api/signatures/templates/upload',
]);
const READ_TARGETS = new Set([
    'document-source',
    'document-download',
    'template-source',
]);

const uploadEnabled = (environment = process.env) =>
    environment.SIGNATURE_FILE_UPLOADS_NESTJS_ENABLED === 'true';
const readEnabled = (environment = process.env) =>
    environment.SIGNATURE_FILE_READS_NESTJS_ENABLED === 'true';

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

const configuredTimeout = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const requestIdFor = request => {
    if (typeof request.requestId === 'string' && ACCEPTED_REQUEST_ID.test(request.requestId)) {
        return request.requestId;
    }
    const supplied = request.get('x-request-id');
    return typeof supplied === 'string' && ACCEPTED_REQUEST_ID.test(supplied)
        ? supplied
        : null;
};

const readBody = request => new Promise((resolve, reject) => {
    const declared = Number(request.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_MULTIPART_BYTES) {
        request.resume();
        reject(Object.assign(new Error('Multipart body is too large'), {
            code: 'BODY_TOO_LARGE',
        }));
        return;
    }
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
        size += chunk.length;
        if (size <= MAX_MULTIPART_BYTES) chunks.push(chunk);
    });
    request.on('end', () => {
        if (size > MAX_MULTIPART_BYTES) {
            reject(Object.assign(new Error('Multipart body is too large'), {
                code: 'BODY_TOO_LARGE',
            }));
        } else {
            resolve(Buffer.concat(chunks));
        }
    });
    request.on('error', reject);
});

const forwardHeaders = (request, names) => {
    const headers = new Headers();
    for (const name of names) {
        const value = request.get(name);
        if (value) headers.set(name, value);
    }
    const requestId = requestIdFor(request);
    if (requestId) headers.set('x-request-id', requestId);
    return { headers, requestId };
};

const copyHeaders = (upstream, response, names) => {
    for (const name of names) {
        const value = upstream.headers.get(name);
        if (value) response.set(name, value);
    }
};

const createSignatureFileUploadProxy = ({
    targetPath,
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    if (!UPLOAD_TARGETS.has(targetPath)) {
        throw new Error('Signature upload proxy target is not allowed');
    }
    const enabled = uploadEnabled(environment);
    const baseUrl = enabled ? resolveBaseUrl(environment) : null;
    const timeoutMs = configuredTimeout(
        environment.SIGNATURE_FILE_UPLOADS_UPSTREAM_TIMEOUT_MS,
        DEFAULT_UPLOAD_TIMEOUT_MS,
    );
    return async (req, res, next) => {
        if (!enabled) return next();
        if (!baseUrl) {
            return res.status(503).json({
                error: 'Signature upload service is unavailable',
                code: 'SERVICE_UNAVAILABLE',
            });
        }
        const contentType = req.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
            return res.status(400).json({
                error: 'Multipart form data is required',
                code: 'BAD_REQUEST',
            });
        }
        let body;
        try {
            body = await readBody(req);
        } catch (error) {
            const tooLarge = error?.code === 'BODY_TOO_LARGE';
            return res.status(tooLarge ? 413 : 400).json({
                error: tooLarge
                    ? 'File too large. Maximum size is 5MB.'
                    : 'Multipart body is invalid',
                code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
            });
        }
        const { headers, requestId } = forwardHeaders(req, [
            'content-type',
            'cookie',
            'x-organization-id',
            'x-csrf-token',
        ]);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const upstream = await fetchImpl(new URL(targetPath, baseUrl), {
                method: 'POST',
                headers,
                body,
                signal: controller.signal,
            });
            res.status(upstream.status);
            copyHeaders(upstream, res, ['cache-control', 'content-type', 'x-request-id']);
            if (!res.get('x-request-id') && requestId) res.set('x-request-id', requestId);
            return res.send(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
            logger.error?.('Signature upload proxy failed', {
                event: 'signature_upload_proxy_failed',
                requestId,
                targetPath,
                failureReason: error?.name === 'AbortError'
                    ? 'timeout'
                    : 'upstream_failure',
            });
            return res.status(502).json({
                error: 'Signature upload service is unavailable',
                code: 'SERVICE_UNAVAILABLE',
            });
        } finally {
            clearTimeout(timeout);
        }
    };
};

const readPath = (kind, id) => {
    const encoded = encodeURIComponent(id);
    if (kind === 'document-source') {
        return `/api/signatures/documents/${encoded}/file`;
    }
    if (kind === 'document-download') {
        return `/api/signatures/documents/${encoded}/download`;
    }
    return `/api/signatures/templates/${encoded}/file`;
};

const createSignatureFileReadProxy = ({
    kind,
    environment = process.env,
    fetchImpl = global.fetch,
    logger = console,
} = {}) => {
    if (!READ_TARGETS.has(kind)) {
        throw new Error('Signature read proxy target is not allowed');
    }
    const enabled = readEnabled(environment);
    const baseUrl = enabled ? resolveBaseUrl(environment) : null;
    const timeoutMs = configuredTimeout(
        environment.SIGNATURE_FILE_READS_UPSTREAM_TIMEOUT_MS,
        DEFAULT_READ_TIMEOUT_MS,
    );
    return async (req, res, next) => {
        if (!enabled) return next();
        if (!baseUrl) {
            return res.status(503).json({
                error: 'Signature file service is unavailable',
                code: 'SERVICE_UNAVAILABLE',
            });
        }
        const { headers, requestId } = forwardHeaders(req, [
            'accept',
            'cookie',
            'if-none-match',
            'if-range',
            'range',
            'x-organization-id',
        ]);
        if (!headers.has('accept')) headers.set('accept', 'application/pdf');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const upstream = await fetchImpl(
                new URL(readPath(kind, req.params.id), baseUrl),
                { method: 'GET', headers, signal: controller.signal },
            );
            res.status(upstream.status);
            copyHeaders(upstream, res, [
                'accept-ranges',
                'cache-control',
                'content-disposition',
                'content-length',
                'content-range',
                'content-security-policy',
                'content-type',
                'etag',
                'x-content-type-options',
                'x-request-id',
            ]);
            if (!res.get('x-request-id') && requestId) res.set('x-request-id', requestId);
            return res.send(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
            logger.error?.('Signature file proxy failed', {
                event: 'signature_file_proxy_failed',
                requestId,
                kind,
                failureReason: error?.name === 'AbortError'
                    ? 'timeout'
                    : 'upstream_failure',
            });
            return res.status(502).json({
                error: 'Signature file service is unavailable',
                code: 'SERVICE_UNAVAILABLE',
            });
        } finally {
            clearTimeout(timeout);
        }
    };
};

module.exports = {
    createSignatureFileReadProxy,
    createSignatureFileUploadProxy,
    readEnabled,
    resolveBaseUrl,
    uploadEnabled,
};
