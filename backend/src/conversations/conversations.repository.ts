import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type ConversationRow = {
  id: number;
  organization_id: number;
  contact_id: number | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  status: string;
  snoozed_until: Date | null;
  channel: string;
  subject: string | null;
  last_message_at: Date | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: Date;
  updated_at: Date;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  social_conversation_id: number | null;
  provider_account_name: string | null;
  provider_participant_name: string | null;
  provider_participant_username: string | null;
  provider_participant_profile_pic: string | null;
  chat_session_id: number | null;
  chat_session_status: string | null;
  chat_visitor_name: string | null;
  chat_visitor_email: string | null;
  chat_visitor_phone: string | null;
  chat_widget_name: string | null;
};

export type ConversationMessageRow = {
  id: number;
  conversation_id: number;
  organization_id: number;
  sender_type: string;
  sender_user_id: number | null;
  sender_contact_id: number | null;
  sender_user_name: string | null;
  sender_contact_first_name: string | null;
  sender_contact_last_name: string | null;
  channel: string;
  content: string;
  content_html: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: Date;
};

export type ConversationListFilters = {
  status?: string;
  channel?: string;
  assignedTo?: number;
  contactId?: number;
  page: number;
  limit: number;
};

export type CreateConversationValues = {
  contactId: number;
  subject: string | null;
  channel: string;
  initialMessage: string | null;
};

export type UpdateConversationValues = Partial<{
  status: string;
  snoozedUntil: Date | null;
}>;

export type SendMessageValues = {
  content: string;
  contentHtml: string | null;
  channel: string;
  metadata: Record<string, unknown>;
};

export type ConversationPageRows = {
  conversations: ConversationRow[];
  total: number;
};

export type CreateConversationOutcome =
  | { kind: 'ok'; row: ConversationRow }
  | { kind: 'contact_not_found' };

export type AssignConversationOutcome =
  | { kind: 'ok'; row: ConversationRow }
  | { kind: 'conversation_not_found' }
  | { kind: 'assignee_not_found' };

const conversationSelection = `
  c.id,
  c.organization_id,
  c.contact_id,
  c.assigned_to,
  u.name AS assigned_to_name,
  c.status,
  c.snoozed_until,
  c.channel,
  c.subject,
  c.last_message_at,
  c.last_message_preview,
  c.unread_count,
  c.created_at,
  c.updated_at,
  ct.first_name AS contact_first_name,
  ct.last_name AS contact_last_name,
  ct.email AS contact_email,
  ct.phone AS contact_phone,
  social.id AS social_conversation_id,
  provider.name AS provider_account_name,
  social.participant_name AS provider_participant_name,
  social.participant_username AS provider_participant_username,
  social.participant_profile_pic AS provider_participant_profile_pic,
  chat.id AS chat_session_id,
  chat.status AS chat_session_status,
  chat.visitor_name AS chat_visitor_name,
  chat.visitor_email AS chat_visitor_email,
  chat.visitor_phone AS chat_visitor_phone,
  chat_widget.name AS chat_widget_name`;

const conversationProviderJoins = `
  LEFT JOIN social_conversations social
    ON social.inbox_conversation_id = c.id
   AND social.organization_id = c.organization_id
  LEFT JOIN social_channels provider
    ON provider.id = social.channel_id
   AND provider.organization_id = social.organization_id
  LEFT JOIN chat_sessions chat
    ON chat.conversation_id = c.id
   AND chat.organization_id = c.organization_id
  LEFT JOIN chat_widgets chat_widget
    ON chat_widget.id = chat.widget_id
   AND chat_widget.organization_id = chat.organization_id`;

const messageSelection = `
  m.id,
  m.conversation_id,
  m.organization_id,
  m.sender_type,
  m.sender_user_id,
  m.sender_contact_id,
  u.name AS sender_user_name,
  ct.first_name AS sender_contact_first_name,
  ct.last_name AS sender_contact_last_name,
  m.channel,
  m.content,
  m.content_html,
  m.metadata,
  m.is_read,
  m.created_at`;

@Injectable()
export class ConversationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findAll(
    organizationId: number,
    filters: ConversationListFilters,
  ): Promise<ConversationPageRows> {
    const clauses = ['c.organization_id = $1'];
    const params: unknown[] = [organizationId];
    if (filters.status) {
      params.push(filters.status);
      clauses.push(`c.status = $${params.length}`);
    }
    if (filters.channel) {
      params.push(filters.channel);
      clauses.push(`c.channel = $${params.length}`);
    }
    if (filters.assignedTo !== undefined) {
      params.push(filters.assignedTo);
      clauses.push(`c.assigned_to = $${params.length}`);
    }
    if (filters.contactId !== undefined) {
      params.push(filters.contactId);
      clauses.push(`c.contact_id = $${params.length}`);
    }
    const where = clauses.join(' AND ');
    const client = await this.pool.connect();
    try {
      const totalResult = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM conversations c WHERE ${where}`,
        params,
      );
      params.push(filters.limit, (filters.page - 1) * filters.limit);
      const result = await client.query<ConversationRow>(
        `SELECT ${conversationSelection}
         FROM conversations c
         LEFT JOIN contacts ct
           ON ct.id = c.contact_id
          AND ct.organization_id = c.organization_id
         LEFT JOIN users u ON u.id = c.assigned_to
         ${conversationProviderJoins}
         WHERE ${where}
         ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC, c.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      return {
        conversations: result.rows,
        total: Number(totalResult.rows[0]?.count ?? 0),
      };
    } finally {
      client.release();
    }
  }

  async findById(
    organizationId: number,
    conversationId: number,
  ): Promise<{ conversation: ConversationRow; messages: ConversationMessageRow[] } | null> {
    const client = await this.pool.connect();
    try {
      const conversation = await this.selectConversation(
        client,
        organizationId,
        conversationId,
      );
      if (!conversation) return null;
      const messages = await client.query<ConversationMessageRow>(
        `SELECT ${messageSelection}
         FROM messages m
         LEFT JOIN users u ON u.id = m.sender_user_id
         LEFT JOIN contacts ct
           ON ct.id = m.sender_contact_id
          AND ct.organization_id = m.organization_id
         WHERE m.conversation_id = $1
           AND m.organization_id = $2
         ORDER BY m.created_at ASC, m.id ASC`,
        [conversationId, organizationId],
      );
      return { conversation, messages: messages.rows };
    } finally {
      client.release();
    }
  }

  async create(
    organizationId: number,
    userId: number,
    values: CreateConversationValues,
  ): Promise<CreateConversationOutcome> {
    return this.transaction(async (client) => {
      const contact = await client.query<{ id: number }>(
        `SELECT id
         FROM contacts
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [values.contactId, organizationId],
      );
      if (contact.rows.length === 0) return { kind: 'contact_not_found' };

      const existing = await client.query<{ id: number }>(
        `SELECT id
         FROM conversations
         WHERE organization_id = $1
           AND contact_id = $2
           AND status = 'open'
         ORDER BY created_at ASC, id ASC
         LIMIT 1
         FOR UPDATE`,
        [organizationId, values.contactId],
      );

      let conversationId = existing.rows[0]?.id;
      if (!conversationId) {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO conversations (
             organization_id, contact_id, assigned_to, channel, subject
           ) VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            organizationId,
            values.contactId,
            userId,
            values.channel,
            values.subject,
          ],
        );
        conversationId = inserted.rows[0].id;
      }

      if (values.initialMessage) {
        await client.query(
          `INSERT INTO messages (
             conversation_id, organization_id, sender_type, sender_user_id,
             channel, content, metadata
           ) VALUES ($1, $2, 'user', $3, $4, $5, '{}'::jsonb)`,
          [
            conversationId,
            organizationId,
            userId,
            values.channel,
            values.initialMessage,
          ],
        );
        await client.query(
          `UPDATE conversations
           SET last_message_at = CURRENT_TIMESTAMP,
               last_message_preview = $1,
               status = CASE WHEN status = 'snoozed' THEN 'open' ELSE status END,
               snoozed_until = CASE WHEN status = 'snoozed' THEN NULL ELSE snoozed_until END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND organization_id = $3`,
          [values.initialMessage.slice(0, 200), conversationId, organizationId],
        );
      }

      const row = await this.selectConversation(
        client,
        organizationId,
        conversationId,
      );
      if (!row) throw new Error('Created conversation could not be reloaded');
      return { kind: 'ok', row };
    });
  }

  async update(
    organizationId: number,
    conversationId: number,
    values: UpdateConversationValues,
  ): Promise<ConversationRow | null> {
    return this.transaction(async (client) => {
      const owned = await client.query<{ id: number }>(
        `SELECT id FROM conversations
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [conversationId, organizationId],
      );
      if (owned.rows.length === 0) return null;

      const assignments: string[] = [];
      const params: unknown[] = [conversationId, organizationId];
      if (values.status !== undefined) {
        params.push(values.status);
        assignments.push(`status = $${params.length}`);
      }
      if (values.snoozedUntil !== undefined) {
        params.push(values.snoozedUntil);
        assignments.push(`snoozed_until = $${params.length}`);
      }
      assignments.push('updated_at = CURRENT_TIMESTAMP');
      await client.query(
        `UPDATE conversations SET ${assignments.join(', ')}
         WHERE id = $1 AND organization_id = $2`,
        params,
      );
      if (values.status !== undefined) {
        await client.query(
          `UPDATE social_conversations
           SET status=CASE WHEN $3='closed' THEN 'closed' ELSE 'open' END,
               updated_at=CURRENT_TIMESTAMP
           WHERE organization_id=$2 AND inbox_conversation_id=$1`,
          [conversationId, organizationId, values.status],
        );
        if (values.status === 'closed') {
          await client.query(
            `UPDATE chat_sessions
             SET status=CASE WHEN status='active' THEN 'ended' ELSE status END,
                 is_online=FALSE,
                 ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),
                 updated_at=CURRENT_TIMESTAMP
             WHERE organization_id=$2 AND conversation_id=$1`,
            [conversationId, organizationId],
          );
        }
      }
      return this.selectConversation(client, organizationId, conversationId);
    });
  }

  async assign(
    organizationId: number,
    conversationId: number,
    assignedTo: number | null,
  ): Promise<AssignConversationOutcome> {
    return this.transaction(async (client) => {
      const owned = await client.query<{ id: number }>(
        `SELECT id FROM conversations
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [conversationId, organizationId],
      );
      if (owned.rows.length === 0) return { kind: 'conversation_not_found' };
      if (assignedTo !== null) {
        const member = await client.query(
          `SELECT 1 FROM organization_members
           WHERE organization_id = $1 AND user_id = $2`,
          [organizationId, assignedTo],
        );
        if (member.rows.length === 0) return { kind: 'assignee_not_found' };
      }
      await client.query(
        `UPDATE conversations
         SET assigned_to = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3`,
        [assignedTo, conversationId, organizationId],
      );
      await client.query(
        `UPDATE social_conversations
         SET assigned_to=$1, updated_at=CURRENT_TIMESTAMP
         WHERE inbox_conversation_id=$2 AND organization_id=$3`,
        [assignedTo, conversationId, organizationId],
      );
      const row = await this.selectConversation(
        client,
        organizationId,
        conversationId,
      );
      if (!row) throw new Error('Assigned conversation could not be reloaded');
      return { kind: 'ok', row };
    });
  }

  async sendMessage(
    organizationId: number,
    userId: number,
    conversationId: number,
    values: SendMessageValues,
  ): Promise<ConversationMessageRow | null> {
    return this.transaction(async (client) => {
      const owned = await client.query<{ id: number }>(
        `SELECT id FROM conversations
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [conversationId, organizationId],
      );
      if (owned.rows.length === 0) return null;
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO messages (
           conversation_id, organization_id, sender_type, sender_user_id,
           channel, content, content_html, metadata
         ) VALUES ($1, $2, 'user', $3, $4, $5, $6, $7::jsonb)
         RETURNING id`,
        [
          conversationId,
          organizationId,
          userId,
          values.channel,
          values.content,
          values.contentHtml,
          JSON.stringify(values.metadata),
        ],
      );
      await client.query(
        `UPDATE conversations
         SET last_message_at = CURRENT_TIMESTAMP,
             last_message_preview = $1,
             status = CASE WHEN status = 'snoozed' THEN 'open' ELSE status END,
             snoozed_until = CASE WHEN status = 'snoozed' THEN NULL ELSE snoozed_until END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3`,
        [values.content.slice(0, 200), conversationId, organizationId],
      );
      const row = await this.selectMessage(
        client,
        organizationId,
        inserted.rows[0].id,
      );
      if (!row) throw new Error('Created message could not be reloaded');
      return row;
    });
  }

  async markRead(
    organizationId: number,
    conversationId: number,
  ): Promise<ConversationRow | null> {
    return this.transaction(async (client) => {
      const owned = await client.query<{ id: number }>(
        `SELECT id FROM conversations
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [conversationId, organizationId],
      );
      if (owned.rows.length === 0) return null;
      await client.query(
        `UPDATE messages
         SET is_read = TRUE
         WHERE conversation_id = $1
           AND organization_id = $2
           AND is_read = FALSE`,
        [conversationId, organizationId],
      );
      await client.query(
        `UPDATE conversations
         SET unread_count = 0, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [conversationId, organizationId],
      );
      await client.query(
        `UPDATE social_conversations
         SET unread_count=0, updated_at=CURRENT_TIMESTAMP
         WHERE inbox_conversation_id=$1 AND organization_id=$2`,
        [conversationId, organizationId],
      );
      await client.query(
        `UPDATE chat_messages chat
         SET is_read=TRUE, read_at=COALESCE(read_at,CURRENT_TIMESTAMP)
         FROM chat_sessions session
         WHERE session.organization_id=$2
           AND session.conversation_id=$1
           AND chat.organization_id=session.organization_id
           AND chat.session_id=session.id
           AND chat.sender_type='visitor'
           AND chat.is_read=FALSE`,
        [conversationId, organizationId],
      );
      return this.selectConversation(client, organizationId, conversationId);
    });
  }

  private async selectConversation(
    client: PoolClient,
    organizationId: number,
    conversationId: number,
  ): Promise<ConversationRow | null> {
    const result = await client.query<ConversationRow>(
      `SELECT ${conversationSelection}
       FROM conversations c
       LEFT JOIN contacts ct
         ON ct.id = c.contact_id
        AND ct.organization_id = c.organization_id
       LEFT JOIN users u ON u.id = c.assigned_to
       ${conversationProviderJoins}
       WHERE c.id = $1 AND c.organization_id = $2`,
      [conversationId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async selectMessage(
    client: PoolClient,
    organizationId: number,
    messageId: number,
  ): Promise<ConversationMessageRow | null> {
    const result = await client.query<ConversationMessageRow>(
      `SELECT ${messageSelection}
       FROM messages m
       LEFT JOIN users u ON u.id = m.sender_user_id
       LEFT JOIN contacts ct
         ON ct.id = m.sender_contact_id
        AND ct.organization_id = m.organization_id
       WHERE m.id = $1 AND m.organization_id = $2`,
      [messageId, organizationId],
    );
    return result.rows[0] ?? null;
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
