/**
 * Faithful port of the Meta webhook event processing and reconciliation
 * (backend/src/services/socialWebhookService.js): channel routing with
 * unmatched/ambiguous quarantine, conversation upsert, inbound message
 * insert, and terminal event marking. The column projections mirror
 * backend/src/routes/social/columns.js verbatim — keep them synced
 * while both runtimes live.
 */
import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { NormalizedMetaEvent } from './social-webhooks.service';

const SOCIAL_CONVERSATION_COLUMNS = [
  'id',
  'organization_id',
  'channel_id',
  'thread_id',
  'participant_id',
  'participant_name',
  'participant_username',
  'participant_profile_pic',
  'contact_id',
  'status',
  'assigned_to',
  'unread_count',
  'message_count',
  'last_message_text',
  'last_message_at',
  'last_message_from',
  'tags',
  'created_at',
  'updated_at',
];

const SOCIAL_MESSAGE_COLUMNS = [
  'id',
  'organization_id',
  'conversation_id',
  'channel_id',
  'external_message_id',
  'message_type',
  'text_content',
  'media_url',
  'media_type',
  'media_filename',
  'direction',
  'sender_id',
  'sender_name',
  'sent_by',
  'status',
  'error_message',
  'message_timestamp',
  'read_at',
  'created_at',
];

const socialConversationColumns = (): string =>
  SOCIAL_CONVERSATION_COLUMNS.join(', ');
const socialMessageColumns = (): string => SOCIAL_MESSAGE_COLUMNS.join(', ');

export type SocialWebhookClaimRow = {
  event_key: string;
  channel_type: string;
  destination_id: string;
  external_message_id: string;
  event_timestamp: Date | string;
  media_type: string | null;
  media_url: string | null;
  message_type: string | null;
  sender_id: string;
  text_content: string | null;
  processing_status: string;
};

export type SocialWebhookProcessResult = {
  duplicate: boolean;
  status: string;
  channel?: { id: number; organization_id: number };
  conversationId?: number;
  isNewConversation?: boolean;
  message?: Record<string, unknown>;
};

export function normalizedEventFromClaim(
  claim: SocialWebhookClaimRow,
): NormalizedMetaEvent {
  return {
    channelType: claim.channel_type,
    destinationId: claim.destination_id,
    eventKey: claim.event_key,
    eventTimestamp: new Date(claim.event_timestamp),
    externalMessageId: claim.external_message_id,
    mediaType: claim.media_type,
    mediaUrl: claim.media_url,
    messageType: claim.message_type ?? 'text',
    senderId: claim.sender_id,
    textContent: claim.text_content,
  };
}

@Injectable()
export class SocialWebhookProcessingService {
  async processMetaWebhookEventByKey(
    client: PoolClient,
    eventKey: string,
  ): Promise<SocialWebhookProcessResult> {
    const claimResult = await client.query<SocialWebhookClaimRow>(
      `SELECT * FROM social_webhook_events
       WHERE event_key = $1
       FOR UPDATE`,
      [eventKey],
    );
    const claim = claimResult.rows[0];
    if (!claim) throw new Error('Social webhook claim not found');
    if (claim.processing_status !== 'pending') {
      return { duplicate: true, status: claim.processing_status };
    }

    await client.query(
      `UPDATE social_webhook_events SET
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
       WHERE event_key = $1`,
      [eventKey],
    );
    return this.applyMetaMessagingEvent(client, claim);
  }

  async reconcileMetaWebhookEvent(
    client: PoolClient,
    eventKey: string,
  ): Promise<SocialWebhookProcessResult> {
    const claimResult = await client.query<SocialWebhookClaimRow>(
      `SELECT * FROM social_webhook_events
       WHERE event_key = $1
       FOR UPDATE`,
      [eventKey],
    );
    const claim = claimResult.rows[0];
    if (!claim) throw new Error('Social webhook claim not found');
    if (claim.processing_status === 'processed') {
      await client.query(
        `UPDATE social_webhook_events SET
           reconciliation_status = 'resolved',
           reconciliation_lease_expires_at = NULL,
           reconciliation_last_error = NULL
         WHERE event_key = $1`,
        [eventKey],
      );
      return { duplicate: true, status: 'processed' };
    }
    if (!['unmatched', 'ambiguous'].includes(claim.processing_status)) {
      throw new Error('Social webhook claim is not reconcilable');
    }
    if (!claim.message_type) {
      throw new Error('Social webhook replay evidence is unavailable');
    }

    const result = await this.applyMetaMessagingEvent(client, claim);
    if (result.status !== 'processed') {
      const error = new Error(
        `Social channel mapping remains ${result.status}`,
      );
      (error as Error & { code?: string }).code = 'SOCIAL_MAPPING_UNRESOLVED';
      throw error;
    }
    return result;
  }

  private async applyMetaMessagingEvent(
    client: PoolClient,
    claim: SocialWebhookClaimRow,
  ): Promise<SocialWebhookProcessResult> {
    const normalized = normalizedEventFromClaim(claim);
    const identityColumn =
      normalized.channelType === 'instagram'
        ? 'instagram_business_account_id'
        : 'page_id';
    const channelResult = await client.query<{
      id: number;
      organization_id: number;
    }>(
      `SELECT id, organization_id
       FROM social_channels
       WHERE channel_type = $1
         AND ${identityColumn} = $2
         AND is_connected = TRUE
         AND is_active = TRUE
       ORDER BY id
       FOR UPDATE`,
      [normalized.channelType, normalized.destinationId],
    );

    if (channelResult.rows.length === 0) {
      return this.markUnroutable(client, normalized.eventKey, 'unmatched');
    }
    if (channelResult.rows.length > 1) {
      return this.markUnroutable(client, normalized.eventKey, 'ambiguous');
    }

    const channel = channelResult.rows[0];
    const preview = (
      normalized.textContent || `[${normalized.messageType}]`
    ).slice(0, 100);
    const conversationResult = await client.query<
      Record<string, unknown> & {
        id: number;
        participant_name: string | null;
        is_new_conversation: boolean;
      }
    >(
      `INSERT INTO social_conversations (
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
       RETURNING ${socialConversationColumns()}, (xmax = 0) AS is_new_conversation`,
      [
        channel.organization_id,
        channel.id,
        normalized.senderId,
        preview,
        normalized.eventTimestamp.toISOString(),
      ],
    );
    const conversation = conversationResult.rows[0];

    const messageResult = await client.query<Record<string, unknown> & { id: number }>(
      `INSERT INTO social_messages (
         organization_id, conversation_id, channel_id, external_message_id,
         message_type, text_content, media_url, media_type,
         direction, sender_id, sender_name, status, message_timestamp
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'inbound', $9, $10, 'delivered', $11)
       RETURNING ${socialMessageColumns()}`,
      [
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
      ],
    );
    const socialMessage = messageResult.rows[0];

    await client.query(
      `UPDATE social_webhook_events SET
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
       WHERE event_key = $1`,
      [normalized.eventKey, channel.id, socialMessage.id],
    );

    return {
      channel,
      conversationId: conversation.id,
      duplicate: false,
      isNewConversation: conversation.is_new_conversation,
      message: socialMessage,
      status: 'processed',
    };
  }

  private async markUnroutable(
    client: PoolClient,
    eventKey: string,
    status: string,
  ): Promise<SocialWebhookProcessResult> {
    await client.query(
      `UPDATE social_webhook_events
       SET processing_status = $2::varchar,
           work_status = 'completed',
           work_lease_expires_at = NULL,
           work_last_error = NULL,
           reconciliation_status = 'pending',
           reconciliation_next_attempt_at = CURRENT_TIMESTAMP,
           reconciliation_lease_expires_at = NULL,
           reconciliation_last_error = NULL,
           processed_at = CURRENT_TIMESTAMP
       WHERE event_key = $1`,
      [eventKey, status],
    );
    return { duplicate: false, status };
  }
}
