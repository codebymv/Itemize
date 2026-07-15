const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ISOLATION_CONFIRMATION = 'I_CONFIRM_THIS_DATABASE_IS_DISPOSABLE';

function loadIntegrationTestEnvironment() {
    const backendRoot = path.resolve(__dirname, '../../..');
    const testEnvironment = path.join(backendRoot, '.env.test');
    const applicationEnvironment = path.join(backendRoot, '.env');

    if (fs.existsSync(testEnvironment)) {
        dotenv.config({ path: testEnvironment });
    }
    if (fs.existsSync(applicationEnvironment)) {
        dotenv.config({ path: applicationEnvironment });
    }
}

function normalizedConnectionString(value) {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
}

function validateTestDatabaseUrl(env = process.env) {
    const testDatabaseUrl = env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) {
        throw new Error(
            'TEST_DATABASE_URL is required for integration tests. Copy backend/.env.test.example to backend/.env.test and point it at a disposable database.'
        );
    }

    let parsed;
    try {
        parsed = new URL(testDatabaseUrl);
    } catch {
        throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL connection URL.');
    }

    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
        throw new Error('TEST_DATABASE_URL must use the postgres:// or postgresql:// protocol.');
    }

    if (!parsed.pathname || parsed.pathname === '/') {
        throw new Error('TEST_DATABASE_URL must identify a database name.');
    }

    if (
        env.DATABASE_URL &&
        normalizedConnectionString(testDatabaseUrl) === normalizedConnectionString(env.DATABASE_URL)
    ) {
        throw new Error('TEST_DATABASE_URL must not be the same database as DATABASE_URL.');
    }

    const databaseName = decodeURIComponent(parsed.pathname.slice(1));
    const visibleIdentity = `${parsed.hostname}/${databaseName}`;
    const isObviouslyNonProduction = /(test|testing|integration|\bci\b)/i.test(visibleIdentity);
    const isConfirmedIsolated = env.TEST_DATABASE_CONFIRM_ISOLATED === ISOLATION_CONFIRMATION;

    if (!isObviouslyNonProduction && !isConfirmedIsolated) {
        throw new Error(
            `Refusing ambiguous integration database "${visibleIdentity}". Use a test/ci/integration-named database, or set TEST_DATABASE_CONFIRM_ISOLATED=${ISOLATION_CONFIRMATION} for a verified disposable database.`
        );
    }

    return testDatabaseUrl;
}

function getTestDatabasePoolConfig(env = process.env) {
    const connectionString = validateTestDatabaseUrl(env);
    const sslEnabled = String(env.TEST_DATABASE_SSL).toLowerCase() === 'true';
    const rejectUnauthorized = String(env.TEST_DATABASE_SSL_REJECT_UNAUTHORIZED).toLowerCase() === 'true';

    return {
        connectionString,
        ssl: sslEnabled ? { rejectUnauthorized } : false,
        max: 5,
    };
}

module.exports = {
    ISOLATION_CONFIRMATION,
    getTestDatabasePoolConfig,
    loadIntegrationTestEnvironment,
    validateTestDatabaseUrl,
};
