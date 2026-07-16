const {
  processMetaWebhookEventByKey,
  reconcileMetaWebhookEvent,
} = require('../services/socialWebhookService');
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

function socialWebhookBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
}

function redactSocialWebhookError(error) {
  return String(error?.message || error || 'Social webhook processing failed')
    .replace(/\b(?:EAAB|EAAJ|IGQVJ)[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(/\bsha256=[a-f0-9]{64}\b/gi, '[redacted-signature]')
    .slice(0, 500);
}

function workerOptions(workerOptions = {}) {
  const options = {
    baseDelayMs: boundedInteger(workerOptions.baseDelayMs, DEFAULT_BASE_DELAY_MS, 1, DEFAULT_MAX_DELAY_MS),
    batchSize: boundedInteger(workerOptions.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
    leaseSeconds: boundedInteger(workerOptions.leaseSeconds, DEFAULT_LEASE_SECONDS, 1, 3600),
    maxAttempts: boundedInteger(workerOptions.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 20),
    maxDelayMs: boundedInteger(workerOptions.maxDelayMs, DEFAULT_MAX_DELAY_MS, 1, DEFAULT_MAX_DELAY_MS),
    onProcessed: typeof workerOptions.onProcessed === 'function'
      ? workerOptions.onProcessed
      : null,
  };
  if (options.maxDelayMs < options.baseDelayMs) options.maxDelayMs = options.baseDelayMs;
  return options;
}

async function claimSocialWork(pool, leaseSeconds) {
  return withTransaction(pool, async client => {
    const result = await client.query(`
      WITH candidate AS (
        SELECT event_key
        FROM social_webhook_events
        WHERE (
            work_status IN ('queued', 'retry')
            AND COALESCE(work_next_attempt_at, received_at) <= CURRENT_TIMESTAMP
          ) OR (
            work_status = 'processing'
            AND work_lease_expires_at <= CURRENT_TIMESTAMP
          )
        ORDER BY COALESCE(work_next_attempt_at, received_at), event_timestamp, event_key
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE social_webhook_events event SET
        work_status = 'processing',
        work_attempt_count = work_attempt_count + 1,
        work_lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second'),
        work_last_error = NULL
      FROM candidate
      WHERE event.event_key = candidate.event_key
      RETURNING event.*
    `, [leaseSeconds]);
    return result.rows[0] || null;
  });
}

async function claimSocialReconciliation(pool, leaseSeconds) {
  return withTransaction(pool, async client => {
    const result = await client.query(`
      WITH candidate AS (
        SELECT event_key
        FROM social_webhook_events
        WHERE (
            reconciliation_status IN ('pending', 'retry')
            AND COALESCE(reconciliation_next_attempt_at, received_at) <= CURRENT_TIMESTAMP
          ) OR (
            reconciliation_status = 'processing'
            AND reconciliation_lease_expires_at <= CURRENT_TIMESTAMP
          )
        ORDER BY COALESCE(reconciliation_next_attempt_at, received_at), event_timestamp, event_key
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE social_webhook_events event SET
        reconciliation_status = 'processing',
        reconciliation_attempt_count = reconciliation_attempt_count + 1,
        reconciliation_lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second'),
        reconciliation_last_error = NULL
      FROM candidate
      WHERE event.event_key = candidate.event_key
      RETURNING event.*
    `, [leaseSeconds]);
    return result.rows[0] || null;
  });
}

async function markFailure(pool, claim, error, options, prefix) {
  const attemptColumn = `${prefix}_attempt_count`;
  const deadLetter = claim[attemptColumn] >= options.maxAttempts;
  const delayMs = socialWebhookBackoffMs(
    claim[attemptColumn],
    options.baseDelayMs,
    options.maxDelayMs
  );
  await pool.query(`
    UPDATE social_webhook_events SET
      ${prefix}_status = $2::varchar,
      ${prefix}_next_attempt_at = CASE
        WHEN $2::varchar = 'dead_letter' THEN NULL
        ELSE CURRENT_TIMESTAMP + ($3::bigint * INTERVAL '1 millisecond')
      END,
      ${prefix}_lease_expires_at = NULL,
      ${prefix}_last_error = $4
    WHERE event_key = $1
      AND ${prefix}_status = 'processing'
  `, [
    claim.event_key,
    deadLetter ? 'dead_letter' : 'retry',
    delayMs,
    redactSocialWebhookError(error),
  ]);
  return deadLetter ? 'dead_letter' : 'retry';
}

async function runQueue(pool, options, queue) {
  const isReconciliation = queue === 'reconciliation';
  const claim = isReconciliation ? claimSocialReconciliation : claimSocialWork;
  const process = isReconciliation ? reconcileMetaWebhookEvent : processMetaWebhookEventByKey;
  const summary = {
    claimed: 0,
    processed: 0,
    unroutable: 0,
    retry: 0,
    deadLetter: 0,
  };

  for (let index = 0; index < options.batchSize; index += 1) {
    const delivery = await claim(pool, options.leaseSeconds);
    if (!delivery) break;
    summary.claimed += 1;
    let result;
    try {
      result = await withTransaction(
        pool,
        client => process(client, delivery.event_key)
      );
    } catch (error) {
      const outcome = await markFailure(pool, delivery, error, options, queue === 'work' ? 'work' : 'reconciliation');
      if (outcome === 'dead_letter') summary.deadLetter += 1;
      else summary.retry += 1;
      logger.warn('[Social webhook jobs] Delivery deferred', { queue, outcome });
      continue;
    }

    if (result.status === 'processed') {
      summary.processed += 1;
      if (options.onProcessed) {
        try {
          await options.onProcessed(result);
        } catch {
          logger.warn('[Social webhook jobs] Post-commit notification failed', {
            queue,
          });
        }
      }
    } else {
      summary.unroutable += 1;
    }
  }

  return summary;
}

async function runSocialWebhookProcessingJobs(pool, options = {}) {
  return runQueue(pool, workerOptions(options), 'work');
}

async function runSocialWebhookReconciliationJobs(pool, options = {}) {
  return runQueue(pool, workerOptions(options), 'reconciliation');
}

module.exports = {
  redactSocialWebhookError,
  runSocialWebhookProcessingJobs,
  runSocialWebhookReconciliationJobs,
  socialWebhookBackoffMs,
};
