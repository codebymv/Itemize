import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  mirrorSocialMessageToInbox,
  syncSocialMessageDeliveryToInbox,
} from './social-inbox-bridge';

export type SocialChannelRow = {
  id: number;
  organization_id: number;
  channel_type: string;
  external_id: string;
  name: string;
  username: string | null;
  profile_picture_url: string | null;
  page_id: string | null;
  instagram_business_account_id: string | null;
  permissions: string[] | null;
  is_active: boolean;
  is_connected: boolean;
  connection_error: string | null;
  last_synced_at: Date | null;
  webhook_verified: boolean;
  created_by: number | null;
  created_by_name: string | null;
  created_at: Date;
  updated_at: Date;
};

export type SocialConversationRow = {
  id: number;
  organization_id: number;
  channel_id: number;
  thread_id: string | null;
  participant_id: string;
  participant_name: string | null;
  participant_username: string | null;
  participant_profile_pic: string | null;
  contact_id: number | null;
  status: string;
  assigned_to: number | null;
  assigned_to_name: string | null;
  unread_count: number;
  message_count: number;
  last_message_text: string | null;
  last_message_at: Date | null;
  last_message_from: string | null;
  tags: string[] | null;
  channel_type: string;
  channel_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  created_at: Date;
  updated_at: Date;
};

export type SocialMessageRow = {
  id: number;
  organization_id: number;
  conversation_id: number;
  channel_id: number;
  external_message_id: string | null;
  message_type: string;
  text_content: string | null;
  media_url: string | null;
  media_type: string | null;
  media_filename: string | null;
  direction: string;
  sender_id: string | null;
  sender_name: string | null;
  sent_by: number | null;
  sent_by_name: string | null;
  status: string;
  error_message: string | null;
  message_timestamp: Date;
  read_at: Date | null;
  created_at: Date;
};

export type SocialConversationFilters = {
  channelId?: number;
  channelType?: string;
  status?: string;
  assignedTo?: number;
  page: number;
  limit: number;
};

export type SocialConversationUpdate = Partial<{
  status: string;
  assignedTo: number | null;
  contactId: number | null;
  tags: string[];
}>;

export type SocialAnalyticsRows = {
  channels: Array<{
    channel_type: string;
    conversation_count: number;
    message_count: number;
    inbound_count: number;
    outbound_count: number;
  }>;
  averageResponseMinutes: number | null;
  messagesOverTime: Array<{ date: Date; inbound: number; outbound: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
};

export type SocialDeliveryJobRow = {
  id: number;
  organization_id: number;
  conversation_id: number;
  channel_id: number;
  social_message_id: number;
  requested_by_user_id: number | null;
  idempotency_key: string;
  request_fingerprint: string;
  status: string;
  attempt_count: number;
  provider_message_id: string | null;
  last_error: string | null;
  created_at: Date;
};

export type SocialDeliveryClaim = SocialDeliveryJobRow & {
  participant_id: string;
  channel_type: string;
  page_id: string | null;
  page_access_token: string | null;
  is_connected: boolean;
  text_content: string;
};

export type EnqueueSocialDeliveryOutcome =
  | {
      kind: 'created' | 'replayed';
      job: SocialDeliveryJobRow;
      message: SocialMessageRow;
    }
  | { kind: 'conversation_not_found' }
  | { kind: 'channel_unavailable' }
  | { kind: 'key_conflict' };

export type UpdateSocialConversationOutcome =
  | { kind: 'ok'; row: SocialConversationRow }
  | { kind: 'conversation_not_found' }
  | { kind: 'assignee_not_found' }
  | { kind: 'contact_not_found' };

const channelSelection = `
  sc.id, sc.organization_id, sc.channel_type, sc.external_id, sc.name,
  sc.username, sc.profile_picture_url, sc.page_id,
  sc.instagram_business_account_id, sc.permissions, sc.is_active,
  sc.is_connected, sc.connection_error, sc.last_synced_at,
  sc.webhook_verified, sc.created_by, creator.name AS created_by_name,
  sc.created_at, sc.updated_at`;

const conversationSelection = `
  conversation.id, conversation.organization_id, conversation.channel_id,
  conversation.thread_id, conversation.participant_id,
  conversation.participant_name, conversation.participant_username,
  conversation.participant_profile_pic, conversation.contact_id,
  conversation.status, conversation.assigned_to,
  assignee.name AS assigned_to_name, conversation.unread_count,
  conversation.message_count, conversation.last_message_text,
  conversation.last_message_at, conversation.last_message_from,
  conversation.tags, channel.channel_type, channel.name AS channel_name,
  contact.first_name AS contact_first_name,
  contact.last_name AS contact_last_name, contact.email AS contact_email,
  conversation.created_at, conversation.updated_at`;

const messageSelection = `
  message.id, message.organization_id, message.conversation_id,
  message.channel_id, message.external_message_id, message.message_type,
  message.text_content, message.media_url, message.media_type,
  message.media_filename, message.direction, message.sender_id,
  message.sender_name, message.sent_by, sender.name AS sent_by_name,
  message.status, message.error_message, message.message_timestamp,
  message.read_at, message.created_at`;

const jobSelection = `
  id, organization_id, conversation_id, channel_id, social_message_id,
  requested_by_user_id, idempotency_key, request_fingerprint, status,
  attempt_count, provider_message_id, last_error, created_at`;

@Injectable()
export class SocialRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listChannels(
    organizationId: number,
    channelType?: string,
  ): Promise<SocialChannelRow[]> {
    const result = await this.pool.query<SocialChannelRow>(
      `SELECT ${channelSelection}
       FROM social_channels sc
       LEFT JOIN organization_members creator_member
         ON creator_member.organization_id=sc.organization_id
        AND creator_member.user_id=sc.created_by
       LEFT JOIN users creator ON creator.id=creator_member.user_id
       WHERE sc.organization_id=$1
         AND ($2::varchar IS NULL OR sc.channel_type=$2)
       ORDER BY sc.channel_type, sc.name, sc.id`,
      [organizationId, channelType ?? null],
    );
    return result.rows;
  }

  async disconnectChannel(
    organizationId: number,
    channelId: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE social_channels
       SET is_connected=FALSE, page_access_token=NULL,
           user_access_token=NULL, updated_at=CURRENT_TIMESTAMP
       WHERE organization_id=$1 AND id=$2`,
      [organizationId, channelId],
    );
    return result.rowCount === 1;
  }

  async listConversations(
    organizationId: number,
    filters: SocialConversationFilters,
  ): Promise<{ rows: SocialConversationRow[]; total: number }> {
    const clauses = [
      'conversation.organization_id=$1',
      'channel.organization_id=conversation.organization_id',
    ];
    const params: unknown[] = [organizationId];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      clauses.push(`${sql} $${params.length}`);
    };
    if (filters.channelId !== undefined) add('conversation.channel_id=', filters.channelId);
    if (filters.channelType !== undefined) add('channel.channel_type=', filters.channelType);
    if (filters.status !== undefined) add('conversation.status=', filters.status);
    if (filters.assignedTo !== undefined) add('conversation.assigned_to=', filters.assignedTo);
    const where = clauses.join(' AND ');
    const total = await this.pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM social_conversations conversation
       JOIN social_channels channel ON channel.id=conversation.channel_id
       WHERE ${where}`,
      params,
    );
    params.push(filters.limit, (filters.page - 1) * filters.limit);
    const result = await this.pool.query<SocialConversationRow>(
      `SELECT ${conversationSelection}
       FROM social_conversations conversation
       JOIN social_channels channel ON channel.id=conversation.channel_id
       LEFT JOIN contacts contact
         ON contact.id=conversation.contact_id
        AND contact.organization_id=conversation.organization_id
       LEFT JOIN organization_members assignee_member
         ON assignee_member.organization_id=conversation.organization_id
        AND assignee_member.user_id=conversation.assigned_to
       LEFT JOIN users assignee ON assignee.id=assignee_member.user_id
       WHERE ${where}
       ORDER BY conversation.last_message_at DESC NULLS LAST,
                conversation.created_at DESC, conversation.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      rows: result.rows,
      total: Number(total.rows[0]?.count ?? 0),
    };
  }

  async findConversation(
    organizationId: number,
    conversationId: number,
  ): Promise<{
    conversation: SocialConversationRow;
    messages: SocialMessageRow[];
  } | null> {
    const client = await this.pool.connect();
    try {
      const conversation = await this.selectConversation(
        client,
        organizationId,
        conversationId,
      );
      if (!conversation) return null;
      const messages = await client.query<SocialMessageRow>(
        `SELECT ${messageSelection}
         FROM social_messages message
         JOIN social_conversations owned
           ON owned.id=message.conversation_id
          AND owned.organization_id=message.organization_id
         LEFT JOIN organization_members sender_member
           ON sender_member.organization_id=message.organization_id
          AND sender_member.user_id=message.sent_by
         LEFT JOIN users sender ON sender.id=sender_member.user_id
         WHERE message.organization_id=$1 AND message.conversation_id=$2
           AND owned.id=$2
         ORDER BY message.message_timestamp, message.id`,
        [organizationId, conversationId],
      );
      return { conversation, messages: messages.rows };
    } finally {
      client.release();
    }
  }

  async openConversation(
    organizationId: number,
    conversationId: number,
  ): Promise<{
    conversation: SocialConversationRow;
    messages: SocialMessageRow[];
  } | null> {
    return this.transaction(async (client) => {
      const owned = await client.query(
        `SELECT id FROM social_conversations
         WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
        [organizationId, conversationId],
      );
      if (owned.rowCount !== 1) return null;
      await client.query(
        `UPDATE social_conversations
         SET unread_count=0, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, conversationId],
      );
      const conversation = await this.selectConversation(
        client,
        organizationId,
        conversationId,
      );
      if (!conversation) throw new Error('Opened social conversation disappeared');
      const messages = await client.query<SocialMessageRow>(
        `SELECT ${messageSelection}
         FROM social_messages message
         LEFT JOIN organization_members sender_member
           ON sender_member.organization_id=message.organization_id
          AND sender_member.user_id=message.sent_by
         LEFT JOIN users sender ON sender.id=sender_member.user_id
         WHERE message.organization_id=$1 AND message.conversation_id=$2
         ORDER BY message.message_timestamp, message.id`,
        [organizationId, conversationId],
      );
      return { conversation, messages: messages.rows };
    });
  }

  async updateConversation(
    organizationId: number,
    conversationId: number,
    values: SocialConversationUpdate,
  ): Promise<UpdateSocialConversationOutcome> {
    return this.transaction(async (client) => {
      const owned = await client.query(
        `SELECT id FROM social_conversations
         WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
        [organizationId, conversationId],
      );
      if (owned.rowCount !== 1) return { kind: 'conversation_not_found' };
      if (values.assignedTo !== undefined && values.assignedTo !== null) {
        const member = await client.query(
          `SELECT 1 FROM organization_members
           WHERE organization_id=$1 AND user_id=$2`,
          [organizationId, values.assignedTo],
        );
        if (member.rowCount !== 1) return { kind: 'assignee_not_found' };
      }
      if (values.contactId !== undefined && values.contactId !== null) {
        const contact = await client.query(
          'SELECT 1 FROM contacts WHERE organization_id=$1 AND id=$2',
          [organizationId, values.contactId],
        );
        if (contact.rowCount !== 1) return { kind: 'contact_not_found' };
      }
      const assignments = ['updated_at=CURRENT_TIMESTAMP'];
      const params: unknown[] = [organizationId, conversationId];
      const add = (column: string, value: unknown) => {
        params.push(value);
        assignments.push(`${column}=$${params.length}`);
      };
      if (values.status !== undefined) add('status', values.status);
      if (values.assignedTo !== undefined) add('assigned_to', values.assignedTo);
      if (values.contactId !== undefined) add('contact_id', values.contactId);
      if (values.tags !== undefined) add('tags', values.tags);
      await client.query(
        `UPDATE social_conversations SET ${assignments.join(', ')}
         WHERE organization_id=$1 AND id=$2`,
        params,
      );
      const row = await this.selectConversation(client, organizationId, conversationId);
      if (!row) throw new Error('Updated social conversation disappeared');
      return { kind: 'ok', row };
    });
  }

  async analytics(
    organizationId: number,
    period: number,
  ): Promise<SocialAnalyticsRows> {
    const interval = `${period} days`;
    const client = await this.pool.connect();
    try {
      const channels = await client.query<SocialAnalyticsRows['channels'][number]>(
        `SELECT channel.channel_type,
                COUNT(DISTINCT conversation.id)::int AS conversation_count,
                COUNT(message.id)::int AS message_count,
                COUNT(message.id) FILTER (WHERE message.direction='inbound')::int
                  AS inbound_count,
                COUNT(message.id) FILTER (WHERE message.direction='outbound')::int
                  AS outbound_count
         FROM social_channels channel
         LEFT JOIN social_conversations conversation
           ON conversation.channel_id=channel.id
          AND conversation.organization_id=channel.organization_id
         LEFT JOIN social_messages message
           ON message.conversation_id=conversation.id
          AND message.organization_id=channel.organization_id
          AND message.created_at >= CURRENT_TIMESTAMP - $2::interval
         WHERE channel.organization_id=$1 AND channel.is_connected=TRUE
         GROUP BY channel.channel_type
         ORDER BY channel.channel_type`,
        [organizationId, interval],
      );
      const response = await client.query<{ average: number | null }>(
        `SELECT AVG(EXTRACT(EPOCH FROM (
                    outbound.message_timestamp-inbound.message_timestamp
                  )) / 60)::float AS average
         FROM social_messages inbound
         JOIN LATERAL (
           SELECT candidate.message_timestamp
           FROM social_messages candidate
           WHERE candidate.organization_id=inbound.organization_id
             AND candidate.conversation_id=inbound.conversation_id
             AND candidate.direction='outbound'
             AND candidate.message_timestamp > inbound.message_timestamp
           ORDER BY candidate.message_timestamp, candidate.id
           LIMIT 1
         ) outbound ON TRUE
         WHERE inbound.organization_id=$1
           AND inbound.direction='inbound'
           AND inbound.created_at >= CURRENT_TIMESTAMP - $2::interval`,
        [organizationId, interval],
      );
      const messages = await client.query<SocialAnalyticsRows['messagesOverTime'][number]>(
        `SELECT DATE_TRUNC('day', message_timestamp) AS date,
                COUNT(*) FILTER (WHERE direction='inbound')::int AS inbound,
                COUNT(*) FILTER (WHERE direction='outbound')::int AS outbound
         FROM social_messages
         WHERE organization_id=$1
           AND created_at >= CURRENT_TIMESTAMP - $2::interval
         GROUP BY DATE_TRUNC('day', message_timestamp)
         ORDER BY date`,
        [organizationId, interval],
      );
      const statuses = await client.query<SocialAnalyticsRows['statusDistribution'][number]>(
        `SELECT status, COUNT(*)::int AS count
         FROM social_conversations
         WHERE organization_id=$1
         GROUP BY status
         ORDER BY status`,
        [organizationId],
      );
      return {
        channels: channels.rows,
        averageResponseMinutes:
          response.rows[0]?.average === null ||
          response.rows[0]?.average === undefined
            ? null
            : Number(response.rows[0].average),
        messagesOverTime: messages.rows,
        statusDistribution: statuses.rows,
      };
    } finally {
      client.release();
    }
  }

  async enqueueDelivery(input: {
    organizationId: number;
    userId: number;
    conversationId: number;
    text: string;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<EnqueueSocialDeliveryOutcome> {
    return this.transaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock($1::int, hashtext($2))',
        [input.organizationId, `social-message:${input.idempotencyKey}`],
      );
      const existing = await client.query<SocialDeliveryJobRow>(
        `SELECT ${jobSelection} FROM social_message_delivery_jobs
         WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE`,
        [input.organizationId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].request_fingerprint !== input.fingerprint) {
          return { kind: 'key_conflict' };
        }
        const message = await this.selectMessage(
          client,
          input.organizationId,
          Number(existing.rows[0].social_message_id),
        );
        if (!message) throw new Error('Social delivery message disappeared');
        return { kind: 'replayed', job: existing.rows[0], message };
      }
      const target = await client.query<{
        channel_id: number;
        is_connected: boolean;
        channel_type: string;
        page_id: string | null;
        page_access_token: string | null;
      }>(
        `SELECT conversation.channel_id, channel.is_connected,
                channel.channel_type, channel.page_id, channel.page_access_token
         FROM social_conversations conversation
         JOIN social_channels channel
           ON channel.id=conversation.channel_id
          AND channel.organization_id=conversation.organization_id
         WHERE conversation.organization_id=$1 AND conversation.id=$2
         FOR UPDATE OF conversation`,
        [input.organizationId, input.conversationId],
      );
      if (!target.rows[0]) return { kind: 'conversation_not_found' };
      const channel = target.rows[0];
      if (
        !channel.is_connected ||
        !['facebook', 'instagram'].includes(channel.channel_type) ||
        !channel.page_id ||
        !channel.page_access_token
      ) {
        return { kind: 'channel_unavailable' };
      }
      const insertedMessage = await client.query<{ id: number }>(
        `INSERT INTO social_messages (
           organization_id, conversation_id, channel_id, message_type,
           text_content, direction, sent_by, status
         ) VALUES ($1,$2,$3,'text',$4,'outbound',$5,'pending')
         RETURNING id`,
        [
          input.organizationId,
          input.conversationId,
          channel.channel_id,
          input.text,
          input.userId,
        ],
      );
      const job = await client.query<SocialDeliveryJobRow>(
        `INSERT INTO social_message_delivery_jobs (
           organization_id, conversation_id, channel_id, social_message_id,
           requested_by_user_id, idempotency_key, request_fingerprint
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING ${jobSelection}`,
        [
          input.organizationId,
          input.conversationId,
          channel.channel_id,
          insertedMessage.rows[0].id,
          input.userId,
          input.idempotencyKey,
          input.fingerprint,
        ],
      );
      await mirrorSocialMessageToInbox(
        client,
        input.organizationId,
        insertedMessage.rows[0].id,
      );
      const message = await this.selectMessage(
        client,
        input.organizationId,
        insertedMessage.rows[0].id,
      );
      if (!message) throw new Error('Queued social message disappeared');
      return { kind: 'created', job: job.rows[0], message };
    });
  }

  async dueDeliveryIds(
    limit: number,
  ): Promise<Array<{ id: number; organizationId: number }>> {
    await this.recoverExpiredClaims();
    const result = await this.pool.query<{ id: number; organization_id: number }>(
      `SELECT id, organization_id
       FROM social_message_delivery_jobs
       WHERE status IN ('queued', 'retry')
         AND next_attempt_at <= CURRENT_TIMESTAMP AND attempt_count < 5
       ORDER BY next_attempt_at, id LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      organizationId: Number(row.organization_id),
    }));
  }

  async claimDelivery(
    organizationId: number,
    jobId: number,
  ): Promise<SocialDeliveryClaim | null> {
    return this.transaction(async (client) => {
      const claimed = await client.query<SocialDeliveryJobRow>(
        `UPDATE social_message_delivery_jobs
         SET status='processing', attempt_count=attempt_count+1,
             lease_expires_at=CURRENT_TIMESTAMP + INTERVAL '2 minutes',
             claimed_by=$3, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2
           AND status IN ('queued', 'retry')
           AND next_attempt_at <= CURRENT_TIMESTAMP
         RETURNING ${jobSelection}`,
        [organizationId, jobId, randomUUID()],
      );
      if (!claimed.rows[0]) return null;
      const details = await client.query<SocialDeliveryClaim>(
        `SELECT job.*, conversation.participant_id, channel.channel_type,
                channel.page_id, channel.page_access_token,
                channel.is_connected, message.text_content
         FROM social_message_delivery_jobs job
         JOIN social_conversations conversation
           ON conversation.id=job.conversation_id
          AND conversation.organization_id=job.organization_id
         JOIN social_channels channel
           ON channel.id=job.channel_id
          AND channel.organization_id=job.organization_id
         JOIN social_messages message
           ON message.id=job.social_message_id
          AND message.organization_id=job.organization_id
         WHERE job.organization_id=$1 AND job.id=$2`,
        [organizationId, jobId],
      );
      return details.rows[0] ?? null;
    });
  }

  async completeDelivery(
    organizationId: number,
    jobId: number,
    providerId: string,
  ): Promise<void> {
    await this.transaction(async (client) => {
      const current = await client.query<SocialDeliveryJobRow>(
        `SELECT ${jobSelection} FROM social_message_delivery_jobs
         WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
        [organizationId, jobId],
      );
      const job = current.rows[0];
      if (!job) throw new Error('Social delivery disappeared');
      if (job.status === 'provider_accepted') return;
      if (job.status !== 'processing') throw new Error('Social delivery claim was lost');
      await client.query(
        `UPDATE social_messages
         SET external_message_id=$3, status='sent', error_message=NULL,
             message_timestamp=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, job.social_message_id, providerId],
      );
      const message = await client.query<{ text_content: string | null }>(
        `SELECT text_content FROM social_messages
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, job.social_message_id],
      );
      await client.query(
        `UPDATE social_conversations
         SET last_message_text=$3, last_message_at=CURRENT_TIMESTAMP,
             last_message_from='agent', message_count=message_count+1,
             updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2`,
        [
          organizationId,
          job.conversation_id,
          message.rows[0]?.text_content?.slice(0, 100) ?? '',
        ],
      );
      await client.query(
        `UPDATE social_message_delivery_jobs
         SET status='provider_accepted', provider_message_id=$3,
             accepted_at=CURRENT_TIMESTAMP, lease_expires_at=NULL,
             claimed_by=NULL, last_error=NULL, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, jobId, providerId],
      );
      await syncSocialMessageDeliveryToInbox(
        client,
        organizationId,
        job.social_message_id,
      );
    });
  }

  async rejectDelivery(
    organizationId: number,
    jobId: number,
    message: string,
  ): Promise<void> {
    await this.transaction(async (client) => {
      const failed = await client.query<{ social_message_id: number }>(
        `UPDATE social_message_delivery_jobs
         SET status='dead_letter', lease_expires_at=NULL, claimed_by=NULL,
             last_error=$3, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2 AND status='processing'
         RETURNING social_message_id`,
        [organizationId, jobId, message.slice(0, 2_000)],
      );
      const socialMessageId = failed.rows[0]?.social_message_id;
      if (!socialMessageId) return;
      await client.query(
        `UPDATE social_messages
         SET status='failed', error_message=$3
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, socialMessageId, message.slice(0, 2_000)],
      );
      await syncSocialMessageDeliveryToInbox(client, organizationId, socialMessageId);
    });
  }

  async requireReconciliation(
    organizationId: number,
    jobId: number,
    message: string,
  ): Promise<void> {
    await this.transaction(async (client) => {
      const uncertain = await client.query<{ social_message_id: number }>(
        `UPDATE social_message_delivery_jobs
         SET status='reconciliation_required', lease_expires_at=NULL,
             claimed_by=NULL, last_error=$3, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2 AND status='processing'
         RETURNING social_message_id`,
        [organizationId, jobId, message.slice(0, 2_000)],
      );
      const socialMessageId = uncertain.rows[0]?.social_message_id;
      if (!socialMessageId) return;
      await client.query(
        `UPDATE social_messages SET error_message=$3
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, socialMessageId, message.slice(0, 2_000)],
      );
      await syncSocialMessageDeliveryToInbox(client, organizationId, socialMessageId);
    });
  }

  private async selectConversation(
    client: PoolClient,
    organizationId: number,
    conversationId: number,
  ): Promise<SocialConversationRow | null> {
    const result = await client.query<SocialConversationRow>(
      `SELECT ${conversationSelection}
       FROM social_conversations conversation
       JOIN social_channels channel
         ON channel.id=conversation.channel_id
        AND channel.organization_id=conversation.organization_id
       LEFT JOIN contacts contact
         ON contact.id=conversation.contact_id
        AND contact.organization_id=conversation.organization_id
       LEFT JOIN organization_members assignee_member
         ON assignee_member.organization_id=conversation.organization_id
        AND assignee_member.user_id=conversation.assigned_to
       LEFT JOIN users assignee ON assignee.id=assignee_member.user_id
       WHERE conversation.organization_id=$1 AND conversation.id=$2`,
      [organizationId, conversationId],
    );
    return result.rows[0] ?? null;
  }

  private async selectMessage(
    client: PoolClient,
    organizationId: number,
    messageId: number,
  ): Promise<SocialMessageRow | null> {
    const result = await client.query<SocialMessageRow>(
      `SELECT ${messageSelection}
       FROM social_messages message
       LEFT JOIN organization_members sender_member
         ON sender_member.organization_id=message.organization_id
        AND sender_member.user_id=message.sent_by
       LEFT JOIN users sender ON sender.id=sender_member.user_id
       WHERE message.organization_id=$1 AND message.id=$2`,
      [organizationId, messageId],
    );
    return result.rows[0] ?? null;
  }

  private async recoverExpiredClaims(): Promise<void> {
    await this.pool.query(
      `WITH expired AS (
         UPDATE social_message_delivery_jobs
         SET status='reconciliation_required', lease_expires_at=NULL,
             claimed_by=NULL,
             last_error='Expired Meta delivery claim requires reconciliation',
             updated_at=CURRENT_TIMESTAMP
         WHERE status='processing' AND lease_expires_at < CURRENT_TIMESTAMP
         RETURNING organization_id, social_message_id
       )
       UPDATE social_messages message
       SET error_message='Expired Meta delivery claim requires reconciliation'
       FROM expired
       WHERE message.organization_id=expired.organization_id
         AND message.id=expired.social_message_id`,
    );
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
