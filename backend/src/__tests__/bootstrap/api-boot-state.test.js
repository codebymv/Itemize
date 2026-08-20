const {
    REQUIRED_PRODUCTION_MIGRATION,
    createApiBootState,
    markApiRoutesReady,
    markApiInitFailed,
    healthDecision,
    shouldCrashOnInitFailure,
} = require('../../bootstrap/api-boot-state');

describe('api boot state', () => {
    test('requires the current numbered migration head', () => {
        expect(REQUIRED_PRODUCTION_MIGRATION).toBe('057_estimate_public_capabilities');
    });

    test('health stays starting during grace when routes are not ready', () => {
        expect(healthDecision({
            routesReady: false,
            inStartupGrace: true,
            databaseOk: false,
        })).toEqual({
            statusCode: 200,
            status: 'starting',
            reason: 'startup_grace',
        });
    });

    test('health is 503 after grace when routes never registered even if the database is up', () => {
        expect(healthDecision({
            routesReady: false,
            inStartupGrace: false,
            databaseOk: true,
        })).toEqual({
            statusCode: 503,
            status: 'unhealthy',
            reason: 'api_routes_not_ready',
        });
    });

    test('health is healthy only after routes register and the database answers', () => {
        const state = markApiRoutesReady(createApiBootState());
        expect(state.routesReady).toBe(true);
        expect(healthDecision({
            routesReady: state.routesReady,
            inStartupGrace: false,
            databaseOk: true,
        }).status).toBe('healthy');
    });

    test('records init failure and crashes production', () => {
        const state = markApiInitFailed(createApiBootState(), new Error('schema_migrations table missing'));
        expect(state.failed).toBe(true);
        expect(state.failureMessage).toContain('schema_migrations');
        expect(shouldCrashOnInitFailure('production')).toBe(true);
        expect(shouldCrashOnInitFailure('development')).toBe(false);
    });
});
