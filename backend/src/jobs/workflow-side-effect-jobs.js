const defaultEmailService = require('../services/emailService');
const defaultSmsService = require('../services/smsService');
const {
  DEFAULT_WEBHOOK_MAX_REQUEST_BYTES,
  DEFAULT_WEBHOOK_MAX_RESPONSE_BYTES,
  deliverWorkflowWebhook,
  normalizeWorkflowWebhookHeaders,
  parseWorkflowWebhookUrl,
} = require('../services/workflowWebhookEgress');
const { withTransaction } = require('../utils/db');
const { logger } = require('../utils/logger');

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 60_000;
const DEFAULT_MAX_DELAY_MS = 86_400_000;
const DEFAULT_WEBHOOK_TIMEOUT_MS = 10_000;
const WORKFLOW_WEBHOOK_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function workflowSideEffectBackoffMs(attempt, baseDelayMs, maxDelayMs) {
  return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)));
}

function redactWorkflowSideEffectError(error) {
  return String(error?.message || error || 'Workflow side-effect delivery failed')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\+\d{7,15}\b/g, '[redacted-phone]')
    .replace(/\b(?:re|sk|whsec|AC|SK)_[A-Za-z0-9_-]+\b/g, '[redacted-secret]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+\b/gi, '[redacted-authorization]')
    .replace(/\bsha256=[a-f0-9]{64}\b/gi, '[redacted-signature]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .slice(0, 500);
}

function deliveryOptions(workerOptions = {}) {
  const options = {
    baseDelayMs: boundedInteger(
      workerOptions.baseDelayMs,
      DEFAULT_BASE_DELAY_MS,
      1,
      DEFAULT_MAX_DELAY_MS
    ),
    batchSize: boundedInteger(workerOptions.batchSize, DEFAULT_BATCH_SIZE, 1, 100),
    leaseSeconds: boundedInteger(workerOptions.leaseSeconds, DEFAULT_LEASE_SECONDS, 1, 3600),
    maxAttempts: boundedInteger(workerOptions.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 20),
    maxDelayMs: boundedInteger(
      workerOptions.maxDelayMs,
      DEFAULT_MAX_DELAY_MS,
      1,
      DEFAULT_MAX_DELAY_MS
    ),
    webhookTimeoutMs: boundedInteger(
      workerOptions.webhookTimeoutMs,
      DEFAULT_WEBHOOK_TIMEOUT_MS,
      100,
      60_000
    ),
    webhookMaxRequestBytes: boundedInteger(
      workerOptions.webhookMaxRequestBytes ?? process.env.WORKFLOW_WEBHOOK_MAX_REQUEST_BYTES,
      DEFAULT_WEBHOOK_MAX_REQUEST_BYTES,
      1024,
      1024 * 1024
    ),
    webhookMaxResponseBytes: boundedInteger(
      workerOptions.webhookMaxResponseBytes ?? process.env.WORKFLOW_WEBHOOK_MAX_RESPONSE_BYTES,
      DEFAULT_WEBHOOK_MAX_RESPONSE_BYTES,
      1024,
      1024 * 1024
    ),
  };
  if (options.maxDelayMs < options.baseDelayMs) options.maxDelayMs = options.baseDelayMs;
  return options;
}

async function quarantineExpiredSmsAttempts(queryable, outboxId = null) {
  const result = await queryable.query(`
    UPDATE workflow_side_effect_outbox
    SET status = 'reconciliation_required',
        reconciliation_required_at = COALESCE(
          reconciliation_required_at,
          CURRENT_TIMESTAMP
        ),
        reconciliation_reason = 'provider_result_unknown',
        next_attempt_at = NULL,
        lease_expires_at = NULL,
        last_error = 'SMS provider outcome requires operator reconciliation'
    WHERE effect_type = 'sms'
      AND ($1::integer IS NULL OR id = $1)
      AND status = 'processing'
      AND cancelled_at IS NULL
      AND lease_expires_at <= CURRENT_TIMESTAMP
    RETURNING id
  `, [outboxId]);
  return result.rows.length;
}

async function claimWorkflowSideEffect(pool, leaseSeconds, outboxId = null) {
  return withTransaction(pool, async client => {
    await client.query(`
      UPDATE workflow_side_effect_outbox
      SET status = 'cancelled',
          next_attempt_at = NULL,
          lease_expires_at = NULL
      WHERE status = 'processing'
        AND ($1::integer IS NULL OR id = $1)
        AND cancelled_at IS NOT NULL
        AND lease_expires_at <= CURRENT_TIMESTAMP
    `, [outboxId]);
    await quarantineExpiredSmsAttempts(client, outboxId);
    const result = await client.query(`
      WITH candidate AS (
        SELECT id
        FROM workflow_side_effect_outbox
        WHERE ($2::integer IS NULL OR id = $2)
          AND cancelled_at IS NULL
          AND (
          (
            status IN ('queued', 'retry')
            AND COALESCE(next_attempt_at, created_at) <= CURRENT_TIMESTAMP
          ) OR (
            status = 'processing'
            AND effect_type <> 'sms'
            AND lease_expires_at <= CURRENT_TIMESTAMP
          )
        )
        ORDER BY COALESCE(next_attempt_at, created_at), created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE workflow_side_effect_outbox outbox SET
        status = 'processing',
        attempt_count = attempt_count + 1,
        lease_expires_at = CURRENT_TIMESTAMP + ($1::integer * INTERVAL '1 second'),
        last_error = NULL
      FROM candidate
      WHERE outbox.id = candidate.id
      RETURNING outbox.*
    `, [leaseSeconds, outboxId]);
    return result.rows[0] || null;
  });
}

function requirePayloadField(payload, field) {
  if (payload?.[field] === undefined || payload[field] === null || payload[field] === '') {
    throw new Error(`Workflow side-effect payload is missing ${field}`);
  }
  return payload[field];
}

async function deliverWorkflowSideEffect(claim, dependencies = {}) {
  const payload = claim.payload || {};

  if (claim.effect_type === 'email') {
    const service = dependencies.emailService || defaultEmailService;
    const tags = [
      claim.enrollment_id
        ? { name: 'workflow_enrollment_id', value: String(claim.enrollment_id) }
        : null,
      claim.step_id
        ? { name: 'workflow_step_id', value: String(claim.step_id) }
        : null,
    ].filter(Boolean);
    const result = await service.sendEmail({
      to: requirePayloadField(payload, 'to'),
      subject: requirePayloadField(payload, 'subject'),
      html: payload.bodyHtml || '',
      text: payload.bodyText || undefined,
      from: payload.from || undefined,
      replyTo: payload.replyTo || undefined,
      tags,
      idempotencyKey: claim.idempotency_key,
    });
    if (!result?.success) throw new Error(result?.error || 'Workflow email delivery failed');
    return result;
  }

  if (claim.effect_type === 'sms') {
    const service = dependencies.smsService || defaultSmsService;
    const result = await service.sendSms({
      to: requirePayloadField(payload, 'to'),
      message: requirePayloadField(payload, 'message'),
      from: payload.from || undefined,
    });
    if (!result?.success) {
      const error = new Error(result?.error || 'Workflow SMS delivery failed');
      error.providerOutcomeUnknown = result?.outcomeUnknown === true;
      throw error;
    }
    return result;
  }

  if (claim.effect_type === 'webhook') {
    const targetUrl = parseWorkflowWebhookUrl(requirePayloadField(payload, 'url'));
    const method = String(payload.method || 'POST').toUpperCase();
    if (!WORKFLOW_WEBHOOK_METHODS.has(method)) {
      throw new Error('Unsupported workflow webhook method');
    }
    return deliverWorkflowWebhook({
      body: payload.body || {},
      method,
      headers: {
        ...normalizeWorkflowWebhookHeaders(payload.headers),
      },
      idempotencyKey: claim.idempotency_key,
      url: targetUrl.toString(),
    }, {
      httpClient: dependencies.httpClient,
      lookup: dependencies.lookup,
      maxRequestBytes: dependencies.webhookMaxRequestBytes,
      maxResponseBytes: dependencies.webhookMaxResponseBytes,
      timeoutMs: dependencies.webhookTimeoutMs,
    });
  }

  throw new Error(`Unsupported workflow side-effect type: ${claim.effect_type}`);
}

async function markWorkflowSideEffectSent(pool, claim, result) {
  return withTransaction(pool, async client => {
    const updated = await client.query(`
      UPDATE workflow_side_effect_outbox SET
        status = 'sent',
        provider_id = $3,
        sent_at = CURRENT_TIMESTAMP,
        next_attempt_at = NULL,
        lease_expires_at = NULL,
        last_error = NULL
      WHERE id = $1
        AND status = 'processing'
        AND attempt_count = $2
      RETURNING id
    `, [claim.id, claim.attempt_count, result?.id || null]);
    if (updated.rows.length === 0) return false;

    const payload = claim.payload || {};
    if (claim.effect_type === 'email') {
      await client.query(`
        INSERT INTO email_logs (
          organization_id, contact_id, template_id, workflow_enrollment_id,
          workflow_side_effect_id, to_email, from_email, subject, body_html,
          status, external_id, metadata, sent_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          'sent', $10, $11::jsonb, CURRENT_TIMESTAMP
        )
        ON CONFLICT (workflow_side_effect_id)
          WHERE workflow_side_effect_id IS NOT NULL
        DO UPDATE SET
          status = 'sent',
          external_id = EXCLUDED.external_id,
          error_message = NULL,
          sent_at = EXCLUDED.sent_at
      `, [
        claim.organization_id,
        payload.contactId || null,
        payload.templateId || null,
        claim.enrollment_id,
        claim.id,
        payload.to,
        payload.from || null,
        payload.subject,
        payload.bodyHtml || null,
        result?.id || null,
        JSON.stringify({ idempotency_key: claim.idempotency_key }),
      ]);
    } else if (claim.effect_type === 'sms') {
      await client.query(`
        INSERT INTO sms_logs (
          organization_id, contact_id, template_id, workflow_enrollment_id,
          workflow_side_effect_id, to_phone, from_phone, message, direction,
          status, external_id, segments, sent_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 'outbound',
          'sent', $9, $10, CURRENT_TIMESTAMP
        )
        ON CONFLICT (workflow_side_effect_id)
          WHERE workflow_side_effect_id IS NOT NULL
        DO UPDATE SET
          status = 'sent',
          external_id = EXCLUDED.external_id,
          error_code = NULL,
          error_message = NULL,
          sent_at = EXCLUDED.sent_at
      `, [
        claim.organization_id,
        payload.contactId || null,
        payload.templateId || null,
        claim.enrollment_id,
        claim.id,
        payload.to,
        payload.from || null,
        payload.message,
        result?.id || null,
        payload.segments || 1,
      ]);
    }
    return true;
  });
}

async function markWorkflowSideEffectFailure(pool, claim, error, options) {
  if (claim.effect_type === 'sms' && error?.providerOutcomeUnknown === true) {
    const result = await pool.query(`
      UPDATE workflow_side_effect_outbox SET
        status = CASE
          WHEN cancelled_at IS NOT NULL THEN 'cancelled'
          ELSE 'reconciliation_required'
        END,
        reconciliation_required_at = CASE
          WHEN cancelled_at IS NOT NULL THEN reconciliation_required_at
          ELSE COALESCE(reconciliation_required_at, CURRENT_TIMESTAMP)
        END,
        reconciliation_reason = CASE
          WHEN cancelled_at IS NOT NULL THEN reconciliation_reason
          ELSE 'provider_result_unknown'
        END,
        next_attempt_at = NULL,
        lease_expires_at = NULL,
        last_error = $3
      WHERE id = $1
        AND status = 'processing'
        AND attempt_count = $2
      RETURNING status
    `, [
      claim.id,
      claim.attempt_count,
      redactWorkflowSideEffectError(error),
    ]);
    return result.rows[0]?.status || 'stale';
  }

  const deadLetter = error?.retryable === false || claim.attempt_count >= options.maxAttempts;
  const delayMs = workflowSideEffectBackoffMs(
    claim.attempt_count,
    options.baseDelayMs,
    options.maxDelayMs
  );
  const result = await pool.query(`
    UPDATE workflow_side_effect_outbox SET
      status = CASE
        WHEN cancelled_at IS NOT NULL THEN 'cancelled'
        ELSE $3::varchar
      END,
      next_attempt_at = CASE
        WHEN cancelled_at IS NOT NULL OR $3::varchar = 'dead_letter' THEN NULL
        ELSE CURRENT_TIMESTAMP + ($4::bigint * INTERVAL '1 millisecond')
      END,
      lease_expires_at = NULL,
      last_error = $5
    WHERE id = $1
      AND status = 'processing'
      AND attempt_count = $2
    RETURNING status
  `, [
    claim.id,
    claim.attempt_count,
    deadLetter ? 'dead_letter' : 'retry',
    delayMs,
    redactWorkflowSideEffectError(error),
  ]);
  return result.rows[0]?.status || 'stale';
}

async function runWorkflowSideEffectJobs(pool, workerOptions = {}) {
  const options = deliveryOptions(workerOptions);
  const dependencies = {
    emailService: workerOptions.emailService,
    httpClient: workerOptions.httpClient,
    lookup: workerOptions.lookup,
    smsService: workerOptions.smsService,
    webhookMaxRequestBytes: options.webhookMaxRequestBytes,
    webhookMaxResponseBytes: options.webhookMaxResponseBytes,
    webhookTimeoutMs: options.webhookTimeoutMs,
  };
  const deliver = workerOptions.deliver
    || (claim => deliverWorkflowSideEffect(claim, dependencies));
  const summary = {
    claimed: 0,
    sent: 0,
    retry: 0,
    deadLetter: 0,
    cancelled: 0,
    reconciliationRequired: 0,
    stale: 0,
  };

  summary.reconciliationRequired = await quarantineExpiredSmsAttempts(
    pool,
    workerOptions.outboxId || null
  );

  for (let index = 0; index < options.batchSize; index += 1) {
    const claim = await claimWorkflowSideEffect(
      pool,
      options.leaseSeconds,
      workerOptions.outboxId || null
    );
    if (!claim) break;
    summary.claimed += 1;
    try {
      const result = await deliver(claim);
      const persisted = await markWorkflowSideEffectSent(pool, claim, result);
      if (persisted) summary.sent += 1;
      else summary.stale += 1;
    } catch (error) {
      const outcome = await markWorkflowSideEffectFailure(pool, claim, error, options);
      if (outcome === 'dead_letter') summary.deadLetter += 1;
      else if (outcome === 'retry') summary.retry += 1;
      else if (outcome === 'cancelled') summary.cancelled += 1;
      else if (outcome === 'reconciliation_required') summary.reconciliationRequired += 1;
      else summary.stale += 1;
      logger.warn('[Workflow side-effect jobs] Delivery deferred', {
        effectType: claim.effect_type,
        outboxId: claim.id,
        outcome,
      });
    }
  }

  return summary;
}

module.exports = {
  claimWorkflowSideEffect,
  deliverWorkflowSideEffect,
  markWorkflowSideEffectFailure,
  quarantineExpiredSmsAttempts,
  redactWorkflowSideEffectError,
  runWorkflowSideEffectJobs,
  workflowSideEffectBackoffMs,
};
