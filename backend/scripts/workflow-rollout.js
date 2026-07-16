#!/usr/bin/env node

require('dotenv').config();

const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const {
  workflowRolloutDatabaseIdentity,
} = require('../src/services/workflowRolloutIdentity');

const backendRoot = path.resolve(__dirname, '..');
const mode = String(process.argv[2] || 'preflight').trim().toLowerCase();
const supportedModes = new Set(['identity', 'preflight', 'canary', 'drain']);

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function writeEvidence(result) {
  const directory = path.resolve(
    process.env.WORKFLOW_ROLLOUT_EVIDENCE_DIR
      || path.join(backendRoot, '.workflow-rollout-results')
  );
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, `${safeTimestamp()}-${mode}.json`);
  await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return file;
}

async function main() {
  if (!supportedModes.has(mode)) {
    throw new Error(`Mode must be one of: ${[...supportedModes].join(', ')}`);
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  if (mode === 'identity') {
    const result = workflowRolloutDatabaseIdentity(process.env);
    console.log(JSON.stringify({ mode, result }, null, 2));
    return;
  }

  const {
    drainWorkflowSideEffects,
    runWorkflowCanary,
    workflowRolloutPreflight,
  } = require('../src/services/workflowRolloutOperations');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let result;
    if (mode === 'canary') {
      result = await runWorkflowCanary(pool);
    } else if (mode === 'drain') {
      result = await drainWorkflowSideEffects(pool, {
        batchSize: process.env.WORKFLOW_DRAIN_BATCH_SIZE,
        maxCycles: process.env.WORKFLOW_DRAIN_MAX_CYCLES,
      });
    } else {
      result = await workflowRolloutPreflight(pool, {
        requireCanary: true,
      });
    }
    const evidenceFile = await writeEvidence({
      generatedAt: new Date().toISOString(),
      mode,
      result,
    });
    console.log(JSON.stringify({ evidenceFile, mode, result }, null, 2));
    if (mode === 'preflight' && !result.ok) process.exitCode = 1;
    if (mode === 'drain' && !result.drained) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch(async error => {
  const failure = {
    error: error.message,
    generatedAt: new Date().toISOString(),
    mode,
    canary: error.canary || null,
  };
  try {
    failure.evidenceFile = await writeEvidence(failure);
  } catch {
    // Preserve the original rollout failure if evidence storage also fails.
  }
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
});
