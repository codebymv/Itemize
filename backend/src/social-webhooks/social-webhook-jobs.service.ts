/**
 * Faithful port of the legacy social webhook workers
 * (backend/src/jobs/social-webhook-jobs.js): the processing queue and
 * the reconciliation queue over social_webhook_events. Claim SQL,
 * backoff/dead-letter thresholds, token/signature redaction, and the
 * post-commit onProcessed hook must stay identical while both runtimes
 * can drain the shared table.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  SocialWebhookProcessingService,
  SocialWebhookProcessResult,
} from './social-webhook-processing.service';

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_BASE_DELAY_MS = 300_000;
const DEFAULT_MAX_DELAY_MS = 86_400_000;

export type SocialWebhookRun = {
  claimed: number;
  processed: number;
  unroutable: number;
  retry: number;
  deadLetter: number;
};

export type SocialWebhookWorkerOptions = {
  baseDelayMs?: unknown;
  batchSize?: unknown;
  leaseSeconds?: unknown;
  maxAttempts?: unknown;
  maxDelayMs?: unknown;
  onProcessed?: ((result: SocialWebhookProcessResult) => Promise<void>) | null;
};

type ResolvedOptions = {
  baseDelayMs: number;
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
  maxDelayMs: number;
  onProcessed: ((result: SocialWebhookProcessResult) => Promise<void>) | null;
};

type QueueClaim = {
  event_key: string;
  work_attempt_count: number;
  reconciliation_attempt_count: number;
};

export function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

export function socialWebhookBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
}

export function redactSocialWebhookError(error: unknown): string {
  const message =
    (error as { message?: unknown })?.message ||
    error ||
    'Social webhook processing failed';
  return String(message)
    .replace(/\b(?:EAAB|EAAJ|IGQVJ)[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(/\bsha256=[a-f0-9]{64}\b/gi, '[redacted-signature]')
    .slice(0, 500);
}

@Injectable()
export class SocialWebhookJobsService {
  private readonly logger = new Logger(SocialWebhookJobsService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly processing: SocialWebhookProcessingService,
  ) {}

  async runProcessing(
    options: SocialWebhookWorkerOptions = {},
  ): Promise<SocialWebhookRun> {
    return this.runQueue(this.resolveOptions(options), 'work');
  }

  async runReconciliation(
    options: SocialWebhookWorkerOptions = {},
  ): Promise<SocialWebhookRun> {
    return this.runQueue(this.resolveOptions(options), 'reconciliation');
  }

  private resolveOptions(
    workerOptions: SocialWebhookWorkerOptions,
  ): ResolvedOptions {
    const options: ResolvedOptions = {
      baseDelayMs: boundedInteger(
        workerOptions.baseDelayMs,
        DEFAULT_BASE_DELAY_MS,
        1,
        DEFAULT_MAX_DELAY_MS,
      ),
      batchSize: boundedInteger(
        workerOptions.batchSize,
        DEFAULT_BATCH_SIZE,
        1,
        100,
      ),
      leaseSeconds: boundedInteger(
        workerOptions.leaseSeconds,
        DEFAULT_LEASE_SECONDS,
        1,
        3600,
      ),
      maxAttempts: boundedInteger(
        workerOptions.maxAttempts,
        DEFAULT_MAX_ATTEMPTS,
        1,
        20,
      ),
      maxDelayMs: boundedInteger(
        workerOptions.maxDelayMs,
        DEFAULT_MAX_DELAY_MS,
        1,
        DEFAULT_MAX_DELAY_MS,
      ),
      onProcessed:
        typeof workerOptions.onProcessed === 'function'
          ? workerOptions.onProcessed
          : null,
    };
    if (options.maxDelayMs < options.baseDelayMs) {
      options.maxDelayMs = options.baseDelayMs;
    }
    return options;
  }

  private async runQueue(
    options: ResolvedOptions,
    queue: 'work' | 'reconciliation',
  ): Promise<SocialWebhookRun> {
    const isReconciliation = queue === 'reconciliation';
    const summary: SocialWebhookRun = {
      claimed: 0,
      processed: 0,
      unroutable: 0,
      retry: 0,
      deadLetter: 0,
    };

    for (let index = 0; index < options.batchSize; index += 1) {
      const delivery = isReconciliation
        ? await this.claimReconciliation(options.leaseSeconds)
        : await this.claimWork(options.leaseSeconds);
      if (!delivery) break;
      summary.claimed += 1;
      let result: SocialWebhookProcessResult;
      try {
        result = await this.transaction((client) =>
          isReconciliation
            ? this.processing.reconcileMetaWebhookEvent(
                client,
                delivery.event_key,
              )
            : this.processing.processMetaWebhookEventByKey(
                client,
                delivery.event_key,
              ),
        );
      } catch (error) {
        const outcome = await this.markFailure(delivery, error, options, queue);
        if (outcome === 'dead_letter') summary.deadLetter += 1;
        else summary.retry += 1;
        this.logger.warn(
          `Social webhook delivery deferred queue=${queue} outcome=${outcome}`,
        );
        continue;
      }

      if (result.status === 'processed') {
        summary.processed += 1;
        if (options.onProcessed) {
          try {
            await options.onProcessed(result);
          } catch {
            this.logger.warn(
              `Social webhook post-commit notification failed queue=${queue}`,
            );
          }
        }
      } else {
        summary.unroutable += 1;
      }
    }

    return summary;
  }

  private async claimWork(leaseSeconds: number): Promise<QueueClaim | null> {
    return this.transaction(async (client) => {
      const result = await client.query<QueueClaim>(
        `WITH candidate AS (
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
         RETURNING event.*`,
        [leaseSeconds],
      );
      return result.rows[0] || null;
    });
  }

  private async claimReconciliation(
    leaseSeconds: number,
  ): Promise<QueueClaim | null> {
    return this.transaction(async (client) => {
      const result = await client.query<QueueClaim>(
        `WITH candidate AS (
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
         RETURNING event.*`,
        [leaseSeconds],
      );
      return result.rows[0] || null;
    });
  }

  private async markFailure(
    claim: QueueClaim,
    error: unknown,
    options: ResolvedOptions,
    prefix: 'work' | 'reconciliation',
  ): Promise<'dead_letter' | 'retry'> {
    const attemptCount =
      prefix === 'work'
        ? claim.work_attempt_count
        : claim.reconciliation_attempt_count;
    const deadLetter = attemptCount >= options.maxAttempts;
    const delayMs = socialWebhookBackoffMs(
      attemptCount,
      options.baseDelayMs,
      options.maxDelayMs,
    );
    await this.pool.query(
      `UPDATE social_webhook_events SET
         ${prefix}_status = $2::varchar,
         ${prefix}_next_attempt_at = CASE
           WHEN $2::varchar = 'dead_letter' THEN NULL
           ELSE CURRENT_TIMESTAMP + ($3::bigint * INTERVAL '1 millisecond')
         END,
         ${prefix}_lease_expires_at = NULL,
         ${prefix}_last_error = $4
       WHERE event_key = $1
         AND ${prefix}_status = 'processing'`,
      [
        claim.event_key,
        deadLetter ? 'dead_letter' : 'retry',
        delayMs,
        redactSocialWebhookError(error),
      ],
    );
    return deadLetter ? 'dead_letter' : 'retry';
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
