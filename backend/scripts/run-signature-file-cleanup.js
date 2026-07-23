#!/usr/bin/env node

require('dotenv').config();
const { Pool } = require('pg');
const { SignatureFileCleanupService } = require('../src/services/signature-file-cleanup.service');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

async function main() {
    const service = new SignatureFileCleanupService(pool);
    const result = await service.run({
        limit: Number(process.env.SIGNATURE_FILE_CLEANUP_BATCH_SIZE || 25),
        leaseSeconds: Number(process.env.SIGNATURE_FILE_CLEANUP_LEASE_SECONDS || 300),
        maxAttempts: Number(process.env.SIGNATURE_FILE_CLEANUP_MAX_ATTEMPTS || 5),
        jobId: process.env.SIGNATURE_FILE_CLEANUP_JOB_ID
            ? Number(process.env.SIGNATURE_FILE_CLEANUP_JOB_ID) : null,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
}

main()
    .catch(error => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
