/**
 * Faithful port of the legacy subscription webhook workers
 * (backend/src/jobs/subscription-webhook-jobs.js): the owner
 * notification queue and the reconciliation queue. Claim SQL,
 * backoff/dead-letter thresholds, error redaction, plan display names,
 * and the exact email content (subject/heading/body/preview/idempotency
 * key) must stay identical while both runtimes can drain the shared
 * stripe_subscription_webhook_events table.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import {
  brandedTransactionalEmail,
  transactionalEmailAssetOrigin,
} from '../common/branded-transactional-email';
import { PG_POOL } from '../database/database.module';
import {
  SUBSCRIPTION_NOTIFICATION_EMAIL_PROVIDER,
  SubscriptionNotificationEmail,
  SubscriptionNotificationEmailProvider,
} from './subscription-notification-email.provider';
import { SubscriptionWebhooksService } from './subscription-webhooks.service';
import { PLAN_DISPLAY_NAMES } from './subscription-plan.constants';

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_NOTIFICATION_MAX_ATTEMPTS = 5;
const DEFAULT_NOTIFICATION_BASE_DELAY_MS = 60_000;
const DEFAULT_RECONCILIATION_MAX_ATTEMPTS = 10;
const DEFAULT_RECONCILIATION_BASE_DELAY_MS = 300_000;
const DEFAULT_MAX_DELAY_MS = 86_400_000;

export { PLAN_DISPLAY_NAMES } from './subscription-plan.constants';

export type SubscriptionNotificationRun = {
  claimed: number;
  sent: number;
  retry: number;
  deadLetter: number;
};

export type SubscriptionReconciliationRun = {
  claimed: number;
  resolved: number;
  retry: number;
  deadLetter: number;
};

export type SubscriptionWorkerOptions = {
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

export type NotificationClaim = {
  stripe_event_id: string;
  organization_id: number | null;
  previous_plan: string | null;
  new_plan: string | null;
  notification_type: string;
  notification_attempt_count: number;
};

type ReconciliationClaim = {
  stripe_event_id: string;
  reconciliation_attempt_count: number;
};

export type NotificationRecipient = {
  organization_id: number;
  organization_name: string | null;
  owner_email: string | null;
  owner_name: string | null;
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

export function notificationBackoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
}

export function redactNotificationError(error: unknown): string {
  const message =
    (error as { message?: unknown })?.message ||
    error ||
    'Notification delivery failed';
  return String(message)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:re|sk|whsec)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .slice(0, 500);
}

export function escapeHtml(value: unknown): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildUpgradeNotificationEmail(
  job: NotificationClaim & Partial<Omit<NotificationRecipient, 'organization_id'>>,
): SubscriptionNotificationEmail {
  if (!job.owner_email) {
    throw new Error('Subscription notification has no owner recipient');
  }
  const organizationName = escapeHtml(
    job.organization_name || 'your organization',
  );
  const previousPlan = escapeHtml(
    PLAN_DISPLAY_NAMES[job.previous_plan || ''] || job.previous_plan || 'previous',
  );
  const newPlan = escapeHtml(
    PLAN_DISPLAY_NAMES[job.new_plan || ''] || job.new_plan || 'new',
  );
  const isActivation = job.notification_type === 'subscription_activated';
  const subject = isActivation
    ? 'Your Itemize subscription is active'
    : 'Your Itemize plan was updated';
  const heading = isActivation ? 'Subscription active' : 'Subscription updated';
  const bodyHtml = isActivation
    ? `<p style="margin:0">${organizationName} is now on <strong>${newPlan}</strong>.</p>`
    : `<p style="margin:0">${organizationName} has been upgraded from <strong>${previousPlan}</strong> to <strong>${newPlan}</strong>.</p>`;
  const text = isActivation
    ? `${job.organization_name || 'Your organization'} is now on ${
        PLAN_DISPLAY_NAMES[job.new_plan || ''] || job.new_plan || 'its new plan'
      }.`
    : `${job.organization_name || 'Your organization'} has been upgraded from ${
        PLAN_DISPLAY_NAMES[job.previous_plan || ''] ||
        job.previous_plan ||
        'the previous plan'
      } to ${
        PLAN_DISPLAY_NAMES[job.new_plan || ''] || job.new_plan || 'the new plan'
      }.`;
  return {
    to: job.owner_email,
    subject,
    html: brandedTransactionalEmail({
      assetOrigin: transactionalEmailAssetOrigin(),
      previewText: `${job.organization_name || 'Your workspace'} is now on ${
        PLAN_DISPLAY_NAMES[job.new_plan || ''] || job.new_plan || 'its new plan'
      }.`,
      heading,
      bodyHtml,
      footerText: 'Billing notification from Itemize.',
    }),
    text,
    tags: [{ name: 'notification_type', value: job.notification_type }],
    idempotencyKey: isActivation
      ? `subscription-activation-${job.stripe_event_id}`
      : `subscription-upgrade-${job.stripe_event_id}`,
  };
}

@Injectable()
export class SubscriptionWebhookJobsService {
  private readonly logger = new Logger(SubscriptionWebhookJobsService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly subscriptionWebhooks: SubscriptionWebhooksService,
    @Inject(SUBSCRIPTION_NOTIFICATION_EMAIL_PROVIDER)
    private readonly emailProvider: SubscriptionNotificationEmailProvider,
  ) {}

  async runNotifications(
    workerOptions: SubscriptionWorkerOptions = {},
  ): Promise<SubscriptionNotificationRun> {
    const options = this.resolveOptions(workerOptions, {
      baseDelayMs: DEFAULT_NOTIFICATION_BASE_DELAY_MS,
      maxAttempts: DEFAULT_NOTIFICATION_MAX_ATTEMPTS,
    });
    const summary: SubscriptionNotificationRun = {
      claimed: 0,
      sent: 0,
      retry: 0,
      deadLetter: 0,
    };

    for (let index = 0; index < options.batchSize; index += 1) {
      const claim = await this.claimNotification(options.leaseSeconds);
      if (!claim) break;
      summary.claimed += 1;
      try {
        const recipient = await this.loadNotificationRecipient(
          claim.organization_id,
        );
        const message = buildUpgradeNotificationEmail({
          ...claim,
          ...recipient,
        });
        const result = await this.emailProvider.send(message);
        if (!result?.success) {
          throw new Error(
            result?.error || 'Subscription notification delivery failed',
          );
        }
        await this.markNotificationSent(claim, result.id ?? null);
        summary.sent += 1;
      } catch (error) {
        const outcome = await this.markNotificationFailure(
          claim,
          error,
          options,
        );
        if (outcome === 'dead_letter') summary.deadLetter += 1;
        else summary.retry += 1;
        this.logger.warn(
          `Subscription notification deferred eventId=${claim.stripe_event_id} outcome=${outcome}`,
        );
      }
    }

    return summary;
  }

  async runReconciliation(
    workerOptions: SubscriptionWorkerOptions = {},
  ): Promise<SubscriptionReconciliationRun> {
    const options = this.resolveOptions(workerOptions, {
      baseDelayMs: DEFAULT_RECONCILIATION_BASE_DELAY_MS,
      maxAttempts: DEFAULT_RECONCILIATION_MAX_ATTEMPTS,
    });
    const summary: SubscriptionReconciliationRun = {
      claimed: 0,
      resolved: 0,
      retry: 0,
      deadLetter: 0,
    };

    for (let index = 0; index < options.batchSize; index += 1) {
      const claim = await this.claimReconciliation(options.leaseSeconds);
      if (!claim) break;
      summary.claimed += 1;
      try {
        await this.transaction((client) =>
          this.subscriptionWebhooks.reconcileEvent(
            client,
            claim.stripe_event_id,
          ),
        );
        summary.resolved += 1;
      } catch (error) {
        const outcome = await this.markReconciliationFailure(
          claim,
          error,
          options,
        );
        if (outcome === 'dead_letter') summary.deadLetter += 1;
        else summary.retry += 1;
        this.logger.warn(
          `Subscription reconciliation deferred eventId=${claim.stripe_event_id} outcome=${outcome}`,
        );
      }
    }

    return summary;
  }

  private resolveOptions(
    workerOptions: SubscriptionWorkerOptions,
    defaults: { baseDelayMs: number; maxAttempts: number },
  ): ResolvedOptions {
    const options: ResolvedOptions = {
      baseDelayMs: boundedInteger(
        workerOptions.baseDelayMs,
        defaults.baseDelayMs,
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
        defaults.maxAttempts,
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
    return options;
  }

  private async claimNotification(
    leaseSeconds: number,
  ): Promise<NotificationClaim | null> {
    return this.transaction(async (client) => {
      const result = await client.query<NotificationClaim>(
        `WITH candidate AS (
           SELECT stripe_event_id
           FROM stripe_subscription_webhook_events
           WHERE notification_type IN ('subscription_upgraded', 'subscription_activated')
             AND (
               (
                 notification_status IN ('pending', 'retry')
                 AND COALESCE(notification_next_attempt_at, received_at) <= CURRENT_TIMESTAMP
               )
               OR (
                 notification_status = 'processing'
                 AND notification_lease_expires_at <= CURRENT_TIMESTAMP
               )
             )
           ORDER BY COALESCE(notification_next_attempt_at, received_at), received_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE stripe_subscription_webhook_events event SET
           notification_status = 'processing',
           notification_attempt_count = notification_attempt_count + 1,
           notification_lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second'),
           notification_last_error = NULL
         FROM candidate
         WHERE event.stripe_event_id = candidate.stripe_event_id
         RETURNING event.*`,
        [leaseSeconds],
      );
      return result.rows[0] || null;
    });
  }

  private async loadNotificationRecipient(
    organizationId: number | null,
  ): Promise<NotificationRecipient | null> {
    const result = await this.pool.query<NotificationRecipient>(
      `SELECT
         organization.id AS organization_id,
         organization.name AS organization_name,
         owner_user.email AS owner_email,
         owner_user.name AS owner_name
       FROM organizations organization
       LEFT JOIN LATERAL (
         SELECT users.email, users.name
         FROM organization_members member
         JOIN users ON users.id = member.user_id
         WHERE member.organization_id = organization.id
           AND member.role = 'owner'
         ORDER BY member.joined_at NULLS LAST, member.id
         LIMIT 1
       ) owner_user ON TRUE
       WHERE organization.id = $1`,
      [organizationId],
    );
    return result.rows[0] || null;
  }

  private async markNotificationSent(
    claim: NotificationClaim,
    providerId: string | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE stripe_subscription_webhook_events SET
         notification_status = 'sent',
         notification_provider_id = $2,
         notification_sent_at = CURRENT_TIMESTAMP,
         notification_next_attempt_at = NULL,
         notification_lease_expires_at = NULL,
         notification_last_error = NULL
       WHERE stripe_event_id = $1
         AND notification_status = 'processing'`,
      [claim.stripe_event_id, providerId || null],
    );
  }

  private async markNotificationFailure(
    claim: NotificationClaim,
    error: unknown,
    options: ResolvedOptions,
  ): Promise<'dead_letter' | 'retry'> {
    const deadLetter = claim.notification_attempt_count >= options.maxAttempts;
    const delayMs = notificationBackoffMs(
      claim.notification_attempt_count,
      options.baseDelayMs,
      options.maxDelayMs,
    );
    await this.pool.query(
      `UPDATE stripe_subscription_webhook_events SET
         notification_status = $2::varchar,
         notification_next_attempt_at = CASE
           WHEN $2::varchar = 'dead_letter' THEN NULL
           ELSE CURRENT_TIMESTAMP + ($3::bigint * INTERVAL '1 millisecond')
         END,
         notification_lease_expires_at = NULL,
         notification_last_error = $4
       WHERE stripe_event_id = $1
         AND notification_status = 'processing'`,
      [
        claim.stripe_event_id,
        deadLetter ? 'dead_letter' : 'retry',
        delayMs,
        redactNotificationError(error),
      ],
    );
    return deadLetter ? 'dead_letter' : 'retry';
  }

  private async claimReconciliation(
    leaseSeconds: number,
  ): Promise<ReconciliationClaim | null> {
    return this.transaction(async (client) => {
      const result = await client.query<ReconciliationClaim>(
        `WITH candidate AS (
           SELECT stripe_event_id
           FROM stripe_subscription_webhook_events
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
         UPDATE stripe_subscription_webhook_events event SET
           reconciliation_status = 'processing',
           reconciliation_attempt_count = reconciliation_attempt_count + 1,
           reconciliation_lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second'),
           reconciliation_last_error = NULL
         FROM candidate
         WHERE event.stripe_event_id = candidate.stripe_event_id
         RETURNING event.*`,
        [leaseSeconds],
      );
      return result.rows[0] || null;
    });
  }

  private async markReconciliationFailure(
    claim: ReconciliationClaim,
    error: unknown,
    options: ResolvedOptions,
  ): Promise<'dead_letter' | 'retry'> {
    const deadLetter =
      claim.reconciliation_attempt_count >= options.maxAttempts;
    const delayMs = notificationBackoffMs(
      claim.reconciliation_attempt_count,
      options.baseDelayMs,
      options.maxDelayMs,
    );
    await this.pool.query(
      `UPDATE stripe_subscription_webhook_events SET
         reconciliation_status = $2::varchar,
         reconciliation_next_attempt_at = CASE
           WHEN $2::varchar = 'dead_letter' THEN NULL
           ELSE CURRENT_TIMESTAMP + ($3::bigint * INTERVAL '1 millisecond')
         END,
         reconciliation_lease_expires_at = NULL,
         reconciliation_last_error = $4
       WHERE stripe_event_id = $1
         AND reconciliation_status = 'processing'`,
      [
        claim.stripe_event_id,
        deadLetter ? 'dead_letter' : 'retry',
        delayMs,
        redactNotificationError(error),
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
