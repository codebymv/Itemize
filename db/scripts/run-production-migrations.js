#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { initializeDatabase } = require('../src/db');
const { verifySchema } = require('../src/utils/schemaContract');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MIGRATION_LOCK = 'itemize-production-schema-migrations-v1';

function databaseIdentity(connectionString) {
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  return `${parsed.hostname}/${database}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');

  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 15000,
  });
  let client;
  let locked = false;

  try {
    console.log(`Running tracked migrations against ${databaseIdentity(connectionString)}...`);
    client = await pool.connect();
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK]);
    locked = true;

    const initialized = await initializeDatabase(client);
    if (!initialized) throw new Error('Schema initializer reported failure.');

    const result = await verifySchema(client);
    console.log(
      `Migration gate passed: ${result.verifiedMigrationCount} markers and ${result.verifiedTableCount} required tables verified.`,
    );
  } finally {
    if (client) {
      if (locked) {
        try {
          await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK]);
        } catch (error) {
          console.error(`Failed to release migration lock: ${error.message}`);
        }
      }
      client.release();
    }
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Production migration gate failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { databaseIdentity, main };
