const crypto = require('crypto');
const { socialConversationColumns, socialMessageColumns } = require('../routes/social/columns');

const MESSAGE_TYPES = new Set(['text', 'image', 'video', 'audio', 'file', 'sticker']);

function boundedText(value, limit) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, limit);
}

function constantTimeTextEqual(left, right) {
  const leftDigest = crypto.createHash('sha256').update(String(left || '')).digest();
  const rightDigest = crypto.createHash('sha256').update(String(right || '')).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function verifyMetaChallenge({ mode, token, configuredToken }) {
  if (!configuredToken) {
    const error = new Error('Meta webhook verify token is not configured');
    error.code = 'WEBHOOK_NOT_CONFIGURED';
    throw error;
  }
  return mode === 'subscribe' && typeof token === 'string'
    && constantTimeTextEqual(token, configuredToken);
}

function verifyMetaSignature({ rawBody, signature, secret = process.env.FACEBOOK_APP_SECRET }) {
  if (!secret) {
    const error = new Error('Meta app secret is not configured');
    error.code = 'WEBHOOK_NOT_CONFIGURED';
    throw error;
  }
  if (!Buffer.isBuffer(rawBody)) throw new Error('Raw webhook body is required');
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    throw new Error('Invalid Meta webhook signature');
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.slice('sha256='.length), 'hex');
  if (!crypto.timingSafeEqual(expected, received)) {
    throw new Error('Invalid Meta webhook signature');
  }
  return true;
}

function safeMediaUrl(value) {
  if (!value) return null;
  const bounded = boundedText(value, 500);
  try {
    const parsed = new URL(bounded);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeMetaMessagingEvent(destinationId, event, channelType) {
  const senderId = event?.sender?.id;
  const message = event?.message;
  const externalMessageId = message?.mid;
  if (!['facebook', 'instagram'].includes(channelType)) throw new Error('Invalid social channel type');
  if (!destinationId || typeof destinationId !== 'string' || destinationId.length > 100) {
    throw new Error('Invalid social destination id');
  }
  if (!senderId || typeof senderId !== 'string' || senderId.length > 100) {
    throw new Error('Invalid social sender id');
  }
  if (!externalMessageId || typeof externalMessageId !== 'string' || externalMessageId.length > 100) {
    throw new Error('Invalid social message id');
  }

  const timestamp = Number(event.timestamp);
  const eventTimestamp = new Date(timestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0 || Number.isNaN(eventTimestamp.getTime())) {
    throw new Error('Invalid social event timestamp');
  }

  const attachment = Array.isArray(message.attachments) ? message.attachments[0] : null;
  let messageType = attachment?.type || 'text';
  if (message.sticker_id) messageType = 'sticker';
  if (!MESSAGE_TYPES.has(messageType)) messageType = 'file';
  const textContent = boundedText(message.text, 10000);
  const mediaUrl = safeMediaUrl(attachment?.payload?.url);

  return {
    channelType,
    destinationId,
    eventKey: `${channelType}:${externalMessageId}`,
    eventTimestamp,
    externalMessageId,
    mediaType: boundedText(attachment?.type, 50),
    mediaUrl,
    messageType,
    senderId,
    textContent,
  };
}

function serializeNormalizedEvent(normalized) {
  return {
    channelType: normalized.channelType,
    destinationId: normalized.destinationId,
    eventKey: normalized.eventKey,
    eventTimestamp: normalized.eventTimestamp.toISOString(),
    externalMessageId: normalized.externalMessageId,
    mediaType: normalized.mediaType,
    mediaUrl: normalized.mediaUrl,
    messageType: normalized.messageType,
    senderId: normalized.senderId,
    textContent: normalized.textContent,
  };
}

function normalizedEventFromClaim(claim) {
  return {
    channelType: claim.channel_type,
    destinationId: claim.destination_id,
    eventKey: claim.event_key,
    eventTimestamp: new Date(claim.event_timestamp),
    externalMessageId: claim.external_message_id,
    mediaType: claim.media_type,
    mediaUrl: claim.media_url,
    messageType: claim.message_type,
    senderId: claim.sender_id,
    textContent: claim.text_content,
  };
}

async function claimMetaMessagingEvents(client, normalizedEvents) {
  if (!Array.isArray(normalizedEvents) || normalizedEvents.length === 0) return [];
  const snapshots = normalizedEvents.map(serializeNormalizedEvent);
  const claimed = await client.query(`
    INSERT INTO social_webhook_events (
      event_key, event_type, external_message_id, channel_type,
      destination_id, sender_id, event_timestamp,
      message_type, text_content, media_url, media_type,
      processing_status, work_status, reconciliation_status
    )
    SELECT
      event.event_key, 'messaging', event.external_message_id, event.channel_type,
      event.destination_id, event.sender_id, event.event_timestamp,
      event.message_type, event.text_content, event.media_url, event.media_type,
      'pending', 'queued', 'not_required'
    FROM jsonb_to_recordset($1::jsonb) AS event(
      event_key VARCHAR(255),
      external_message_id VARCHAR(100),
      channel_type VARCHAR(20),
      destination_id VARCHAR(100),
      sender_id VARCHAR(100),
      event_timestamp TIMESTAMP WITH TIME ZONE,
      message_type VARCHAR(20),
      text_content TEXT,
      media_url TEXT,
      media_type VARCHAR(50)
    )
    ON CONFLICT (event_key) DO NOTHING
    RETURNING event_key
  `, [JSON.stringify(snapshots.map(snapshot => ({
    event_key: snapshot.eventKey,
    external_message_id: snapshot.externalMessageId,
    channel_type: snapshot.channelType,
    destination_id: snapshot.destinationId,
    sender_id: snapshot.senderId,
    event_timestamp: snapshot.eventTimestamp,
    message_type: snapshot.messageType,
    text_content: snapshot.textContent,
    media_url: snapshot.mediaUrl,
    media_type: snapshot.mediaType,
  })))]);
  return claimed.rows.map(row => row.event_key);
}

async function markUnroutable(client, eventKey, status) {
  await client.query(`
    UPDATE social_webhook_events
    SET processing_status = $2::varchar,
        work_status = 'completed',
        work_lease_expires_at = NULL,
        work_last_error = NULL,
        reconciliation_status = 'pending',
        reconciliation_next_attempt_at = CURRENT_TIMESTAMP,
        reconciliation_lease_expires_at = NULL,
        reconciliation_last_error = NULL,
        processed_at = CURRENT_TIMESTAMP
    WHERE event_key = $1
  `, [eventKey, status]);
  return { duplicate: false, status };
}

async function applyMetaMessagingEvent(client, claim) {
  const normalized = normalizedEventFromClaim(claim);
  const identityColumn = normalized.channelType === 'instagram'
    ? 'instagram_business_account_id'
    : 'page_id';
  const channelResult = await client.query(`
    SELECT id, organization_id
    FROM social_channels
    WHERE channel_type = $1
      AND ${identityColumn} = $2
      AND is_connected = TRUE
      AND is_active = TRUE
    ORDER BY id
    FOR UPDATE
  `, [normalized.channelType, normalized.destinationId]);

  if (channelResult.rows.length === 0) {
    return markUnroutable(client, normalized.eventKey, 'unmatched');
  }
  if (channelResult.rows.length > 1) {
    return markUnroutable(client, normalized.eventKey, 'ambiguous');
  }

  const channel = channelResult.rows[0];
  const preview = (normalized.textContent || `[${normalized.messageType}]`).slice(0, 100);
  const conversationResult = await client.query(`
    INSERT INTO social_conversations (
      organization_id, channel_id, participant_id, participant_name,
      status, unread_count, message_count, last_message_text,
      last_message_at, last_message_from
    ) VALUES ($1, $2, $3, 'Unknown', 'open', 1, 1, $4, $5, 'contact')
    ON CONFLICT (channel_id, participant_id) DO UPDATE SET
      unread_count = social_conversations.unread_count + 1,
      message_count = social_conversations.message_count + 1,
      last_message_text = EXCLUDED.last_message_text,
      last_message_at = EXCLUDED.last_message_at,
      last_message_from = 'contact',
      updated_at = CURRENT_TIMESTAMP
    RETURNING ${socialConversationColumns()}, (xmax = 0) AS is_new_conversation
  `, [
    channel.organization_id,
    channel.id,
    normalized.senderId,
    preview,
    normalized.eventTimestamp.toISOString(),
  ]);
  const conversation = conversationResult.rows[0];

  const messageResult = await client.query(`
    INSERT INTO social_messages (
      organization_id, conversation_id, channel_id, external_message_id,
      message_type, text_content, media_url, media_type,
      direction, sender_id, sender_name, status, message_timestamp
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'inbound', $9, $10, 'delivered', $11)
    RETURNING ${socialMessageColumns()}
  `, [
    channel.organization_id,
    conversation.id,
    channel.id,
    normalized.externalMessageId,
    normalized.messageType,
    normalized.textContent,
    normalized.mediaUrl,
    normalized.mediaType,
    normalized.senderId,
    conversation.participant_name || 'Unknown',
    normalized.eventTimestamp.toISOString(),
  ]);
  const socialMessage = messageResult.rows[0];

  await client.query(`
    UPDATE social_webhook_events SET
      processing_status = 'processed',
      matched_channel_id = $2,
      social_message_id = $3,
      work_status = 'completed',
      work_lease_expires_at = NULL,
      work_last_error = NULL,
      reconciliation_status = CASE
        WHEN processing_status IN ('unmatched', 'ambiguous') THEN 'resolved'
        ELSE 'not_required'
      END,
      reconciliation_next_attempt_at = NULL,
      reconciliation_lease_expires_at = NULL,
      reconciliation_last_error = NULL,
      processed_at = CURRENT_TIMESTAMP
    WHERE event_key = $1
  `, [normalized.eventKey, channel.id, socialMessage.id]);

  return {
    channel,
    conversationId: conversation.id,
    duplicate: false,
    isNewConversation: conversation.is_new_conversation,
    message: socialMessage,
    status: 'processed',
  };
}

async function processMetaWebhookEventByKey(client, eventKey) {
  const claimResult = await client.query(`
    SELECT * FROM social_webhook_events
    WHERE event_key = $1
    FOR UPDATE
  `, [eventKey]);
  const claim = claimResult.rows[0];
  if (!claim) throw new Error('Social webhook claim not found');
  if (claim.processing_status !== 'pending') {
    return { duplicate: true, status: claim.processing_status };
  }

  await client.query(`
    UPDATE social_webhook_events SET
      work_status = 'processing',
      work_attempt_count = CASE
        WHEN work_status = 'processing' THEN work_attempt_count
        ELSE work_attempt_count + 1
      END,
      work_lease_expires_at = COALESCE(
        work_lease_expires_at,
        CURRENT_TIMESTAMP + INTERVAL '5 minutes'
      ),
      work_last_error = NULL
    WHERE event_key = $1
  `, [eventKey]);
  return applyMetaMessagingEvent(client, claim);
}

async function reconcileMetaWebhookEvent(client, eventKey) {
  const claimResult = await client.query(`
    SELECT * FROM social_webhook_events
    WHERE event_key = $1
    FOR UPDATE
  `, [eventKey]);
  const claim = claimResult.rows[0];
  if (!claim) throw new Error('Social webhook claim not found');
  if (claim.processing_status === 'processed') {
    await client.query(`
      UPDATE social_webhook_events SET
        reconciliation_status = 'resolved',
        reconciliation_lease_expires_at = NULL,
        reconciliation_last_error = NULL
      WHERE event_key = $1
    `, [eventKey]);
    return { duplicate: true, status: 'processed' };
  }
  if (!['unmatched', 'ambiguous'].includes(claim.processing_status)) {
    throw new Error('Social webhook claim is not reconcilable');
  }
  if (!claim.message_type) throw new Error('Social webhook replay evidence is unavailable');

  const result = await applyMetaMessagingEvent(client, claim);
  if (result.status !== 'processed') {
    const error = new Error(`Social channel mapping remains ${result.status}`);
    error.code = 'SOCIAL_MAPPING_UNRESOLVED';
    throw error;
  }
  return result;
}

async function processMetaMessagingEvent(client, normalized) {
  const claimedEventKeys = await claimMetaMessagingEvents(client, [normalized]);
  if (claimedEventKeys.length === 0) return { duplicate: true, status: 'duplicate' };
  return processMetaWebhookEventByKey(client, normalized.eventKey);
}

module.exports = {
  claimMetaMessagingEvents,
  normalizeMetaMessagingEvent,
  processMetaMessagingEvent,
  processMetaWebhookEventByKey,
  reconcileMetaWebhookEvent,
  verifyMetaChallenge,
  verifyMetaSignature,
};
