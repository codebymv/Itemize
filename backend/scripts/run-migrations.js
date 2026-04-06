#!/usr/bin/env node
/**
 * Database Migration CLI
 * Run migrations explicitly instead of on server startup
 * 
 * Usage:
 *   node scripts/run-migrations.js           # Run all pending migrations
 *   node scripts/run-migrations.js --status  # Check migration status
 *   node scripts/run-migrations.js --rollback <name> # Rollback specific migration
 *   node scripts/run-migrations.js --index   # Run index migrations
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const MIGRATIONS_TABLE = 'schema_migrations';
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

class MigrationRunner {
    constructor(pool) {
        this.pool = pool;
    }

    log(level, msg) {
        const timestamp = new Date().toISOString();
        const colors = { info: '\x1b[36m', success: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
        const reset = '\x1b[0m';
        const color = colors[level] || '';
        console.log(`${color}[${timestamp}]${reset} ${msg}`);
    }

    async ensureMigrationsTable() {
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
                id SERIAL PRIMARY KEY,
                version VARCHAR(50) NOT NULL UNIQUE,
                name VARCHAR(255),
                executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                execution_time_ms INTEGER
            )
        `);
    }

    async getExecutedMigrations() {
        const result = await this.pool.query(
            `SELECT version, name, executed_at, execution_time_ms FROM ${MIGRATIONS_TABLE} ORDER BY id`
        );
        return result.rows;
    }

    getMigrationFiles() {
        if (!fs.existsSync(MIGRATIONS_DIR)) {
            this.log('warn', `Migrations directory not found: ${MIGRATIONS_DIR}`);
            return [];
        }
        return fs.readdirSync(MIGRATIONS_DIR)
            .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
            .sort();
    }

    async runMigration(filename) {
        const migrationPath = path.join(MIGRATIONS_DIR, filename);
        const startTime = Date.now();
        
        this.log('info', `Running migration: ${filename}`);

        try {
            if (filename.endsWith('.sql')) {
                const sql = fs.readFileSync(migrationPath, 'utf8');
                await this.pool.query(sql);
            } else {
                const migration = require(migrationPath);
                if (typeof migration.up === 'function') {
                    await migration.up(this.pool);
                } else if (typeof migration === 'function') {
                    await migration(this.pool);
                } else {
                    throw new Error('Migration has no export function or "up" method');
                }
            }

            const executionTime = Date.now() - startTime;
            const version = filename.replace(/\.(sql|js)$/, '');

            await this.pool.query(
                `INSERT INTO ${MIGRATIONS_TABLE} (version, name, execution_time_ms) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING`,
                [version, filename, executionTime]
            );

            this.log('success', `Completed in ${executionTime}ms`);
            return { success: true, executionTime, filename };
        } catch (error) {
            if (error.message.includes('already exists') || error.message.includes('duplicate')) {
                this.log('warn', 'Already applied, skipping');
                return { success: true, skipped: true, filename };
            }
            this.log('error', `Failed: ${error.message}`);
            throw error;
        }
    }

    async rollbackMigration(filename) {
        const migrationPath = path.join(MIGRATIONS_DIR, filename);
        
        this.log('info', `Rolling back: ${filename}`);

        try {
            const migration = require(migrationPath);
            if (typeof migration.down !== 'function') {
                throw new Error('Migration has no "down" method for rollback');
            }

            await migration.down(this.pool);
            await this.pool.query(
                `DELETE FROM ${MIGRATIONS_TABLE} WHERE version = $1`,
                [filename.replace(/\.(sql|js)$/, '')]
            );

            this.log('success', 'Rollback complete');
            return { success: true };
        } catch (error) {
            this.log('error', `Rollback failed: ${error.message}`);
            throw error;
        }
    }

    async runPendingMigrations() {
        await this.ensureMigrationsTable();

        const executed = await this.getExecutedMigrations();
        const executedVersions = executed.map(r => r.version);
        const available = this.getMigrationFiles();

        const pending = available.filter(f => {
            const version = f.replace(/\.(sql|js)$/, '');
            return !executedVersions.includes(version);
        });

        if (pending.length === 0) {
            this.log('info', 'No pending migrations');
            return { executed: 0, total: 0, results: [] };
        }

        this.log('info', `Found ${pending.length} pending migration(s)`);

        const results = [];
        for (const filename of pending) {
            try {
                const result = await this.runMigration(filename);
                results.push(result);
            } catch (error) {
                this.log('error', `Migration failed: ${filename}`);
                throw error;
            }
        }

        const successful = results.filter(r => r.success);
        this.log('success', `Executed ${successful.length}/${pending.length} migrations`);

        return { executed: successful.length, total: pending.length, results };
    }

    async runIndexMigrations() {
        this.log('info', 'Running database index migrations...');
        
        const { runAllIndexMigrations } = require('../src/db_indexes_migrations');
        await runAllIndexMigrations(this.pool);
        
        this.log('success', 'Index migrations completed');
    }

    async getStatus() {
        await this.ensureMigrationsTable();

        const executed = await this.getExecutedMigrations();
        const available = this.getMigrationFiles();
        const executedVersions = executed.map(r => r.version);
        const pending = available.filter(f => !executedVersions.includes(f.replace(/\.(sql|js)$/, '')));

        console.log('\n=== Migration Status ===\n');
        console.log(`Total migrations: ${available.length}`);
        console.log(`Executed: ${executed.length}`);
        console.log(`Pending: ${pending.length}`);

        if (pending.length > 0) {
            console.log('\nPending migrations:');
            pending.forEach(f => console.log(`  - ${f}`));
        }

        if (executed.length > 0) {
            console.log('\nRecently executed:');
            executed.slice(-10).reverse().forEach(r => {
                const time = r.execution_time_ms ? ` (${r.execution_time_ms}ms)` : '';
                console.log(`  \x1b[32m✓\x1b[0m ${r.version} - ${r.executed_at?.toISOString?.() || 'N/A'}${time}`);
            });
        }

        console.log('');
        return { total: available.length, executed: executed.length, pending: pending.length };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'run';

    const pool = new Pool({ 
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        const runner = new MigrationRunner(pool);

        switch (command) {
            case '--status':
            case 'status':
                await runner.getStatus();
                break;

            case '--rollback':
            case 'rollback':
                const migrationName = args[1];
                if (!migrationName) {
                    console.error('Usage: node run-migrations.js --rollback <migration-name>');
                    process.exit(1);
                }
                await runner.rollbackMigration(migrationName);
                break;

            case '--index':
            case 'index':
                await runner.runIndexMigrations();
                break;

            case '--verify':
            case 'verify':
                await runner.ensureMigrationsTable();
                await verifyMigrations(pool);
                break;

            case 'run':
            case '--run':
            default:
                await runner.runPendingMigrations();
                break;
        }

        process.exit(0);
    } catch (error) {
        console.error('\x1b[31m[FATAL]\x1b[0m', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main();
}

module.exports = { MigrationRunner, runAllMigrations: () => main() };