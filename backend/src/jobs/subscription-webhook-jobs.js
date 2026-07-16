const defaultEmailService = require('../services/emailService');
const { reconcileStripeSubscriptionEvent } = require('../services/subscriptionWebhookService');
const { withTransaction } = require('../utils/db');
const { logger } = require('../utils/logger');

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 60_000;
const DEFAULT_MAX_DELAY_MS = 86_400_000;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function notificationBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
}

function redactNotificationError(error) {
  return String(error?.message || error || 'Notification delivery failed')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:re|sk|whsec)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .slice(0, 500);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function claimNotification(pool, leaseSeconds) {
  return withTransaction(pool, async client => {
    const result = await client.query(`
      WITH candidate AS (
        SELECT stripe_event_id
        FROM stripe_subscription_webhook_events
        WHERE notification_type = 'subscription_upgraded'
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
      RETURNING event.*
    `, [leaseSeconds]);
    return result.rows[0] || null;
  });
}

async function loadNotificationRecipient(pool, organizationId) {
  const result = await pool.query(`
    SELECT
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
    WHERE organization.id = $1
  `, [organizationId]);
  return result.rows[0] || null;
}

async function sendUpgradeNotification(job, emailService) {
  if (!job.owner_email) throw new Error('Subscription notification has no owner recipient');
  const organizationName = escapeHtml(job.organization_name || 'your organization');
  const previousPlan = escapeHtml(job.previous_plan || 'previous');
  const newPlan = escapeHtml(job.new_plan || 'new');
  const result = await emailService.sendEmail({
    to: job.owner_email,
    subject: 'Subscription upgrade successful',
    html: `<p>${organizationName} has been upgraded from ${previousPlan} to ${newPlan}.</p>`,
    text: `${job.organization_name || 'Your organization'} has been upgraded from ${job.previous_plan || 'the previous plan'} to ${job.new_plan || 'the new plan'}.`,
    tags: [{ name: 'notification_type', value: 'subscription_upgraded' }],
    idempotencyKey: `subscription-upgrade-${job.stripe_event_id}`,
  });
  if (!result?.success) throw new Error(result?.error || 'Subscription notification delivery failed');
  return result;
}

async function markNotificationSent(pool, claim, providerId) {
  await pool.query(`
    UPDATE stripe_subscription_webhook_events SET
      notification_status = 'sent',
      notification_provider_id = $2,
      notification_sent_at = CURRENT_TIMESTAMP,
      notification_next_attempt_at = NULL,
      notification_lease_expires_at = NULL,
      notification_last_error = NULL
    WHERE stripe_event_id = $1
      AND notification_status = 'processing'
  `, [claim.stripe_event_id, providerId || null]);
}

async function markNotificationFailure(pool, claim, error, options) {
  const deadLetter = claim.notification_attempt_count >= options.maxAttempts;
  const delayMs = notificationBackoffMs(
    claim.notification_attempt_count,
    options.baseDelayMs,
    options.maxDelayMs
  );
  await pool.query(`
    UPDATE stripe_subscription_webhook_events SET
      notification_status = $2::varchar,
      notification_next_attempt_at = CASE
        WHEN $2::varchar = 'dead_letter' THEN NULL
        ELSE CURRENT_TIMESTAMP + ($3::bigint * INTERVAL '1 millisecond')
      END,
      notification_lease_expires_at = NULL,
      notification_last_error = $4
    WHERE stripe_event_id = $1
      AND notification_status = 'processing'
  `, [
    claim.stripe_event_id,
    deadLetter ? 'dead_letter' : 'retry',
    delayMs,
    redactNotificationError(error),
  ]);
  return deadLetter ? 'dead_letter' : 'retry';
}

async function runSubscriptionWebhookNotificationJobs(pool, workerOptions = {}) {
  const options = {
    baseDelayMs: boundedInteger(workerOptions.baseDelayMs, DEFAULT_BASE_DELAY_MS, 1, DEFAULT_MAX_DELAY_MS),
    batchSize: boundedInteger(workerOptions.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
    leaseSeconds: boundedInteger(workerOptions.leaseSeconds, DEFAULT_LEASE_SECONDS, 1, 3600),
    maxAttempts: boundedInteger(workerOptions.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 20),
    maxDelayMs: boundedInteger(workerOptions.maxDelayMs, DEFAULT_MAX_DELAY_MS, 1, DEFAULT_MAX_DELAY_MS),
  };
  if (options.maxDelayMs < options.baseDelayMs) options.maxDelayMs = options.baseDelayMs;
  const emailService = workerOptions.emailService
    || (workerOptions.sendNotification ? null : defaultEmailService);
  const deliver = workerOptions.sendNotification
    || (job => sendUpgradeNotification(job, emailService));
  const summary = { claimed: 0, sent: 0, retry: 0, deadLetter: 0 };

  for (let index = 0; index < options.batchSize; index += 1) {
    const claim = await claimNotification(pool, options.leaseSeconds);
    if (!claim) break;
    summary.claimed += 1;
    try {
      const recipient = await loadNotificationRecipient(pool, claim.organization_id);
      const result = await deliver({ ...claim, ...recipient });
      await markNotificationSent(pool, claim, result?.id);
      summary.sent += 1;
    } catch (error) {
      const outcome = await markNotificationFailure(pool, claim, error, options);
      if (outcome === 'dead_letter') summary.deadLetter += 1;
      else summary.retry += 1;
      logger.warn('[Subscription webhook jobs] Notification delivery deferred', {
        eventId: claim.stripe_event_id,
        outcome,
      });
    }
  }

  return summary;
}

async function claimReconciliation(pool, leaseSeconds) {
  return withTransaction(pool, async client => {
    const result = await client.query(`
      WITH candidate AS (
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
      RETURNING event.*
    `, [leaseSeconds]);
    return result.rows[0] || null;
  });
}

async function markReconciliationFailure(pool, claim, error, options) {
  const deadLetter = claim.reconciliation_attempt_count >= options.maxAttempts;
  const delayMs = notificationBackoffMs(
    claim.reconciliation_attempt_count,
    options.baseDelayMs,
    options.maxDelayMs
  );
  await pool.query(`
    UPDATE stripe_subscription_webhook_events SET
      reconciliation_status = $2::varchar,
      reconciliation_next_attempt_at = CASE
        WHEN $2::varchar = 'dead_letter' THEN NULL
        ELSE CURRENT_TIMESTAMP + ($3::bigint * INTERVAL '1 millisecond')
      END,
      reconciliation_lease_expires_at = NULL,
      reconciliation_last_error = $4
    WHERE stripe_event_id = $1
      AND reconciliation_status = 'processing'
  `, [
    claim.stripe_event_id,
    deadLetter ? 'dead_letter' : 'retry',
    delayMs,
    redactNotificationError(error),
  ]);
  return deadLetter ? 'dead_letter' : 'retry';
}

async function runSubscriptionWebhookReconciliationJobs(pool, workerOptions = {}) {
  const options = {
    baseDelayMs: boundedInteger(workerOptions.baseDelayMs, 300_000, 1, DEFAULT_MAX_DELAY_MS),
    batchSize: boundedInteger(workerOptions.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
    leaseSeconds: boundedInteger(workerOptions.leaseSeconds, DEFAULT_LEASE_SECONDS, 1, 3600),
    maxAttempts: boundedInteger(workerOptions.maxAttempts, 10, 1, 20),
    maxDelayMs: boundedInteger(workerOptions.maxDelayMs, DEFAULT_MAX_DELAY_MS, 1, DEFAULT_MAX_DELAY_MS),
  };
  if (options.maxDelayMs < options.baseDelayMs) options.maxDelayMs = options.baseDelayMs;
  const summary = { claimed: 0, resolved: 0, retry: 0, deadLetter: 0 };

  for (let index = 0; index < options.batchSize; index += 1) {
    const claim = await claimReconciliation(pool, options.leaseSeconds);
    if (!claim) break;
    summary.claimed += 1;
    try {
      await withTransaction(
        pool,
        client => reconcileStripeSubscriptionEvent(client, claim.stripe_event_id)
      );
      summary.resolved += 1;
    } catch (error) {
      const outcome = await markReconciliationFailure(pool, claim, error, options);
      if (outcome === 'dead_letter') summary.deadLetter += 1;
      else summary.retry += 1;
      logger.warn('[Subscription webhook jobs] Reconciliation deferred', {
        eventId: claim.stripe_event_id,
        outcome,
      });
    }
  }

  return summary;
}

module.exports = {
  notificationBackoffMs,
  redactNotificationError,
  runSubscriptionWebhookNotificationJobs,
  runSubscriptionWebhookReconciliationJobs,
  sendUpgradeNotification,
};
