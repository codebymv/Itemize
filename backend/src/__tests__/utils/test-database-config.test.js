const {
    ISOLATION_CONFIRMATION,
    getTestDatabasePoolConfig,
    validateTestDatabaseUrl,
} = require('../integration/test-database-config');

describe('integration test database safety', () => {
    test('requires TEST_DATABASE_URL and never falls back to DATABASE_URL', () => {
        expect(() => validateTestDatabaseUrl({
            DATABASE_URL: 'postgresql://localhost/itemize',
        })).toThrow('TEST_DATABASE_URL is required');
    });

    test('rejects the application database even when it has a test-looking name', () => {
        const sharedUrl = 'postgresql://localhost/itemize_test';
        expect(() => validateTestDatabaseUrl({
            DATABASE_URL: sharedUrl,
            TEST_DATABASE_URL: sharedUrl,
        })).toThrow('must not be the same database');
    });

    test('accepts an obviously test-only database', () => {
        const testUrl = 'postgresql://localhost/itemize_integration';
        expect(validateTestDatabaseUrl({ TEST_DATABASE_URL: testUrl })).toBe(testUrl);
    });

    test('requires explicit confirmation for an ambiguously named managed database', () => {
        const testUrl = 'postgresql://user:secret@managed.example/neondb';
        expect(() => validateTestDatabaseUrl({ TEST_DATABASE_URL: testUrl }))
            .toThrow('Refusing ambiguous integration database');

        expect(validateTestDatabaseUrl({
            TEST_DATABASE_URL: testUrl,
            TEST_DATABASE_CONFIRM_ISOLATED: ISOLATION_CONFIRMATION,
        })).toBe(testUrl);
    });

    test('configures TLS only when explicitly enabled', () => {
        const base = { TEST_DATABASE_URL: 'postgresql://localhost/itemize_test' };
        expect(getTestDatabasePoolConfig(base).ssl).toBe(false);
        expect(getTestDatabasePoolConfig({ ...base, TEST_DATABASE_SSL: 'true' }).ssl)
            .toEqual({ rejectUnauthorized: false });
        expect(getTestDatabasePoolConfig({
            ...base,
            TEST_DATABASE_SSL: 'true',
            TEST_DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
        }).ssl).toEqual({ rejectUnauthorized: true });
    });
});
