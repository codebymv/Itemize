const crypto = require('crypto');
const os = require('os');
const { withTransaction } = require('../utils/db');
const { logger } = require('../utils/logger');

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 30;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function realtimeBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
}

function redactRealtimeError(error) {
  return String(error?.message || error || 'Realtime delivery failed')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+\b/gi, '[redacted-authorization]')
    .replace(/\b(?:re|sk|whsec)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .slice(0, 500);
}

function workerOptions(options = {}) {
  const normalized = {
    baseDelayMs: boundedInteger(options.baseDelayMs, DEFAULT_BASE_DELAY_MS, 1, 60_000),
    batchSize: boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
    leaseSeconds: boundedInteger(options.leaseSeconds, DEFAULT_LEASE_SECONDS, 1, 300),
    maxAttempts: boundedInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 20),
    maxDelayMs: boundedInteger(options.maxDelayMs, DEFAULT_MAX_DELAY_MS, 1, 3_600_000),
    pollIntervalMs: boundedInteger(
      options.pollIntervalMs,
      DEFAULT_POLL_INTERVAL_MS,
      100,
      60_000
    ),
    workerId: options.workerId
      || `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`,
  };
  if (normalized.maxDelayMs < normalized.baseDelayMs) {
    normalized.maxDelayMs = normalized.baseDelayMs;
  }
  return normalized;
}

async function claimRealtimeEvent(pool, options, outboxId = null) {
  return withTransaction(pool, async client => {
    const result = await client.query(`
      WITH candidate AS (
        SELECT id
        FROM realtime_event_outbox
        WHERE ($3::bigint IS NULL OR id = $3)
          AND (
            (
              status IN ('queued', 'retry')
              AND next_attempt_at <= CURRENT_TIMESTAMP
            ) OR (
              status = 'processing'
              AND lease_expires_at <= CURRENT_TIMESTAMP
            )
          )
        ORDER BY COALESCE(next_attempt_at, created_at), created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE realtime_event_outbox outbox SET
        status = 'processing',
        attempt_count = attempt_count + 1,
        lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second'),
        claimed_by = $2,
        last_error = NULL
      FROM candidate
      WHERE outbox.id = candidate.id
      RETURNING outbox.*
    `, [options.leaseSeconds, options.workerId, outboxId]);
    return result.rows[0] || null;
  });
}

async function dispatchRealtimeEvent(claim, broadcast) {
  if (!broadcast) throw new Error('Realtime broadcast adapter is unavailable');
  const occurredAt = new Date(claim.occurred_at).toISOString();

  if (claim.channel === 'user_canvas' && claim.event_name === 'userListUpdated') {
    if (typeof broadcast.userListUpdate !== 'function') {
      throw new Error('userListUpdate broadcast adapter is unavailable');
    }
    return broadcast.userListUpdate(
      claim.recipient_key,
      claim.event_type,
      claim.payload,
      occurredAt
    );
  }
  if (claim.channel === 'user_canvas' && claim.event_name === 'userListDeleted') {
    if (typeof broadcast.userListDeleted !== 'function') {
      throw new Error('userListDeleted broadcast adapter is unavailable');
    }
    return broadcast.userListDeleted(claim.recipient_key, claim.payload, occurredAt);
  }
  if (claim.channel === 'shared_list' && claim.event_name === 'listUpdated') {
    if (typeof broadcast.listUpdate !== 'function') {
      throw new Error('listUpdate broadcast adapter is unavailable');
    }
    return broadcast.listUpdate(
      claim.recipient_key,
      claim.event_type,
      claim.payload,
      occurredAt
    );
  }
  if (claim.channel === 'shared_note' && claim.event_name === 'noteUpdated') {
    if (typeof broadcast.noteUpdate !== 'function') {
      throw new Error('noteUpdate broadcast adapter is unavailable');
    }
    return broadcast.noteUpdate(
      claim.recipient_key,
      claim.event_type,
      claim.payload,
      occurredAt
    );
  }

  const error = new Error('Unsupported realtime outbox channel/event combination');
  error.retryable = false;
  throw error;
}

async function markRealtimeEventSent(pool, claim) {
  const result = await pool.query(`
    UPDATE realtime_event_outbox SET
      status = 'sent',
      delivered_at = CURRENT_TIMESTAMP,
      next_attempt_at = CURRENT_TIMESTAMP,
      lease_expires_at = NULL,
      claimed_by = NULL,
      last_error = NULL
    WHERE id = $1
      AND status = 'processing'
      AND attempt_count = $2
      AND claimed_by = $3
    RETURNING id
  `, [claim.id, claim.attempt_count, claim.claimed_by]);
  return result.rows.length === 1;
}

async function markRealtimeEventFailure(pool, claim, error, options) {
  const deadLetter = error?.retryable === false || claim.attempt_count >= options.maxAttempts;
  const delayMs = realtimeBackoffMs(
    claim.attempt_count,
    options.baseDelayMs,
    options.maxDelayMs
  );
  const result = await pool.query(`
    UPDATE realtime_event_outbox SET
      status = $4::varchar,
      next_attempt_at = CASE
        WHEN $4::varchar = 'dead_letter' THEN next_attempt_at
        ELSE CURRENT_TIMESTAMP + ($5::bigint * INTERVAL '1 millisecond')
      END,
      lease_expires_at = NULL,
      claimed_by = NULL,
      last_error = $6
    WHERE id = $1
      AND status = 'processing'
      AND attempt_count = $2
      AND claimed_by = $3
    RETURNING status
  `, [
    claim.id,
    claim.attempt_count,
    claim.claimed_by,
    deadLetter ? 'dead_letter' : 'retry',
    delayMs,
    redactRealtimeError(error),
  ]);
  return result.rows[0]?.status || 'stale';
}

async function runRealtimeOutboxJobs(pool, broadcast, suppliedOptions = {}) {
  const options = workerOptions(suppliedOptions);
  const deliver = suppliedOptions.deliver
    || (claim => dispatchRealtimeEvent(claim, broadcast));
  const summary = {
    claimed: 0,
    sent: 0,
    retry: 0,
    deadLetter: 0,
    stale: 0,
  };

  for (let index = 0; index < options.batchSize; index += 1) {
    const claim = await claimRealtimeEvent(pool, options, suppliedOptions.outboxId || null);
    if (!claim) break;
    summary.claimed += 1;
    try {
      await deliver(claim);
      const persisted = await markRealtimeEventSent(pool, claim);
      if (persisted) summary.sent += 1;
      else summary.stale += 1;
    } catch (error) {
      const status = await markRealtimeEventFailure(pool, claim, error, options);
      if (status === 'retry') summary.retry += 1;
      else if (status === 'dead_letter') summary.deadLetter += 1;
      else summary.stale += 1;
      logger.warn('[Realtime outbox] Delivery deferred', {
        channel: claim.channel,
        eventName: claim.event_name,
        outboxId: claim.id,
        status,
      });
    }
  }

  return summary;
}

function startRealtimeOutboxWorker(pool, broadcast, suppliedOptions = {}) {
  const options = workerOptions(suppliedOptions);
  let running = false;
  let stopped = false;

  const cycle = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const summary = await runRealtimeOutboxJobs(pool, broadcast, options);
      if (summary.claimed > 0) {
        logger.info('[Realtime outbox] Delivery cycle completed', summary);
      }
    } catch (error) {
      logger.error('[Realtime outbox] Delivery cycle failed', {
        error: redactRealtimeError(error),
      });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(cycle, options.pollIntervalMs);
  timer.unref?.();
  void cycle();

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

module.exports = {
  claimRealtimeEvent,
  dispatchRealtimeEvent,
  markRealtimeEventFailure,
  redactRealtimeError,
  realtimeBackoffMs,
  runRealtimeOutboxJobs,
  startRealtimeOutboxWorker,
};
