/**
 * Faithful port of the retained Meta webhook receiver
 * (backend/src/routes/social/webhook.routes.js and the verification,
 * normalization, and durable batch claim from
 * backend/src/services/socialWebhookService.js). The receiver claims
 * events durably and deliberately performs no inline processing: the
 * retained design already treats inline work as best-effort, and the
 * leased worker (SocialWebhookJobsService here, the legacy scheduler's
 * worker until cutover) processes every claim and emits the agent-room
 * event through whichever runtime hosts the socket server.
 */
import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

const MESSAGE_TYPES = new Set([
  'text', 'image', 'video', 'audio', 'file', 'sticker',
]);

export class MetaWebhookNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaWebhookNotConfiguredError';
  }
}

export class MetaWebhookInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaWebhookInputError';
  }
}

export type NormalizedMetaEvent = {
  channelType: string;
  destinationId: string;
  eventKey: string;
  eventTimestamp: Date;
  externalMessageId: string;
  mediaType: string | null;
  mediaUrl: string | null;
  messageType: string;
  senderId: string;
  textContent: string | null;
};

const boundedText = (value: unknown, limit: number): string | null => {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, limit);
};

const constantTimeTextEqual = (left: unknown, right: unknown): boolean => {
  const leftDigest = crypto
    .createHash('sha256')
    .update(String(left || ''))
    .digest();
  const rightDigest = crypto
    .createHash('sha256')
    .update(String(right || ''))
    .digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
};

export function verifyMetaChallenge(values: {
  mode: unknown;
  token: unknown;
  configuredToken: string | undefined;
}): boolean {
  if (!values.configuredToken) {
    throw new MetaWebhookNotConfiguredError(
      'Meta webhook verify token is not configured',
    );
  }
  return (
    values.mode === 'subscribe' &&
    typeof values.token === 'string' &&
    constantTimeTextEqual(values.token, values.configuredToken)
  );
}

export function verifyMetaSignature(values: {
  rawBody: Buffer | undefined;
  signature: string | undefined;
  secret?: string;
}): true {
  const secret = values.secret ?? process.env.FACEBOOK_APP_SECRET;
  if (!secret) {
    throw new MetaWebhookNotConfiguredError('Meta app secret is not configured');
  }
  if (!Buffer.isBuffer(values.rawBody)) {
    throw new Error('Raw webhook body is required');
  }
  const signature = values.signature;
  if (
    typeof signature !== 'string' ||
    !/^sha256=[a-f0-9]{64}$/i.test(signature)
  ) {
    throw new Error('Invalid Meta webhook signature');
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(values.rawBody)
    .digest();
  const received = Buffer.from(signature.slice('sha256='.length), 'hex');
  if (!crypto.timingSafeEqual(expected, received)) {
    throw new Error('Invalid Meta webhook signature');
  }
  return true;
}

const safeMediaUrl = (value: unknown): string | null => {
  if (!value) return null;
  const bounded = boundedText(value, 500);
  try {
    const parsed = new URL(bounded as string);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export function normalizeMetaMessagingEvent(
  destinationId: unknown,
  event: {
    sender?: { id?: unknown };
    timestamp?: unknown;
    message?: {
      mid?: unknown;
      text?: unknown;
      sticker_id?: unknown;
      attachments?: Array<{ type?: unknown; payload?: { url?: unknown } }>;
    };
  },
  channelType: string,
): NormalizedMetaEvent {
  const senderId = event?.sender?.id;
  const message = event?.message;
  const externalMessageId = message?.mid;
  if (!['facebook', 'instagram'].includes(channelType)) {
    throw new MetaWebhookInputError('Invalid social channel type');
  }
  if (
    !destinationId ||
    typeof destinationId !== 'string' ||
    destinationId.length > 100
  ) {
    throw new MetaWebhookInputError('Invalid social destination id');
  }
  if (!senderId || typeof senderId !== 'string' || senderId.length > 100) {
    throw new MetaWebhookInputError('Invalid social sender id');
  }
  if (
    !externalMessageId ||
    typeof externalMessageId !== 'string' ||
    externalMessageId.length > 100
  ) {
    throw new MetaWebhookInputError('Invalid social message id');
  }

  const timestamp = Number(event.timestamp);
  const eventTimestamp = new Date(timestamp);
  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    Number.isNaN(eventTimestamp.getTime())
  ) {
    throw new MetaWebhookInputError('Invalid social event timestamp');
  }

  const attachment = Array.isArray(message?.attachments)
    ? message.attachments[0]
    : null;
  let messageType = (attachment?.type as string) || 'text';
  if (message?.sticker_id) messageType = 'sticker';
  if (!MESSAGE_TYPES.has(messageType)) messageType = 'file';
  const textContent = boundedText(message?.text, 10000);
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

@Injectable()
export class SocialWebhooksService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async claimMetaMessagingEvents(
    normalizedEvents: NormalizedMetaEvent[],
  ): Promise<string[]> {
    if (!Array.isArray(normalizedEvents) || normalizedEvents.length === 0) {
      return [];
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const claimed = await client.query<{ event_key: string }>(
        `INSERT INTO social_webhook_events (
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
         RETURNING event_key`,
        [
          JSON.stringify(
            normalizedEvents.map((event) => ({
              event_key: event.eventKey,
              external_message_id: event.externalMessageId,
              channel_type: event.channelType,
              destination_id: event.destinationId,
              sender_id: event.senderId,
              event_timestamp: event.eventTimestamp.toISOString(),
              message_type: event.messageType,
              text_content: event.textContent,
              media_url: event.mediaUrl,
              media_type: event.mediaType,
            })),
          ),
        ],
      );
      await client.query('COMMIT');
      return claimed.rows.map((row) => row.event_key);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
