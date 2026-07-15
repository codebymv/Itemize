#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const {
    getTestDatabasePoolConfig,
    loadIntegrationTestEnvironment,
} = require('../src/__tests__/integration/test-database-config');

const backendRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(backendRoot, 'src');
const resetRequested = process.argv.includes('--reset');
const resetConfirmed = process.argv.includes('--confirm-reset');

function migrationSourceFiles() {
    return fs.readdirSync(sourceRoot)
        .filter(name => name === 'db.js' || /^db.*_migrations\.js$/.test(name))
        .map(name => path.join(sourceRoot, name));
}

function discoverExpectedTables() {
    const tables = new Set(['_migrations']);
    const pattern = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)/gi;

    for (const file of migrationSourceFiles()) {
        const contents = fs.readFileSync(file, 'utf8');
        let match;
        while ((match = pattern.exec(contents))) tables.add(match[1].toLowerCase());
    }

    return [...tables].sort();
}

function discoverExpectedMigrationMarkers() {
    const contents = fs.readFileSync(path.join(sourceRoot, 'db.js'), 'utf8');
    const markers = new Set();
    const pattern = /runMigrationOnce\(pool,\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = pattern.exec(contents))) markers.add(match[1]);
    return [...markers].sort();
}

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

async function verifySchema(pool) {
    const expectedTables = discoverExpectedTables();
    const tableResult = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `);
    const actualTables = new Set(tableResult.rows.map(row => row.table_name.toLowerCase()));
    const missingTables = expectedTables.filter(table => !actualTables.has(table));

    if (missingTables.length) {
        throw new Error(`Test schema is missing tables: ${missingTables.join(', ')}`);
    }

    const expectedMarkers = discoverExpectedMigrationMarkers();
    const markerResult = await pool.query('SELECT name FROM _migrations');
    const actualMarkers = new Set(markerResult.rows.map(row => row.name));
    const missingMarkers = expectedMarkers.filter(marker => !actualMarkers.has(marker));

    if (missingMarkers.length) {
        throw new Error(`Test schema has incomplete migrations: ${missingMarkers.join(', ')}`);
    }

    return {
        tableCount: actualTables.size,
        verifiedTableCount: expectedTables.length,
        verifiedMigrationCount: expectedMarkers.length,
    };
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
