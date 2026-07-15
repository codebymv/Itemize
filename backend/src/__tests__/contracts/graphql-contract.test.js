const {
    ContractInputError,
    graphqlErrorDescriptor,
    normalizePageInput,
    buildPageInfo,
    buildPage,
    serializeDecimal,
} = require('../../contracts/graphql-contract');

describe('GraphQL error contract', () => {
    test.each([
        [{ statusCode: 400, code: 'VALIDATION_ERROR', message: 'Invalid email', field: 'email' }, 'BAD_USER_INPUT'],
        [{ statusCode: 401, code: 'NO_TOKEN', message: 'Authentication required' }, 'UNAUTHENTICATED'],
        [{ statusCode: 403, code: 'CSRF_TOKEN_MISMATCH', message: 'CSRF mismatch' }, 'FORBIDDEN'],
        [{ statusCode: 404, code: 'NOT_FOUND', message: 'Invoice not found' }, 'NOT_FOUND'],
        [{ statusCode: 409, code: '23505', message: 'duplicate key' }, 'CONFLICT'],
        [{ statusCode: 429, code: 'RATE_LIMITED', message: 'Slow down' }, 'RATE_LIMITED'],
        [{ statusCode: 503, code: 'DB_UNAVAILABLE', message: 'Database unavailable' }, 'SERVICE_UNAVAILABLE'],
    ])('normalizes legacy error evidence into stable codes', (error, expectedCode) => {
        const result = graphqlErrorDescriptor(error, { requestId: 'req-7' });

        expect(result.extensions.code).toBe(expectedCode);
        expect(result.extensions.requestId).toBe('req-7');
    });

    test('preserves safe field and reason metadata', () => {
        expect(graphqlErrorDescriptor({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Invalid email',
            field: 'email',
        })).toEqual({
            message: 'Invalid email',
            extensions: {
                code: 'BAD_USER_INPUT',
                reason: 'VALIDATION_ERROR',
                field: 'email',
            },
        });
    });

    test('does not expose unexpected internal error messages or stacks', () => {
        const result = graphqlErrorDescriptor({
            message: 'password=secret database exploded',
            stack: 'sensitive stack',
        }, { requestId: 'req-9' });

        expect(result).toEqual({
            message: 'Internal server error',
            extensions: { code: 'INTERNAL_SERVER_ERROR', requestId: 'req-9' },
        });
    });

    test('preserves approved domain codes but maps invalid JWT tokens to unauthenticated', () => {
        expect(graphqlErrorDescriptor({ statusCode: 400, code: 'INVALID_TOKEN', message: 'Reset link expired' }).extensions.code)
            .toBe('INVALID_TOKEN');
        expect(graphqlErrorDescriptor({ statusCode: 401, code: 'INVALID_TOKEN', message: 'JWT invalid' }).extensions.code)
            .toBe('UNAUTHENTICATED');
    });
});

describe('GraphQL page contract', () => {
    test('normalizes valid page input and computes SQL offset', () => {
        expect(normalizePageInput({ page: 3, pageSize: 25 })).toEqual({
            page: 3,
            pageSize: 25,
            offset: 50,
        });
    });

    test('uses explicit defaults', () => {
        expect(normalizePageInput({}, { pageSize: 20, maxPageSize: 50 })).toEqual({
            page: 1,
            pageSize: 20,
            offset: 0,
        });
    });

    test.each([
        [{ page: 0 }, 'page'],
        [{ page: 1.5 }, 'page'],
        [{ pageSize: 0 }, 'pageSize'],
        [{ pageSize: 101 }, 'pageSize'],
    ])('rejects invalid input instead of silently clamping it', (input, field) => {
        expect(() => normalizePageInput(input)).toThrow(ContractInputError);
        try {
            normalizePageInput(input);
        } catch (error) {
            expect(error.field).toBe(field);
            expect(error.code).toBe('BAD_USER_INPUT');
        }
    });

    test('builds the canonical page-info field names', () => {
        expect(buildPageInfo({ page: 2, pageSize: 10, total: 25 })).toEqual({
            page: 2,
            pageSize: 10,
            total: 25,
            totalPages: 3,
            hasNextPage: true,
            hasPreviousPage: true,
        });
    });

    test('represents an empty result without inventing a page', () => {
        expect(buildPage({ nodes: [], page: 1, pageSize: 10, total: 0 })).toEqual({
            nodes: [],
            pageInfo: {
                page: 1,
                pageSize: 10,
                total: 0,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage: false,
            },
        });
    });
});

describe('GraphQL Decimal contract', () => {
    test('preserves PostgreSQL decimal strings without binary float conversion', () => {
        expect(serializeDecimal('1234.50')).toBe('1234.50');
        expect(serializeDecimal('-0.125')).toBe('-0.125');
    });

    test('rejects non-finite and malformed decimal values', () => {
        expect(() => serializeDecimal(Number.NaN)).toThrow(ContractInputError);
        expect(() => serializeDecimal('1,234.50')).toThrow(ContractInputError);
    });
});
