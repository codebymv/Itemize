const REQUIRED_PRODUCTION_MIGRATION = '054_vault_zero_knowledge';

function createApiBootState() {
    return {
        routesReady: false,
        failed: false,
        failureMessage: null,
    };
}

function markApiRoutesReady(state) {
    state.routesReady = true;
    state.failed = false;
    state.failureMessage = null;
    return state;
}

function markApiInitFailed(state, error) {
    state.routesReady = false;
    state.failed = true;
    state.failureMessage = error instanceof Error ? error.message : String(error);
    return state;
}

function healthDecision({
    routesReady,
    inStartupGrace,
    databaseOk,
    optionalHealthy = true,
}) {
    if (!routesReady) {
        if (inStartupGrace) {
            return {
                statusCode: 200,
                status: 'starting',
                reason: 'startup_grace',
            };
        }
        return {
            statusCode: 503,
            status: 'unhealthy',
            reason: 'api_routes_not_ready',
        };
    }

    if (!databaseOk) {
        return {
            statusCode: 503,
            status: 'unhealthy',
            reason: 'database',
        };
    }

    return {
        statusCode: 200,
        status: optionalHealthy ? 'healthy' : 'degraded',
        reason: optionalHealthy ? 'ready' : 'optional_degraded',
    };
}

function shouldCrashOnInitFailure(nodeEnv = process.env.NODE_ENV) {
    return nodeEnv === 'production';
}

module.exports = {
    REQUIRED_PRODUCTION_MIGRATION,
    createApiBootState,
    markApiRoutesReady,
    markApiInitFailed,
    healthDecision,
    shouldCrashOnInitFailure,
};
