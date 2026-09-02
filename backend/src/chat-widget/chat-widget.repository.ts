import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { RealtimeOutboxService } from '../realtime-outbox/realtime-outbox.service';
import {
  ensureChatInboxConversation,
  mirrorChatMessageToInbox,
} from './chat-inbox-bridge';

export type ChatWidgetRow = {
  id: number;
  organization_id: number;
  widget_key: string;
  name: string;
  primary_color: string;
  text_color: string;
  position: string;
  icon_style: string;
  custom_icon_url: string | null;
  welcome_title: string;
  welcome_message: string;
  placeholder_text: string;
  require_email: boolean;
  require_name: boolean;
  require_phone: boolean;
  custom_fields: unknown[];
  is_active: boolean;
  auto_open_delay: number;
  show_branding: boolean;
  notification_sound: boolean;
  business_hours: Record<string, unknown> | null;
  offline_message: string;
  default_assigned_to: number | null;
  auto_assign_available: boolean;
  total_conversations: number;
  total_messages: number;
  allowed_domains: string[];
  created_at: Date;
  updated_at: Date;
};

export type ChatSessionRow = {
  id: number;
  organization_id: number;
  widget_id: number;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  custom_data: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  referrer_url: string | null;
  current_page_url: string | null;
  country: string | null;
  city: string | null;
  timezone: string | null;
  contact_id: number | null;
  conversation_id: number | null;
  status: string;
  is_online: boolean;
  last_seen_at: Date;
  started_at: Date;
  ended_at: Date | null;
  widget_name: string | null;
  unread_count: number | null;
  last_message: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ChatMessageRow = {
  id: number;
  session_id: number;
  organization_id: number;
  sender_type: string;
  sender_user_id: number | null;
  content: string;
  content_type: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  is_read: boolean;
  read_at: Date | null;
  agent_name: string | null;
  created_at: Date;
};

export type ChatWidgetValues = Partial<{
  name: string;
  primaryColor: string;
  textColor: string;
  position: string;
  iconStyle: string;
  customIconUrl: string | null;
  welcomeTitle: string;
  welcomeMessage: string;
  placeholderText: string;
  requireEmail: boolean;
  requireName: boolean;
  requirePhone: boolean;
  customFields: unknown[];
  isActive: boolean;
  autoOpenDelay: number;
  showBranding: boolean;
  notificationSound: boolean;
  businessHours: Record<string, unknown> | null;
  offlineMessage: string;
  defaultAssignedTo: number | null;
  autoAssignAvailable: boolean;
  allowedDomains: string[];
}>;

export type ChatWidgetWriteOutcome =
  | { kind: 'ok'; row: ChatWidgetRow }
  | { kind: 'already_exists' }
  | { kind: 'not_found' }
  | { kind: 'assignee_not_found' };

export type ChatWidgetCreationOutcome =
  | { kind: 'ok'; row: ChatWidgetRow; replayed: boolean }
  | { kind: 'already_exists' }
  | { kind: 'assignee_not_found' }
  | { kind: 'idempotency_conflict' }
  | { kind: 'result_unavailable' };

type ChatWidgetCreationReceiptRow = {
  request_fingerprint: string;
  result_widget_id: number | null;
};

export type AgentMessageOutcome =
  | { kind: 'ok'; row: ChatMessageRow; replayed: boolean }
  | { kind: 'session_not_found' }
  | { kind: 'key_conflict' };

export type ConversionOutcome =
  | { kind: 'ok'; contactId: number; conversationId: number }
  | { kind: 'session_not_found' }
  | { kind: 'already_converted' };

const widgetSelection = `
  id, organization_id, widget_key, name, primary_color, text_color, position,
  icon_style, custom_icon_url, welcome_title, welcome_message,
  placeholder_text, require_email, require_name, require_phone, custom_fields,
  is_active, auto_open_delay, show_branding, notification_sound,
  business_hours, offline_message, default_assigned_to, auto_assign_available,
  total_conversations, total_messages, allowed_domains, created_at, updated_at`;

const sessionSelection = `
  session.id, session.organization_id, session.widget_id,
  session.visitor_name, session.visitor_email, session.visitor_phone,
  session.custom_data, session.ip_address, session.user_agent,
  session.referrer_url, session.current_page_url, session.country, session.city,
  session.timezone, session.contact_id, session.conversation_id, session.status,
  session.is_online, session.last_seen_at, session.started_at, session.ended_at,
  widget.name AS widget_name, session.created_at, session.updated_at`;

const messageSelection = `
  message.id, message.session_id, message.organization_id, message.sender_type,
  message.sender_user_id, message.content, message.content_type,
  message.attachment_url, message.attachment_name, message.attachment_size,
  message.is_read, message.read_at, agent.name AS agent_name, message.created_at`;

@Injectable()
export class ChatWidgetRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly realtimeOutbox: RealtimeOutboxService,
  ) {}

  async getWidget(organizationId: number): Promise<ChatWidgetRow | null> {
    const result = await this.pool.query<ChatWidgetRow>(
      `SELECT ${widgetSelection}
       FROM chat_widgets
       WHERE organization_id=$1`,
      [organizationId],
    );
    return result.rows[0] ?? null;
  }

  async createWidget(
    organizationId: number,
    userId: number,
    values: ChatWidgetValues,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<ChatWidgetCreationOutcome> {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [
        9341,
        organizationId,
      ]);
      const receipt = await client.query<ChatWidgetCreationReceiptRow>(
        `SELECT request_fingerprint,result_widget_id
         FROM chat_widget_creation_receipts
         WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE`,
        [organizationId, idempotencyKey],
      );
      const replay = receipt.rows[0];
      if (replay) {
        if (replay.request_fingerprint !== requestFingerprint) {
          return { kind: 'idempotency_conflict' };
        }
        if (replay.result_widget_id === null) return { kind: 'result_unavailable' };
        const result = await client.query<ChatWidgetRow>(
          `SELECT ${widgetSelection} FROM chat_widgets
           WHERE id=$1 AND organization_id=$2`,
          [replay.result_widget_id, organizationId],
        );
        return result.rows[0]
          ? { kind: 'ok', row: result.rows[0], replayed: true }
          : { kind: 'result_unavailable' };
      }
      const existing = await client.query(
        'SELECT id FROM chat_widgets WHERE organization_id=$1',
        [organizationId],
      );
      if (existing.rows[0]) return { kind: 'already_exists' };
      if (
        values.defaultAssignedTo != null &&
        !(await this.isOrganizationMember(
          client,
          organizationId,
          values.defaultAssignedTo,
        ))
      ) {
        return { kind: 'assignee_not_found' };
      }
      const result = await client.query<ChatWidgetRow>(
        `INSERT INTO chat_widgets (
           organization_id, widget_key, name, primary_color, text_color,
           position, icon_style, custom_icon_url, welcome_title,
           welcome_message, placeholder_text, require_email, require_name,
           require_phone, custom_fields, is_active, auto_open_delay,
           show_branding, notification_sound, business_hours, offline_message,
           default_assigned_to, auto_assign_available, allowed_domains
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,
           $17,$18,$19,$20::jsonb,$21,$22,$23,$24
         ) RETURNING ${widgetSelection}`,
        [
          organizationId,
          `cw_${randomBytes(16).toString('hex')}`,
          values.name ?? 'Chat Widget',
          values.primaryColor ?? '#3B82F6',
          values.textColor ?? '#FFFFFF',
          values.position ?? 'bottom-right',
          values.iconStyle ?? 'chat',
          values.customIconUrl ?? null,
          values.welcomeTitle ?? 'Hi there!',
          values.welcomeMessage ?? 'How can we help you today?',
          values.placeholderText ?? 'Type your message...',
          values.requireEmail ?? true,
          values.requireName ?? true,
          values.requirePhone ?? false,
          JSON.stringify(values.customFields ?? []),
          values.isActive ?? true,
          values.autoOpenDelay ?? 0,
          values.showBranding ?? true,
          values.notificationSound ?? true,
          values.businessHours == null
            ? null
            : JSON.stringify(values.businessHours),
          values.offlineMessage ??
            'We are currently offline. Please leave a message.',
          values.defaultAssignedTo ?? null,
          values.autoAssignAvailable ?? false,
          values.allowedDomains ?? [],
        ],
      );
      await client.query(
        `INSERT INTO chat_widget_creation_receipts (
           organization_id,requested_by_user_id,idempotency_key,request_fingerprint,result_widget_id
         ) VALUES ($1,$2,$3,$4,$5)`,
        [organizationId, userId, idempotencyKey, requestFingerprint, result.rows[0].id],
      );
      return { kind: 'ok', row: result.rows[0], replayed: false };
    });
  }

  async updateWidget(
    organizationId: number,
    values: ChatWidgetValues,
  ): Promise<ChatWidgetWriteOutcome> {
    return this.transaction(async (client) => {
      const existing = await client.query(
        `SELECT id FROM chat_widgets
         WHERE organization_id=$1
         FOR UPDATE`,
        [organizationId],
      );
      if (!existing.rows[0]) return { kind: 'not_found' };
      if (
        values.defaultAssignedTo != null &&
        !(await this.isOrganizationMember(
          client,
          organizationId,
          values.defaultAssignedTo,
        ))
      ) {
        return { kind: 'assignee_not_found' };
      }
      const columns: Record<keyof ChatWidgetValues, [string, string?]> = {
        name: ['name'],
        primaryColor: ['primary_color'],
        textColor: ['text_color'],
        position: ['position'],
        iconStyle: ['icon_style'],
        customIconUrl: ['custom_icon_url'],
        welcomeTitle: ['welcome_title'],
        welcomeMessage: ['welcome_message'],
        placeholderText: ['placeholder_text'],
        requireEmail: ['require_email'],
        requireName: ['require_name'],
        requirePhone: ['require_phone'],
        customFields: ['custom_fields', '::jsonb'],
        isActive: ['is_active'],
        autoOpenDelay: ['auto_open_delay'],
        showBranding: ['show_branding'],
        notificationSound: ['notification_sound'],
        businessHours: ['business_hours', '::jsonb'],
        offlineMessage: ['offline_message'],
        defaultAssignedTo: ['default_assigned_to'],
        autoAssignAvailable: ['auto_assign_available'],
        allowedDomains: ['allowed_domains'],
      };
      const updates: string[] = [];
      const params: unknown[] = [organizationId];
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) continue;
        const [column, cast = ''] = columns[key as keyof ChatWidgetValues];
        params.push(
          ['customFields', 'businessHours'].includes(key) && value !== null
            ? JSON.stringify(value)
            : value,
        );
        updates.push(`${column}=$${params.length}${cast}`);
      }
      if (updates.length === 0) {
        const current = await client.query<ChatWidgetRow>(
          `SELECT ${widgetSelection} FROM chat_widgets WHERE organization_id=$1`,
          [organizationId],
        );
        return { kind: 'ok', row: current.rows[0] };
      }
      const result = await client.query<ChatWidgetRow>(
        `UPDATE chat_widgets
         SET ${updates.join(', ')}, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1
         RETURNING ${widgetSelection}`,
        params,
      );
      return { kind: 'ok', row: result.rows[0] };
    });
  }

  async listSessions(
    organizationId: number,
    status: string | null,
    page: number,
    limit: number,
  ): Promise<{ rows: ChatSessionRow[]; total: number }> {
    const params: unknown[] = [organizationId];
    const clauses = ['session.organization_id=$1'];
    if (status) {
      params.push(status);
      clauses.push(`session.status=$${params.length}`);
    }
    const where = clauses.join(' AND ');
    const total = await this.pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM chat_sessions session WHERE ${where}`,
      params,
    );
    params.push(limit, (page - 1) * limit);
    const rows = await this.pool.query<ChatSessionRow>(
      `SELECT ${sessionSelection},
          (
            SELECT COUNT(*)::int FROM chat_messages unread
            WHERE unread.organization_id=session.organization_id
              AND unread.session_id=session.id
              AND unread.is_read=FALSE
              AND unread.sender_type='visitor'
          ) AS unread_count,
          (
            SELECT recent.content FROM chat_messages recent
            WHERE recent.organization_id=session.organization_id
              AND recent.session_id=session.id
            ORDER BY recent.created_at DESC, recent.id DESC LIMIT 1
          ) AS last_message
       FROM chat_sessions session
       LEFT JOIN chat_widgets widget
         ON widget.id=session.widget_id
        AND widget.organization_id=session.organization_id
       WHERE ${where}
       ORDER BY session.last_seen_at DESC, session.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { rows: rows.rows, total: Number(total.rows[0]?.count ?? 0) };
  }

  async getSession(
    organizationId: number,
    sessionId: number,
  ): Promise<{ session: ChatSessionRow; messages: ChatMessageRow[] } | null> {
    const session = await this.pool.query<ChatSessionRow>(
      `SELECT ${sessionSelection}, NULL::int AS unread_count,
              NULL::text AS last_message
       FROM chat_sessions session
       LEFT JOIN chat_widgets widget
         ON widget.id=session.widget_id
        AND widget.organization_id=session.organization_id
       WHERE session.organization_id=$1 AND session.id=$2`,
      [organizationId, sessionId],
    );
    if (!session.rows[0]) return null;
    const messages = await this.pool.query<ChatMessageRow>(
      `SELECT ${messageSelection}
       FROM chat_messages message
       LEFT JOIN organization_members agent_member
         ON agent_member.organization_id=message.organization_id
        AND agent_member.user_id=message.sender_user_id
       LEFT JOIN users agent ON agent.id=agent_member.user_id
       WHERE message.organization_id=$1 AND message.session_id=$2
       ORDER BY message.created_at, message.id`,
      [organizationId, sessionId],
    );
    return { session: session.rows[0], messages: messages.rows };
  }

  async sendAgentMessage(
    organizationId: number,
    userId: number,
    sessionId: number,
    content: string,
    idempotencyKey: string,
  ): Promise<AgentMessageOutcome> {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ organizationId, userId, sessionId, content }))
      .digest('hex');
    return this.transaction(async (client) => {
      const session = await client.query<{
        id: number;
        widget_id: number;
        session_token: string;
      }>(
        `SELECT id, widget_id, session_token
         FROM chat_sessions
         WHERE organization_id=$1 AND id=$2 AND status='active'
         FOR UPDATE`,
        [organizationId, sessionId],
      );
      if (!session.rows[0]) return { kind: 'session_not_found' };

      const request = await client.query<{ id: number }>(
        `INSERT INTO chat_agent_message_requests (
           organization_id, session_id, requested_by_user_id,
           idempotency_key, request_fingerprint
         ) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (organization_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [organizationId, sessionId, userId, idempotencyKey, fingerprint],
      );
      if (!request.rows[0]) {
        const existing = await client.query<
          { request_fingerprint: string } & ChatMessageRow
        >(
          `SELECT request.request_fingerprint, ${messageSelection}
           FROM chat_agent_message_requests request
           JOIN chat_messages message
             ON message.id=request.chat_message_id
            AND message.organization_id=request.organization_id
           LEFT JOIN organization_members agent_member
             ON agent_member.organization_id=message.organization_id
            AND agent_member.user_id=message.sender_user_id
           LEFT JOIN users agent ON agent.id=agent_member.user_id
           WHERE request.organization_id=$1 AND request.idempotency_key=$2`,
          [organizationId, idempotencyKey],
        );
        if (
          !existing.rows[0] ||
          existing.rows[0].request_fingerprint !== fingerprint
        ) {
          return { kind: 'key_conflict' };
        }
        return { kind: 'ok', row: existing.rows[0], replayed: true };
      }

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO chat_messages (
           session_id, organization_id, sender_type, sender_user_id, content
         ) VALUES ($1,$2,'agent',$3,$4)
         RETURNING id`,
        [sessionId, organizationId, userId, content],
      );
      await client.query(
        `UPDATE chat_agent_message_requests
         SET chat_message_id=$1
         WHERE id=$2`,
        [inserted.rows[0].id, request.rows[0].id],
      );
      await client.query(
        `UPDATE chat_sessions
         SET updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, sessionId],
      );
      await client.query(
        `UPDATE chat_widgets
         SET total_messages=total_messages+1, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2`,
        [organizationId, session.rows[0].widget_id],
      );
      const message = await client.query<ChatMessageRow>(
        `SELECT ${messageSelection}
         FROM chat_messages message
         LEFT JOIN organization_members agent_member
           ON agent_member.organization_id=message.organization_id
          AND agent_member.user_id=message.sender_user_id
         LEFT JOIN users agent ON agent.id=agent_member.user_id
         WHERE message.organization_id=$1 AND message.id=$2`,
        [organizationId, inserted.rows[0].id],
      );
      const row = message.rows[0];
      await mirrorChatMessageToInbox(client, organizationId, row.id);
      await this.realtimeOutbox.enqueue(client, {
        eventKey: `chat-agent-message:${request.rows[0].id}`,
        aggregateType: 'chat_session',
        aggregateId: sessionId,
        channel: 'chat_session',
        recipientKey: session.rows[0].session_token,
        eventName: 'newChatMessage',
        eventType: 'AGENT_MESSAGE_CREATED',
        payload: { message: this.legacyMessage(row) },
        occurredAt: row.created_at,
      });
      return { kind: 'ok', row, replayed: false };
    });
  }

  async convertSession(
    organizationId: number,
    userId: number,
    sessionId: number,
  ): Promise<ConversionOutcome> {
    return this.transaction(async (client) => {
      const session = await client.query<{
        visitor_name: string | null;
        visitor_email: string | null;
        visitor_phone: string | null;
        contact_id: number | null;
        conversation_id: number | null;
      }>(
        `SELECT visitor_name, visitor_email, visitor_phone, contact_id,
                conversation_id
         FROM chat_sessions
         WHERE organization_id=$1 AND id=$2
         FOR UPDATE`,
        [organizationId, sessionId],
      );
      if (!session.rows[0]) return { kind: 'session_not_found' };
      if (session.rows[0].contact_id) return { kind: 'already_converted' };
      const parts = (session.rows[0].visitor_name ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const contact = await client.query<{ id: number }>(
        `INSERT INTO contacts (
         organization_id, first_name, last_name, email, phone, source,
           status, created_by
         ) VALUES ($1,$2,$3,$4,$5,'form','active',$6)
         RETURNING id`,
        [
          organizationId,
          parts[0] ?? 'Chat',
          parts.slice(1).join(' ') || 'Visitor',
          session.rows[0].visitor_email,
          session.rows[0].visitor_phone,
          userId,
        ],
      );
      let conversationId = session.rows[0].conversation_id;
      if (!conversationId) {
        conversationId = await ensureChatInboxConversation(
          client,
          organizationId,
          sessionId,
        );
      }
      const transcript = await client.query<{ id: number }>(
        `SELECT id FROM chat_messages
         WHERE organization_id=$1 AND session_id=$2
         ORDER BY created_at, id`,
        [organizationId, sessionId],
      );
      for (const message of transcript.rows) {
        await mirrorChatMessageToInbox(client, organizationId, Number(message.id));
      }
      await client.query(
        `UPDATE conversations
         SET contact_id=$3, assigned_to=COALESCE(assigned_to,$4),
             subject=COALESCE(NULLIF($5,''),subject),
             updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2`,
        [
          organizationId,
          conversationId,
          contact.rows[0].id,
          userId,
          session.rows[0].visitor_name,
        ],
      );
      await client.query(
        `UPDATE chat_sessions
         SET contact_id=$1, conversation_id=$2, status='converted',
             is_online=FALSE, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$3 AND id=$4`,
        [contact.rows[0].id, conversationId, organizationId, sessionId],
      );
      await client.query(
        `UPDATE messages inbox
         SET sender_contact_id=$3
         FROM chat_messages chat
         WHERE chat.organization_id=$1 AND chat.session_id=$2
           AND chat.sender_type='visitor'
           AND chat.inbox_message_id=inbox.id
           AND inbox.organization_id=chat.organization_id`,
        [organizationId, sessionId, contact.rows[0].id],
      );
      return {
        kind: 'ok',
        contactId: Number(contact.rows[0].id),
        conversationId: Number(conversationId),
      };
    });
  }

  private async isOrganizationMember(
    client: PoolClient,
    organizationId: number,
    userId: number,
  ): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM organization_members
       WHERE organization_id=$1 AND user_id=$2`,
      [organizationId, userId],
    );
    return Boolean(result.rows[0]);
  }

  private legacyMessage(row: ChatMessageRow): Record<string, unknown> {
    return {
      id: row.id,
      session_id: row.session_id,
      organization_id: row.organization_id,
      sender_type: row.sender_type,
      sender_user_id: row.sender_user_id,
      content: row.content,
      content_type: row.content_type,
      attachment_url: row.attachment_url,
      attachment_name: row.attachment_name,
      attachment_size: row.attachment_size,
      is_read: row.is_read,
      read_at: row.read_at,
      agent_name: row.agent_name,
      created_at: row.created_at,
    };
  }

  private async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await callback(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
