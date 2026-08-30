/**
 * Faithful port of the retained public chat widget persistence
 * (backend/src/routes/chat-widget/public.routes.js).
 */
import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';
import { mirrorChatMessageToInbox } from '../chat-widget/chat-inbox-bridge';

const CHAT_MESSAGE_COLUMNS = [
  'id', 'session_id', 'organization_id', 'sender_type', 'sender_user_id',
  'content', 'content_type', 'attachment_url', 'attachment_name',
  'attachment_size', 'is_read', 'read_at', 'created_at',
];

const chatMessageColumns = (alias?: string): string =>
  alias
    ? CHAT_MESSAGE_COLUMNS.map((column) => `${alias}.${column}`).join(', ')
    : CHAT_MESSAGE_COLUMNS.join(', ');

export const generateSessionToken = (): string =>
  'cs_' + crypto.randomBytes(24).toString('hex');

export type PublicWidgetConfigRow = Record<string, unknown> & {
  business_hours: Record<
    string,
    { start?: string; end?: string; closed?: boolean } | null
  > | null;
};

export type SessionStartOutcome =
  | { status: 'widget_not_found' }
  | { status: 'validation'; message: string }
  | {
      status: 'ok';
      httpStatus: 200 | 201;
      data: { session_token: string; session_id: number; resumed: boolean };
      organizationId: number;
    };

export type VisitorMessageOutcome =
  | { status: 'session_not_found' }
  | {
      status: 'ok';
      session: {
        id: number;
        organization_id: number;
        visitor_name: string | null;
        visitor_email: string | null;
      };
      message: Record<string, unknown>;
    };

@Injectable()
export class ChatWidgetPublicRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly notifications: NotificationsService,
  ) {}

  async widgetConfig(widgetKey: string): Promise<PublicWidgetConfigRow | null> {
    const result = await this.pool.query<PublicWidgetConfigRow>(
      `SELECT
         widget_key, name, primary_color, text_color, position, icon_style,
         custom_icon_url, welcome_title, welcome_message, placeholder_text,
         require_email, require_name, require_phone, custom_fields, is_active,
         auto_open_delay, show_branding, business_hours, offline_message
       FROM chat_widgets
       WHERE widget_key = $1 AND is_active = TRUE`,
      [widgetKey],
    );
    return result.rows[0] ?? null;
  }

  async startSession(values: {
    widgetKey: string;
    visitorName: string | null;
    visitorEmail: string | null;
    visitorPhone: string | null;
    customData: unknown;
    currentPageUrl: string | null;
    referrerUrl: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<SessionStartOutcome> {
    const widgetResult = await this.pool.query<{
      id: number;
      organization_id: number;
      require_email: boolean;
      require_name: boolean;
      require_phone: boolean;
    }>(
      `SELECT id, organization_id, require_email, require_name, require_phone
       FROM chat_widgets WHERE widget_key = $1 AND is_active = TRUE`,
      [values.widgetKey],
    );
    if (widgetResult.rows.length === 0) return { status: 'widget_not_found' };
    const widget = widgetResult.rows[0];

    if (widget.require_email && !values.visitorEmail) {
      return { status: 'validation', message: 'Email is required' };
    }
    if (widget.require_name && !values.visitorName) {
      return { status: 'validation', message: 'Name is required' };
    }
    if (widget.require_phone && !values.visitorPhone) {
      return { status: 'validation', message: 'Phone is required' };
    }

    if (values.visitorEmail) {
      const existing = await this.pool.query<{
        id: number;
        session_token: string;
      }>(
        `SELECT id, session_token FROM chat_sessions
         WHERE widget_id = $1 AND visitor_email = $2 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [widget.id, values.visitorEmail],
      );
      if (existing.rows.length > 0) {
        return {
          status: 'ok',
          httpStatus: 200,
          data: {
            session_token: existing.rows[0].session_token,
            session_id: existing.rows[0].id,
            resumed: true,
          },
          organizationId: widget.organization_id,
        };
      }
    }

    const sessionToken = generateSessionToken();
    const created = await this.pool.query<{ id: number; session_token: string }>(
      `INSERT INTO chat_sessions (
         organization_id, widget_id, session_token,
         visitor_name, visitor_email, visitor_phone, custom_data,
         ip_address, user_agent, referrer_url, current_page_url
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, session_token`,
      [
        widget.organization_id,
        widget.id,
        sessionToken,
        values.visitorName,
        values.visitorEmail,
        values.visitorPhone,
        JSON.stringify(values.customData || {}),
        values.ipAddress,
        values.userAgent,
        values.referrerUrl,
        values.currentPageUrl,
      ],
    );
    await this.pool.query(
      `UPDATE chat_widgets SET
         total_conversations = total_conversations + 1,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [widget.id],
    );

    return {
      status: 'ok',
      httpStatus: 201,
      data: {
        session_token: sessionToken,
        session_id: created.rows[0].id,
        resumed: false,
      },
      organizationId: widget.organization_id,
    };
  }

  async sessionMessages(
    sessionToken: string,
    after: string | undefined,
  ): Promise<Record<string, unknown>[] | null> {
    const sessionResult = await this.pool.query<{ id: number; status: string }>(
      'SELECT id, status FROM chat_sessions WHERE session_token = $1',
      [sessionToken],
    );
    if (sessionResult.rows.length === 0) return null;

    let query = `
      SELECT ${chatMessageColumns('cm')}, u.name as agent_name
      FROM chat_messages cm
      LEFT JOIN users u ON cm.sender_user_id = u.id
      WHERE cm.session_id = $1`;
    const params: unknown[] = [sessionResult.rows[0].id];
    if (after) {
      query += ' AND cm.created_at > $2';
      params.push(after);
    }
    query += ' ORDER BY cm.created_at ASC';
    const messages = await this.pool.query(query, params);

    await this.pool.query(
      `UPDATE chat_sessions
       SET last_seen_at = CURRENT_TIMESTAMP, is_online = TRUE
       WHERE id = $1 AND status = 'active'`,
      [sessionResult.rows[0].id],
    );
    return messages.rows;
  }

  async recordVisitorMessage(
    sessionToken: string,
    content: string,
  ): Promise<VisitorMessageOutcome> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sessionResult = await client.query<{
        id: number;
        organization_id: number;
        widget_id: number;
        visitor_name: string | null;
        visitor_email: string | null;
      }>(
        `SELECT cs.id, cs.organization_id, cs.widget_id, cs.visitor_name,
                cs.visitor_email, cs.custom_data
         FROM chat_sessions cs
         WHERE cs.session_token = $1 AND cs.status = 'active'
         FOR UPDATE`,
        [sessionToken],
      );
      if (sessionResult.rows.length === 0) {
        await client.query('COMMIT');
        return { status: 'session_not_found' };
      }
      const session = sessionResult.rows[0];

      const messageResult = await client.query<{ id: number } & Record<string, unknown>>(
        `INSERT INTO chat_messages (session_id, organization_id, sender_type, content)
         VALUES ($1, $2, 'visitor', $3)
         RETURNING ${chatMessageColumns()}`,
        [session.id, session.organization_id, content],
      );
      await client.query(
        `UPDATE chat_sessions SET
           last_seen_at = CURRENT_TIMESTAMP,
           is_online = TRUE,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [session.id],
      );
      await client.query(
        `UPDATE chat_widgets SET
           total_messages = total_messages + 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [session.widget_id],
      );
      const bridged = await mirrorChatMessageToInbox(
        client,
        session.organization_id,
        Number(messageResult.rows[0].id),
      );
      await this.notifications.createForOrganizationOwnerWithClient(client, {
        organizationId: session.organization_id,
        eventType: 'communication.message_received',
        entityType: 'conversation',
        entityId: bridged.conversationId,
        dedupeKey: `chat-message-received:${messageResult.rows[0].id}`,
        payload: {
          conversationId: bridged.conversationId,
          chatSessionId: session.id,
          chatMessageId: messageResult.rows[0].id,
          channel: 'chat',
        },
        category: 'business',
        priority: 'normal',
        title: 'New website chat',
        body: `${session.visitor_name || session.visitor_email || 'A visitor'}: ${content.slice(0, 160)}`,
        href: `/inbox?conversation=${bridged.conversationId}`,
        occurredAt: new Date(String(messageResult.rows[0].created_at)),
      });
      await client.query('COMMIT');
      return { status: 'ok', session, message: messageResult.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async endSession(
    sessionToken: string,
  ): Promise<{ id: number; organization_id: number } | null> {
    const result = await this.pool.query<{
      id: number;
      organization_id: number;
    }>(
      `UPDATE chat_sessions SET
         status = 'ended',
         is_online = FALSE,
         ended_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       WHERE session_token = $1 AND status = 'active'
       RETURNING id, organization_id`,
      [sessionToken],
    );
    return result.rows[0] ?? null;
  }

  async activeSession(
    sessionToken: string,
  ): Promise<{ id: number; organization_id: number } | null> {
    const result = await this.pool.query<{
      id: number;
      organization_id: number;
    }>(
      `SELECT id, organization_id FROM chat_sessions
       WHERE session_token = $1 AND status = 'active'`,
      [sessionToken],
    );
    return result.rows[0] ?? null;
  }
}
