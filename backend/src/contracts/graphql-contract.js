class ContractInputError extends Error {
    constructor(message, field) {
        super(message);
        this.name = 'ContractInputError';
        this.statusCode = 400;
        this.code = 'BAD_USER_INPUT';
        this.field = field;
        this.isOperational = true;
    }
}

const reasonCodeMap = new Map([
    ['BAD_REQUEST', 'BAD_USER_INPUT'],
    ['VALIDATION_ERROR', 'BAD_USER_INPUT'],
    ['INVALID_INPUT', 'BAD_USER_INPUT'],
    ['INVALID_ORGANIZATION_ID', 'BAD_USER_INPUT'],
    ['NO_TOKEN', 'UNAUTHENTICATED'],
    ['UNAUTHORIZED', 'UNAUTHENTICATED'],
    ['AUTH_REQUIRED', 'UNAUTHENTICATED'],
    ['AUTH_FAILED', 'UNAUTHENTICATED'],
    ['TOKEN_EXPIRED', 'UNAUTHENTICATED'],
    ['CSRF_TOKEN_MISSING', 'FORBIDDEN'],
    ['CSRF_COOKIE_MISSING', 'FORBIDDEN'],
    ['CSRF_TOKEN_MISMATCH', 'FORBIDDEN'],
    ['FORBIDDEN', 'FORBIDDEN'],
    ['NOT_FOUND', 'NOT_FOUND'],
    ['ROUTE_NOT_FOUND', 'NOT_FOUND'],
    ['CONFLICT', 'CONFLICT'],
    ['DUPLICATE_ENTRY', 'CONFLICT'],
    ['RATE_LIMITED', 'RATE_LIMITED'],
    ['DB_UNAVAILABLE', 'SERVICE_UNAVAILABLE'],
    ['SERVICE_UNAVAILABLE', 'SERVICE_UNAVAILABLE'],
]);

const statusCodeMap = new Map([
    [400, 'BAD_USER_INPUT'],
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [429, 'RATE_LIMITED'],
    [503, 'SERVICE_UNAVAILABLE'],
]);

const preservedDomainCodes = new Set([
    'ACCOUNT_CONFLICT',
    'EMAIL_NOT_VERIFIED',
    'INVALID_CREDENTIALS',
    'INVALID_PROVIDER_TOKEN',
    'INVALID_TOKEN',
    'ORGANIZATION_REQUIRED',
]);

function graphqlErrorDescriptor(error, { requestId } = {}) {
    const statusCode = Number(error?.statusCode || error?.status || 500);
    const reason = error?.code || error?.error?.code || null;
    let code;

    if (preservedDomainCodes.has(reason) && !(reason === 'INVALID_TOKEN' && statusCode === 401)) {
        code = reason;
    } else {
        code = reasonCodeMap.get(reason) || statusCodeMap.get(statusCode) || 'INTERNAL_SERVER_ERROR';
    }

    const isInternal = code === 'INTERNAL_SERVER_ERROR';
    const message = isInternal
        ? 'Internal server error'
        : error?.message || error?.error?.message || 'Request failed';
    const extensions = { code };

    if (reason && reason !== code) extensions.reason = reason;
    if (error?.field) extensions.field = error.field;
    if (requestId) extensions.requestId = requestId;

    return { message, extensions };
}

function parsePageInteger(value, fallback, field) {
    if (value === undefined || value === null) return fallback;
    if (!Number.isInteger(value)) throw new ContractInputError(`${field} must be an integer`, field);
    return value;
}

function normalizePageInput(input = {}, defaults = {}) {
    const defaultPage = defaults.page || 1;
    const defaultPageSize = defaults.pageSize || 50;
    const maxPageSize = defaults.maxPageSize || 100;
    const page = parsePageInteger(input.page, defaultPage, 'page');
    const pageSize = parsePageInteger(input.pageSize, defaultPageSize, 'pageSize');

    if (page < 1) throw new ContractInputError('page must be at least 1', 'page');
    if (pageSize < 1 || pageSize > maxPageSize) {
        throw new ContractInputError(`pageSize must be between 1 and ${maxPageSize}`, 'pageSize');
    }

    return { page, pageSize, offset: (page - 1) * pageSize };
}

function buildPageInfo({ page, pageSize, total }) {
    if (!Number.isInteger(page) || page < 1) throw new ContractInputError('page must be at least 1', 'page');
    if (!Number.isInteger(pageSize) || pageSize < 1) {
        throw new ContractInputError('pageSize must be at least 1', 'pageSize');
    }
    if (!Number.isInteger(total) || total < 0) throw new ContractInputError('total must be non-negative', 'total');

    const totalPages = Math.ceil(total / pageSize);
    return {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
    };
}

function buildPage({ nodes, page, pageSize, total }) {
    if (!Array.isArray(nodes)) throw new ContractInputError('nodes must be an array', 'nodes');
    return { nodes, pageInfo: buildPageInfo({ page, pageSize, total }) };
}

function serializeDecimal(value) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new ContractInputError('Decimal must be finite', 'value');
        return String(value);
    }
    if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) {
        throw new ContractInputError('Decimal must be a numeric string or finite number', 'value');
    }
    return value;
}

module.exports = {
    ContractInputError,
    graphqlErrorDescriptor,
    normalizePageInput,
    buildPageInfo,
    buildPage,
    serializeDecimal,
};
