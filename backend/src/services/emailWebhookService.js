const EVENT_CONFIG = Object.freeze({
  'email.scheduled': { emailLogStatus: 'queued', campaignStatus: 'pending' },
  'email.sent': { emailLogStatus: 'sent', campaignStatus: 'sent', sent: true },
  'email.delivered': { emailLogStatus: 'delivered', campaignStatus: 'delivered', delivered: true },
  'email.opened': { emailLogStatus: 'opened', campaignStatus: 'opened', opened: true },
  'email.clicked': { emailLogStatus: 'clicked', campaignStatus: 'clicked', clicked: true },
  'email.bounced': { emailLogStatus: 'bounced', campaignStatus: 'bounced', bounced: true },
  'email.complained': { emailLogStatus: 'unsubscribed', campaignStatus: 'complained', unsubscribed: true },
  'email.failed': { emailLogStatus: 'failed', campaignStatus: 'failed' },
  'email.suppressed': { emailLogStatus: 'failed', campaignStatus: 'failed', suppressed: true },
  'email.delivery_delayed': {},
});

const STATUS_RANK = Object.freeze({
  pending: 0,
  queued: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 5,
  complained: 5,
  failed: 5,
  unsubscribed: 5,
});

function boundedText(value, limit) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, limit);
}

function normalizeEmailWebhook(deliveryId, event) {
  if (!deliveryId || typeof deliveryId !== 'string' || deliveryId.length > 255) {
    throw new Error('Invalid webhook delivery id');
  }
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
    throw new Error('Invalid webhook event');
  }

  const externalId = event.data?.email_id;
  if (!externalId || typeof externalId !== 'string' || externalId.length > 255) {
    throw new Error('Invalid email provider id');
  }
  const eventCreatedAt = new Date(event.created_at || event.data?.created_at);
  if (Number.isNaN(eventCreatedAt.getTime())) {
    throw new Error('Invalid webhook event timestamp');
  }

  const details = {};
  if (event.data?.bounce) {
    details.bounceType = boundedText(event.data.bounce.type, 50);
    details.bounceSubType = boundedText(event.data.bounce.subType, 100);
    details.message = boundedText(event.data.bounce.message, 2000);
  }
  if (event.data?.failed?.reason) details.message = boundedText(event.data.failed.reason, 2000);
  if (event.data?.suppressed) {
    details.suppressionType = boundedText(event.data.suppressed.type, 100);
    details.message = boundedText(event.data.suppressed.message, 2000);
  }
  if (event.data?.click?.link) details.link = boundedText(event.data.click.link, 2048);

  return {
    config: EVENT_CONFIG[event.type] || null,
    deliveryId,
    details,
    eventCreatedAt,
    eventType: event.type,
    externalId,
  };
}

function normalizedEmailWebhookFromClaim(claim) {
  const eventCreatedAt = new Date(claim.event_created_at);
  if (Number.isNaN(eventCreatedAt.getTime())) throw new Error('Invalid stored email event timestamp');
  return {
    config: EVENT_CONFIG[claim.event_type] || null,
    deliveryId: claim.svix_id,
    details: claim.details && typeof claim.details === 'object' ? claim.details : {},
    eventCreatedAt,
    eventType: claim.event_type,
    externalId: claim.external_id,
  };
}

function shouldReplaceStatus(currentTimestamp, eventCreatedAt, currentStatus, nextStatus) {
  if (!currentTimestamp) return true;
  const timestampDifference = eventCreatedAt.getTime() - new Date(currentTimestamp).getTime();
  if (timestampDifference !== 0) return timestampDifference > 0;
  return (STATUS_RANK[nextStatus] ?? -1) >= (STATUS_RANK[currentStatus] ?? -1);
}

function shouldSuppressContact(eventType, details) {
  if (eventType === 'email.complained' || eventType === 'email.suppressed') return true;
  return eventType === 'email.bounced' && String(details.bounceType || '').toLowerCase() === 'permanent';
}

async function updateEmailLog(client, row, normalized) {
  if (!row || !normalized.config) return null;
  const { config, details, eventCreatedAt, eventType } = normalized;
  const nextStatus = config.emailLogStatus || row.status;
  const status = shouldReplaceStatus(row.provider_status_at, eventCreatedAt, row.status, nextStatus)
    ? nextStatus
    : row.status;
  const errorMessage = details.message || null;

  const result = await client.query(`
    UPDATE email_logs SET
      status = $2,
      provider_status_at = GREATEST(COALESCE(provider_status_at, '-infinity'::timestamptz), $3::timestamptz),
      sent_at = CASE WHEN $4 THEN COALESCE(sent_at, $3::timestamptz) ELSE sent_at END,
      delivered_at = CASE WHEN $5 THEN COALESCE(delivered_at, $3::timestamptz) ELSE delivered_at END,
      opened_at = CASE WHEN $6 THEN COALESCE(opened_at, $3::timestamptz) ELSE opened_at END,
      clicked_at = CASE WHEN $7 THEN COALESCE(clicked_at, $3::timestamptz) ELSE clicked_at END,
      bounced_at = CASE WHEN $8 THEN COALESCE(bounced_at, $3::timestamptz) ELSE bounced_at END,
      unsubscribed_at = CASE WHEN $9 THEN COALESCE(unsubscribed_at, $3::timestamptz) ELSE unsubscribed_at END,
      error_message = CASE WHEN $10::text IS NOT NULL THEN $10 ELSE error_message END,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_provider_event', $11::text)
    WHERE id = $1
    RETURNING id, organization_id, contact_id
  `, [
    row.id,
    status,
    eventCreatedAt.toISOString(),
    Boolean(config.sent),
    Boolean(config.delivered),
    Boolean(config.opened),
    Boolean(config.clicked),
    Boolean(config.bounced),
    Boolean(config.unsubscribed),
    errorMessage,
    eventType,
  ]);
  return result.rows[0] || null;
}

async function updateCampaignRecipient(client, row, normalized) {
  if (!row || !normalized.config) return null;
  const { config, details, eventCreatedAt, eventType } = normalized;
  const nextStatus = config.campaignStatus || row.status;
  const status = shouldReplaceStatus(row.provider_status_at, eventCreatedAt, row.status, nextStatus)
    ? nextStatus
    : row.status;
  const link = details.link ? JSON.stringify([details.link]) : '[]';

  const result = await client.query(`
    UPDATE campaign_recipients SET
      status = $2,
      provider_status_at = GREATEST(COALESCE(provider_status_at, '-infinity'::timestamptz), $3::timestamptz),
      sent_at = CASE WHEN $4 THEN COALESCE(sent_at, $3::timestamptz) ELSE sent_at END,
      delivered_at = CASE WHEN $5 THEN COALESCE(delivered_at, $3::timestamptz) ELSE delivered_at END,
      opened_at = CASE WHEN $6 THEN COALESCE(opened_at, $3::timestamptz) ELSE opened_at END,
      clicked_at = CASE WHEN $7 THEN COALESCE(clicked_at, $3::timestamptz) ELSE clicked_at END,
      bounced_at = CASE WHEN $8 THEN COALESCE(bounced_at, $3::timestamptz) ELSE bounced_at END,
      unsubscribed_at = CASE WHEN $9 THEN COALESCE(unsubscribed_at, $3::timestamptz) ELSE unsubscribed_at END,
      open_count = open_count + CASE WHEN $6 THEN 1 ELSE 0 END,
      click_count = click_count + CASE WHEN $7 THEN 1 ELSE 0 END,
      clicked_links = CASE WHEN $7 THEN COALESCE(clicked_links, '[]'::jsonb) || $10::jsonb ELSE clicked_links END,
      error_message = CASE WHEN $11::text IS NOT NULL THEN $11 ELSE error_message END,
      bounce_type = CASE WHEN $12::text IS NOT NULL THEN $12 ELSE bounce_type END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, organization_id, contact_id
  `, [
    row.id,
    status,
    eventCreatedAt.toISOString(),
    Boolean(config.sent),
    Boolean(config.delivered),
    Boolean(config.opened),
    Boolean(config.clicked),
    Boolean(config.bounced),
    Boolean(config.unsubscribed),
    link,
    details.message || null,
    details.bounceType || details.suppressionType || (eventType === 'email.complained' ? 'complained' : null),
  ]);
  return result.rows[0] || null;
}

async function loadEmailWebhookTargets(client, externalId) {
  const emailLogResult = await client.query(`
      SELECT id, organization_id, contact_id, status, provider_status_at
      FROM email_logs
      WHERE external_id = $1
      ORDER BY id DESC
      FOR UPDATE
    `, [externalId]);
  const campaignResult = await client.query(`
      SELECT id, organization_id, contact_id, status, provider_status_at
      FROM campaign_recipients
      WHERE external_message_id = $1
      ORDER BY id DESC
      FOR UPDATE
    `, [externalId]);
  const organizationIds = new Set([
    ...emailLogResult.rows.map(row => row.organization_id),
    ...campaignResult.rows.map(row => row.organization_id),
  ].filter(Boolean));
  return {
    campaignRecipient: campaignResult.rows[0] || null,
    emailLog: emailLogResult.rows[0] || null,
    organizationCount: organizationIds.size,
  };
}

async function markEmailWebhookPending(client, normalized, reason) {
  await client.query(`
    UPDATE email_webhook_events SET
      processing_status = 'pending',
      reconciliation_status = 'pending',
      reconciliation_reason = $2,
      reconciliation_next_attempt_at = CURRENT_TIMESTAMP,
      processed_at = NULL
    WHERE svix_id = $1
  `, [normalized.deliveryId, reason]);
  return { duplicate: false, matched: false, pending: true, reason };
}

async function applyNormalizedEmailWebhook(client, normalized, { reconciliation = false } = {}) {
  const targets = await loadEmailWebhookTargets(client, normalized.externalId);
  if (targets.organizationCount === 0) {
    return markEmailWebhookPending(client, normalized, 'unmatched');
  }
  if (targets.organizationCount > 1) {
    return markEmailWebhookPending(client, normalized, 'ambiguous');
  }

  const emailLog = await updateEmailLog(client, targets.emailLog, normalized);
  const campaignRecipient = await updateCampaignRecipient(
    client,
    targets.campaignRecipient,
    normalized
  );
  const matched = Boolean(emailLog || campaignRecipient);

  if (matched && shouldSuppressContact(normalized.eventType, normalized.details)) {
    const contactIds = [...new Set([emailLog?.contact_id, campaignRecipient?.contact_id].filter(Boolean))];
    if (contactIds.length > 0) {
      const isComplaint = normalized.eventType === 'email.complained';
      const bounceType = normalized.details.bounceType
        || normalized.details.suppressionType
        || normalized.eventType.replace('email.', '');
      await client.query(`
        UPDATE contacts SET
          email_unsubscribed = CASE WHEN $3 THEN TRUE ELSE email_unsubscribed END,
          email_unsubscribed_at = CASE
            WHEN $3 THEN COALESCE(email_unsubscribed_at, $2::timestamptz)
            ELSE email_unsubscribed_at
          END,
          email_bounced = CASE WHEN $3 THEN email_bounced ELSE TRUE END,
          email_bounced_at = CASE
            WHEN $3 THEN email_bounced_at
            ELSE COALESCE(email_bounced_at, $2::timestamptz)
          END,
          email_bounce_type = CASE WHEN $3 THEN email_bounce_type ELSE $4 END
        WHERE id = ANY($1::int[])
      `, [contactIds, normalized.eventCreatedAt.toISOString(), isComplaint, boundedText(bounceType, 50)]);
    }
  }

  await client.query(`
    UPDATE email_webhook_events SET
      processing_status = $2::varchar,
      matched_email_log_id = $3,
      matched_campaign_recipient_id = $4,
      processed_at = CASE WHEN $2::text = 'processed' THEN CURRENT_TIMESTAMP ELSE NULL END,
      reconciliation_status = CASE WHEN $5 THEN 'resolved' ELSE reconciliation_status END,
      reconciliation_reason = CASE WHEN $5 THEN NULL ELSE reconciliation_reason END,
      reconciliation_next_attempt_at = CASE WHEN $5 THEN NULL ELSE reconciliation_next_attempt_at END,
      reconciliation_lease_expires_at = CASE WHEN $5 THEN NULL ELSE reconciliation_lease_expires_at END,
      reconciliation_last_error = CASE WHEN $5 THEN NULL ELSE reconciliation_last_error END,
      reconciled_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE reconciled_at END
    WHERE svix_id = $1
  `, [
    normalized.deliveryId,
    matched ? 'processed' : 'pending',
    emailLog?.id || null,
    campaignRecipient?.id || null,
    reconciliation,
  ]);

  return { duplicate: false, matched, pending: !matched };
}

async function processEmailWebhookEvent(client, deliveryId, event) {
  const normalized = normalizeEmailWebhook(deliveryId, event);
  const claim = await client.query(`
    INSERT INTO email_webhook_events
      (svix_id, event_type, external_id, event_created_at, details)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    ON CONFLICT (svix_id) DO NOTHING
    RETURNING svix_id
  `, [
    normalized.deliveryId,
    normalized.eventType,
    normalized.externalId,
    normalized.eventCreatedAt.toISOString(),
    JSON.stringify(normalized.details),
  ]);
  if (claim.rows.length === 0) return { duplicate: true, matched: false };

  if (!normalized.config) {
    await client.query(`
      UPDATE email_webhook_events
      SET processing_status = 'ignored', processed_at = CURRENT_TIMESTAMP
      WHERE svix_id = $1
    `, [deliveryId]);
    return { duplicate: false, ignored: true, matched: false };
  }
  return applyNormalizedEmailWebhook(client, normalized);
}

async function reconcileEmailWebhookEvent(client, deliveryId) {
  const claim = await client.query(`
    SELECT *
    FROM email_webhook_events
    WHERE svix_id = $1
      AND reconciliation_status = 'processing'
    FOR UPDATE
  `, [deliveryId]);
  if (claim.rows.length === 0) throw new Error('Email reconciliation claim is unavailable');
  const normalized = normalizedEmailWebhookFromClaim(claim.rows[0]);
  const result = await applyNormalizedEmailWebhook(client, normalized, { reconciliation: true });
  if (result.pending) {
    const error = new Error('Email provider event mapping is not uniquely resolvable');
    error.code = 'RECONCILIATION_UNRESOLVED';
    throw error;
  }
  return result;
}

module.exports = {
  applyNormalizedEmailWebhook,
  EVENT_CONFIG,
  normalizeEmailWebhook,
  normalizedEmailWebhookFromClaim,
  processEmailWebhookEvent,
  reconcileEmailWebhookEvent,
  shouldSuppressContact,
};
