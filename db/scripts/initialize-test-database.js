#!/usr/bin/env node

const { Pool } = require('pg');
const {
    getTestDatabasePoolConfig,
    loadIntegrationTestEnvironment,
} = require('../test-support/test-database-config');
const {
    discoverExpectedMigrationMarkers,
    discoverExpectedTables,
    verifySchema,
} = require('../src/utils/schemaContract');
const resetRequested = process.argv.includes('--reset');
const resetConfirmed = process.argv.includes('--confirm-reset');

function assertResetIsConfirmed() {
    if (resetRequested && !resetConfirmed) {
        throw new Error('Destructive reset requires both --reset and --confirm-reset.');
    }
}

async function resetPublicSchema(pool) {
    await pool.query('BEGIN');
    try {
        await pool.query('DROP SCHEMA public CASCADE');
        await pool.query('CREATE SCHEMA public AUTHORIZATION CURRENT_USER');
        await pool.query('GRANT USAGE ON SCHEMA public TO PUBLIC');
        await pool.query('COMMIT');
    } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
    }
}

async function main() {
    assertResetIsConfirmed();
    loadIntegrationTestEnvironment();
    process.env.NODE_ENV = 'test';

    const pool = new Pool(getTestDatabasePoolConfig());
    try {
        await pool.query("SELECT pg_advisory_lock(hashtext('itemize-test-schema-bootstrap'))");
        if (resetRequested) {
            console.log('Resetting the disposable integration-test schema...');
            await resetPublicSchema(pool);
        }

        const { initializeDatabase } = require('../src/db');
        const initialized = await initializeDatabase(pool);
        if (!initialized) throw new Error('Application schema initializer reported failure.');

        const result = await verifySchema(pool);
        console.log(
            `Test database ready: ${result.verifiedTableCount} expected tables and ${result.verifiedMigrationCount} migration markers verified.`
        );
    } finally {
        try {
            await pool.query("SELECT pg_advisory_unlock(hashtext('itemize-test-schema-bootstrap'))");
        } catch {
            // Connection/setup failure may occur before the lock is acquired.
        }
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(`Test database initialization failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    assertResetIsConfirmed,
    discoverExpectedMigrationMarkers,
    discoverExpectedTables,
    verifySchema,
};
