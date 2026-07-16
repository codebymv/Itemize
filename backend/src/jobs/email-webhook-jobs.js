const { reconcileEmailWebhookEvent } = require('../services/emailWebhookService');
const { withTransaction } = require('../utils/db');
const { logger } = require('../utils/logger');

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_BASE_DELAY_MS = 300_000;
const DEFAULT_MAX_DELAY_MS = 86_400_000;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function emailReconciliationBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
}

function redactEmailReconciliationError(error) {
  return String(error?.message || error || 'Email event reconciliation failed')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:re|sk|whsec)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .slice(0, 500);
}

async function claimEmailReconciliation(pool, leaseSeconds) {
  return withTransaction(pool, async client => {
    const result = await client.query(`
      WITH candidate AS (
        SELECT svix_id
        FROM email_webhook_events
        WHERE (
            reconciliation_status IN ('pending', 'retry')
            AND COALESCE(reconciliation_next_attempt_at, received_at) <= CURRENT_TIMESTAMP
          ) OR (
            reconciliation_status = 'processing'
            AND reconciliation_lease_expires_at <= CURRENT_TIMESTAMP
          )
        ORDER BY COALESCE(reconciliation_next_attempt_at, received_at), received_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE email_webhook_events event SET
        reconciliation_status = 'processing',
        reconciliation_attempt_count = reconciliation_attempt_count + 1,
        reconciliation_lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second'),
        reconciliation_last_error = NULL
      FROM candidate
      WHERE event.svix_id = candidate.svix_id
      RETURNING event.*
    `, [leaseSeconds]);
    return result.rows[0] || null;
  });
}

async function markEmailReconciliationFailure(pool, claim, error, options) {
  const deadLetter = claim.reconciliation_attempt_count >= options.maxAttempts;
  const delayMs = emailReconciliationBackoffMs(
    claim.reconciliation_attempt_count,
    options.baseDelayMs,
    options.maxDelayMs
  );
  await pool.query(`
    UPDATE email_webhook_events SET
      reconciliation_status = $2::varchar,
      reconciliation_next_attempt_at = CASE
        WHEN $2::varchar = 'dead_letter' THEN NULL
        ELSE CURRENT_TIMESTAMP + ($3::bigint * INTERVAL '1 millisecond')
      END,
      reconciliation_lease_expires_at = NULL,
      reconciliation_last_error = $4
    WHERE svix_id = $1
      AND reconciliation_status = 'processing'
  `, [
    claim.svix_id,
    deadLetter ? 'dead_letter' : 'retry',
    delayMs,
    redactEmailReconciliationError(error),
  ]);
  return deadLetter ? 'dead_letter' : 'retry';
}

async function runEmailWebhookReconciliationJobs(pool, workerOptions = {}) {
  const options = {
    baseDelayMs: boundedInteger(workerOptions.baseDelayMs, DEFAULT_BASE_DELAY_MS, 1, DEFAULT_MAX_DELAY_MS),
    batchSize: boundedInteger(workerOptions.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
    leaseSeconds: boundedInteger(workerOptions.leaseSeconds, DEFAULT_LEASE_SECONDS, 1, 3600),
    maxAttempts: boundedInteger(workerOptions.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 20),
    maxDelayMs: boundedInteger(workerOptions.maxDelayMs, DEFAULT_MAX_DELAY_MS, 1, DEFAULT_MAX_DELAY_MS),
  };
  if (options.maxDelayMs < options.baseDelayMs) options.maxDelayMs = options.baseDelayMs;
  const summary = { claimed: 0, resolved: 0, retry: 0, deadLetter: 0 };

  for (let index = 0; index < options.batchSize; index += 1) {
    const claim = await claimEmailReconciliation(pool, options.leaseSeconds);
    if (!claim) break;
    summary.claimed += 1;
    try {
      await withTransaction(pool, client => reconcileEmailWebhookEvent(client, claim.svix_id));
      summary.resolved += 1;
    } catch (error) {
      const outcome = await markEmailReconciliationFailure(pool, claim, error, options);
      if (outcome === 'dead_letter') summary.deadLetter += 1;
      else summary.retry += 1;
      logger.warn('[Email webhook jobs] Reconciliation deferred', {
        deliveryId: claim.svix_id,
        outcome,
      });
    }
  }

  return summary;
}

module.exports = {
  emailReconciliationBackoffMs,
  redactEmailReconciliationError,
  runEmailWebhookReconciliationJobs,
};
