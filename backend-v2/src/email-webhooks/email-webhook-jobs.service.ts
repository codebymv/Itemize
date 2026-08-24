/**
 * Faithful port of the legacy email webhook reconciliation worker
 * (backend/src/jobs/email-webhook-jobs.js). Claim SQL, exponential
 * backoff, dead-letter thresholds, and error redaction must stay
 * identical while both runtimes can drain the shared
 * email_webhook_events table; SKIP LOCKED claims with leases make
 * concurrent draining safe.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { EmailWebhooksService } from './email-webhooks.service';

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_BASE_DELAY_MS = 300_000;
const DEFAULT_MAX_DELAY_MS = 86_400_000;

export type EmailReconciliationRun = {
  claimed: number;
  resolved: number;
  retry: number;
  deadLetter: number;
};

export type EmailReconciliationOptions = {
  baseDelayMs?: unknown;
  batchSize?: unknown;
  leaseSeconds?: unknown;
  maxAttempts?: unknown;
  maxDelayMs?: unknown;
};

type ResolvedOptions = {
  baseDelayMs: number;
  batchSize: number;
  leaseSeconds: number;
  maxAttempts: number;
  maxDelayMs: number;
};

type ReconciliationClaim = {
  svix_id: string;
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

export function emailReconciliationBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
}

export function redactEmailReconciliationError(error: unknown): string {
  const message =
    (error as { message?: unknown })?.message ||
    error ||
    'Email event reconciliation failed';
  return String(message)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:re|sk|whsec)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .slice(0, 500);
}

@Injectable()
export class EmailWebhookJobsService {
  private readonly logger = new Logger(EmailWebhookJobsService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly emailWebhooks: EmailWebhooksService,
  ) {}

  async run(
    workerOptions: EmailReconciliationOptions = {},
  ): Promise<EmailReconciliationRun> {
    const options: ResolvedOptions = {
      baseDelayMs: boundedInteger(
        workerOptions.baseDelayMs,
        DEFAULT_BASE_DELAY_MS,
        1,
        DEFAULT_MAX_DELAY_MS,
      ),
      batchSize: boundedInteger(workerOptions.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
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
    };
    if (options.maxDelayMs < options.baseDelayMs) {
      options.maxDelayMs = options.baseDelayMs;
    }
    const summary: EmailReconciliationRun = {
      claimed: 0,
      resolved: 0,
      retry: 0,
      deadLetter: 0,
    };

    for (let index = 0; index < options.batchSize; index += 1) {
      const claim = await this.claim(options.leaseSeconds);
      if (!claim) break;
      summary.claimed += 1;
      try {
        await this.transaction((client) =>
          this.emailWebhooks.reconcileEvent(client, claim.svix_id),
        );
        summary.resolved += 1;
      } catch (error) {
        const outcome = await this.markFailure(claim, error, options);
        if (outcome === 'dead_letter') summary.deadLetter += 1;
        else summary.retry += 1;
        this.logger.warn(
          `Email webhook reconciliation deferred deliveryId=${claim.svix_id} outcome=${outcome}`,
        );
      }
    }

    return summary;
  }

  private async claim(leaseSeconds: number): Promise<ReconciliationClaim | null> {
    return this.transaction(async (client) => {
      const result = await client.query<ReconciliationClaim>(
        `WITH candidate AS (
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
         RETURNING event.*`,
        [leaseSeconds],
      );
      return result.rows[0] || null;
    });
  }

  private async markFailure(
    claim: ReconciliationClaim,
    error: unknown,
    options: ResolvedOptions,
  ): Promise<'dead_letter' | 'retry'> {
    const deadLetter = claim.reconciliation_attempt_count >= options.maxAttempts;
    const delayMs = emailReconciliationBackoffMs(
      claim.reconciliation_attempt_count,
      options.baseDelayMs,
      options.maxDelayMs,
    );
    await this.pool.query(
      `UPDATE email_webhook_events SET
         reconciliation_status = $2::varchar,
         reconciliation_next_attempt_at = CASE
           WHEN $2::varchar = 'dead_letter' THEN NULL
           ELSE CURRENT_TIMESTAMP + ($3::bigint * INTERVAL '1 millisecond')
         END,
         reconciliation_lease_expires_at = NULL,
         reconciliation_last_error = $4
       WHERE svix_id = $1
         AND reconciliation_status = 'processing'`,
      [
        claim.svix_id,
        deadLetter ? 'dead_letter' : 'retry',
        delayMs,
        redactEmailReconciliationError(error),
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
