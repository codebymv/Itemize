/**
 * Faithful port of the retained realtime outbox delivery worker
 * (backend/src/jobs/realtime-outbox-jobs.js). The worker must run in
 * the process that owns the connected sockets; leases, retries, dead
 * letters, expiry, and the channel/event dispatch map are identical to
 * the retained implementation so either runtime can drain the shared
 * realtime_event_outbox once it becomes the socket origin.
 */
import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as os from 'os';
import { Pool, PoolClient } from 'pg';
import { RealtimeBroadcast } from './realtime-host';

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 30;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_MAX_EVENT_AGE_SECONDS = 15 * 60;

const logger = new Logger('RealtimeOutboxDelivery');

export type RealtimeOutboxOptions = {
  baseDelayMs?: number;
  batchSize?: number;
  leaseSeconds?: number;
  maxAttempts?: number;
  maxEventAgeSeconds?: number;
  maxDelayMs?: number;
  pollIntervalMs?: number;
  workerId?: string;
  outboxId?: number | null;
  deliver?: (claim: RealtimeOutboxClaim) => unknown;
};

export type RealtimeOutboxClaim = {
  id: number;
  channel: string;
  event_name: string;
  event_type: string;
  aggregate_type: string;
  recipient_key: string;
  payload: Record<string, unknown> | null;
  occurred_at: Date;
  attempt_count: number;
  claimed_by: string;
};

const boundedInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
};

export const realtimeBackoffMs = (
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number => Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));

export const redactRealtimeError = (error: unknown): string =>
  String((error as Error)?.message || error || 'Realtime delivery failed')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+\b/gi, '[redacted-authorization]')
    .replace(/\b(?:re|sk|whsec)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .slice(0, 500);

const workerOptions = (options: RealtimeOutboxOptions = {}) => {
  const normalized = {
    baseDelayMs: boundedInteger(options.baseDelayMs, DEFAULT_BASE_DELAY_MS, 1, 60_000),
    batchSize: boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
    leaseSeconds: boundedInteger(options.leaseSeconds, DEFAULT_LEASE_SECONDS, 1, 300),
    maxAttempts: boundedInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 20),
    maxEventAgeSeconds: boundedInteger(
      options.maxEventAgeSeconds,
      DEFAULT_MAX_EVENT_AGE_SECONDS,
      0,
      7 * 24 * 60 * 60,
    ),
    maxDelayMs: boundedInteger(options.maxDelayMs, DEFAULT_MAX_DELAY_MS, 1, 3_600_000),
    pollIntervalMs: boundedInteger(
      options.pollIntervalMs,
      DEFAULT_POLL_INTERVAL_MS,
      100,
      60_000,
    ),
    workerId:
      options.workerId || `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`,
  };
  if (normalized.maxDelayMs < normalized.baseDelayMs) {
    normalized.maxDelayMs = normalized.baseDelayMs;
  }
  return normalized;
};

async function expireStaleRealtimeEvents(
  pool: Pool,
  options: ReturnType<typeof workerOptions>,
  outboxId: number | null = null,
): Promise<number> {
  if (options.maxEventAgeSeconds === 0) return 0;
  const result = await pool.query(
    `UPDATE realtime_event_outbox SET
       status = 'expired',
       expired_at = CURRENT_TIMESTAMP,
       lease_expires_at = NULL,
       claimed_by = NULL,
       last_error = NULL
     WHERE ($2::bigint IS NULL OR id = $2)
       AND status IN ('queued', 'retry')
       AND occurred_at < CURRENT_TIMESTAMP - ($1::integer * INTERVAL '1 second')
       AND event_name IN (
         'userListUpdated',
         'listUpdated',
         'noteUpdated',
         'whiteboardUpdated',
         'wireframeUpdated',
         'userWireframeUpdated'
       )
     RETURNING id`,
    [options.maxEventAgeSeconds, outboxId],
  );
  return result.rows.length;
}

async function claimRealtimeEvent(
  pool: Pool,
  options: ReturnType<typeof workerOptions>,
  outboxId: number | null = null,
): Promise<RealtimeOutboxClaim | null> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<RealtimeOutboxClaim>(
      `WITH candidate AS (
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
       RETURNING outbox.*`,
      [options.leaseSeconds, options.workerId, outboxId],
    );
    await client.query('COMMIT');
    return result.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function dispatchRealtimeEvent(
  claim: RealtimeOutboxClaim,
  broadcast: RealtimeBroadcast,
): unknown {
  if (!broadcast) throw new Error('Realtime broadcast adapter is unavailable');
  const occurredAt = new Date(claim.occurred_at).toISOString();

  if (claim.channel === 'user_canvas' && claim.event_name === 'userListUpdated') {
    return broadcast.userListUpdate(claim.recipient_key, claim.event_type, claim.payload, occurredAt);
  }
  if (claim.channel === 'user_canvas' && claim.event_name === 'userListDeleted') {
    return broadcast.userListDeleted(claim.recipient_key, claim.payload, occurredAt);
  }
  if (claim.channel === 'shared_list' && claim.event_name === 'listUpdated') {
    return broadcast.listUpdate(claim.recipient_key, claim.event_type, claim.payload, occurredAt);
  }
  if (claim.channel === 'shared_note' && claim.event_name === 'noteUpdated') {
    return broadcast.noteUpdate(claim.recipient_key, claim.event_type, claim.payload, occurredAt);
  }
  if (claim.channel === 'shared_whiteboard' && claim.event_name === 'whiteboardUpdated') {
    return broadcast.whiteboardUpdate(claim.recipient_key, claim.event_type, claim.payload, occurredAt);
  }
  if (claim.channel === 'shared_wireframe' && claim.event_name === 'wireframeUpdated') {
    return broadcast.wireframeUpdate(claim.recipient_key, claim.event_type, claim.payload, occurredAt);
  }
  if (claim.channel === 'user_wireframe' && claim.event_name === 'userWireframeUpdated') {
    return broadcast.userWireframeUpdate(claim.recipient_key, claim.event_type, claim.payload, occurredAt);
  }
  if (claim.channel === 'shared_revocation' && claim.event_name === 'sharedContentRevoked') {
    return broadcast.revokeShared(claim.aggregate_type, claim.recipient_key);
  }
  if (claim.channel === 'chat_session' && claim.event_name === 'newChatMessage') {
    return broadcast.chatMessage(
      claim.recipient_key,
      claim.payload?.message,
      occurredAt,
    );
  }

  const error = new Error('Unsupported realtime outbox channel/event combination');
  (error as Error & { retryable?: boolean }).retryable = false;
  throw error;
}

async function markRealtimeEventSent(
  pool: Pool,
  claim: RealtimeOutboxClaim,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE realtime_event_outbox SET
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
     RETURNING id`,
    [claim.id, claim.attempt_count, claim.claimed_by],
  );
  return result.rows.length === 1;
}

async function markRealtimeEventFailure(
  pool: Pool,
  claim: RealtimeOutboxClaim,
  error: unknown,
  options: ReturnType<typeof workerOptions>,
): Promise<string> {
  const deadLetter =
    (error as { retryable?: boolean })?.retryable === false ||
    claim.attempt_count >= options.maxAttempts;
  const delayMs = realtimeBackoffMs(
    claim.attempt_count,
    options.baseDelayMs,
    options.maxDelayMs,
  );
  const result = await pool.query<{ status: string }>(
    `UPDATE realtime_event_outbox SET
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
     RETURNING status`,
    [
      claim.id,
      claim.attempt_count,
      claim.claimed_by,
      deadLetter ? 'dead_letter' : 'retry',
      delayMs,
      redactRealtimeError(error),
    ],
  );
  return result.rows[0]?.status || 'stale';
}

export type RealtimeOutboxSummary = {
  claimed: number;
  sent: number;
  retry: number;
  deadLetter: number;
  expired: number;
  stale: number;
};

export async function runRealtimeOutboxDelivery(
  pool: Pool,
  broadcast: RealtimeBroadcast,
  suppliedOptions: RealtimeOutboxOptions = {},
): Promise<RealtimeOutboxSummary> {
  const options = workerOptions(suppliedOptions);
  const deliver =
    suppliedOptions.deliver ||
    ((claim: RealtimeOutboxClaim) => dispatchRealtimeEvent(claim, broadcast));
  const summary: RealtimeOutboxSummary = {
    claimed: 0,
    sent: 0,
    retry: 0,
    deadLetter: 0,
    expired: 0,
    stale: 0,
  };

  summary.expired = await expireStaleRealtimeEvents(
    pool,
    options,
    suppliedOptions.outboxId || null,
  );

  for (let index = 0; index < options.batchSize; index += 1) {
    const claim = await claimRealtimeEvent(
      pool,
      options,
      suppliedOptions.outboxId || null,
    );
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
      logger.warn(
        `Delivery deferred: ${claim.channel}/${claim.event_name} outbox ${claim.id} -> ${status}`,
      );
    }
  }

  return summary;
}

export function startRealtimeOutboxDelivery(
  pool: Pool,
  broadcast: RealtimeBroadcast,
  suppliedOptions: RealtimeOutboxOptions = {},
): { stop: () => void } {
  const options = workerOptions(suppliedOptions);
  let running = false;
  let stopped = false;

  const cycle = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      const summary = await runRealtimeOutboxDelivery(pool, broadcast, options);
      if (summary.claimed > 0 || summary.expired > 0) {
        logger.log(`Delivery cycle completed: ${JSON.stringify(summary)}`);
      }
    } catch (error) {
      logger.error(`Delivery cycle failed: ${redactRealtimeError(error)}`);
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
