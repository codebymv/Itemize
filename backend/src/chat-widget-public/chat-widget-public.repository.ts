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
  | { status: 'idempotency_conflict' }
  | {
      status: 'ok';
      httpStatus: 200 | 201;
      data: { session_token: string; session_id: number; resumed: boolean };
      organizationId: number;
      replayed: boolean;
    };

export type VisitorMessageOutcome =
  | { status: 'session_not_found' }
  | { status: 'idempotency_conflict' }
  | {
      status: 'ok';
      session: {
        id: number;
        organization_id: number;
        visitor_name: string | null;
        visitor_email: string | null;
      };
      message: Record<string, unknown>;
      replayed: boolean;
    };

export type EndSessionOutcome =
  | { status: 'session_not_found' }
  | {
      status: 'ok';
      session: { id: number; organization_id: number };
      replayed: boolean;
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
    idempotencyKey: string | null;
    requestFingerprint: string | null;
  }): Promise<SessionStartOutcome> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const widgetResult = await client.query<{
        id: number;
        organization_id: number;
        require_email: boolean;
        require_name: boolean;
        require_phone: boolean;
      }>(
        `SELECT id, organization_id, require_email, require_name, require_phone
         FROM chat_widgets
         WHERE widget_key = $1 AND is_active = TRUE
         FOR UPDATE`,
        [values.widgetKey],
      );
      if (widgetResult.rows.length === 0) {
        await client.query('COMMIT');
        return { status: 'widget_not_found' };
      }
      const widget = widgetResult.rows[0];

      if (widget.require_email && !values.visitorEmail) {
        await client.query('COMMIT');
        return { status: 'validation', message: 'Email is required' };
      }
      if (widget.require_name && !values.visitorName) {
        await client.query('COMMIT');
        return { status: 'validation', message: 'Name is required' };
      }
      if (widget.require_phone && !values.visitorPhone) {
        await client.query('COMMIT');
        return { status: 'validation', message: 'Phone is required' };
      }

      if (values.idempotencyKey && values.requestFingerprint) {
        const replay = await client.query<{
          request_fingerprint: string;
          http_status: number;
          resumed: boolean;
          id: number;
          session_token: string;
        }>(
          `SELECT request.request_fingerprint, request.http_status,
                  request.resumed, session.id, session.session_token
           FROM chat_public_session_requests request
           JOIN chat_sessions session ON session.id = request.chat_session_id
           WHERE request.widget_id = $1 AND request.idempotency_key = $2`,
          [widget.id, values.idempotencyKey],
        );
        if (replay.rows.length > 0) {
          if (replay.rows[0].request_fingerprint !== values.requestFingerprint) {
            await client.query('COMMIT');
            return { status: 'idempotency_conflict' };
          }
          await client.query('COMMIT');
          return {
            status: 'ok',
            httpStatus: replay.rows[0].http_status as 200 | 201,
            data: {
              session_token: replay.rows[0].session_token,
              session_id: replay.rows[0].id,
              resumed: replay.rows[0].resumed,
            },
            organizationId: widget.organization_id,
            replayed: true,
          };
        }
      }

      let session: { id: number; session_token: string } | undefined;
      let httpStatus: 200 | 201 = 201;
      let resumed = false;
      if (values.visitorEmail) {
        const existing = await client.query<{
          id: number;
          session_token: string;
        }>(
          `SELECT id, session_token FROM chat_sessions
           WHERE widget_id = $1 AND visitor_email = $2 AND status = 'active'
           ORDER BY created_at DESC LIMIT 1`,
          [widget.id, values.visitorEmail],
        );
        session = existing.rows[0];
        if (session) {
          httpStatus = 200;
          resumed = true;
        }
      }

      if (!session) {
        const sessionToken = generateSessionToken();
        const created = await client.query<{ id: number; session_token: string }>(
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
        session = created.rows[0];
        await client.query(
          `UPDATE chat_widgets SET
             total_conversations = total_conversations + 1,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [widget.id],
        );
      }

      if (values.idempotencyKey && values.requestFingerprint) {
        await client.query(
          `INSERT INTO chat_public_session_requests (
             widget_id, idempotency_key, request_fingerprint,
             chat_session_id, http_status, resumed
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            widget.id,
            values.idempotencyKey,
            values.requestFingerprint,
            session.id,
            httpStatus,
            resumed,
          ],
        );
      }

      await client.query('COMMIT');
      return {
        status: 'ok',
        httpStatus,
        data: {
          session_token: session.session_token,
          session_id: session.id,
          resumed,
        },
        organizationId: widget.organization_id,
        replayed: false,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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
    idempotencyKey: string | null,
    requestFingerprint: string | null,
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
        status: string;
      }>(
        `SELECT cs.id, cs.organization_id, cs.widget_id, cs.visitor_name,
                cs.visitor_email, cs.custom_data, cs.status
         FROM chat_sessions cs
         WHERE cs.session_token = $1
         FOR UPDATE`,
        [sessionToken],
      );
      if (sessionResult.rows.length === 0) {
        await client.query('COMMIT');
        return { status: 'session_not_found' };
      }
      const session = sessionResult.rows[0];

      if (idempotencyKey && requestFingerprint) {
        const replay = await client.query<
          { request_fingerprint: string } & Record<string, unknown>
        >(
          `SELECT request.request_fingerprint, ${chatMessageColumns('message')}
           FROM chat_visitor_message_requests request
           JOIN chat_messages message ON message.id = request.chat_message_id
           WHERE request.session_id = $1 AND request.idempotency_key = $2`,
          [session.id, idempotencyKey],
        );
        if (replay.rows.length > 0) {
          if (replay.rows[0].request_fingerprint !== requestFingerprint) {
            await client.query('COMMIT');
            return { status: 'idempotency_conflict' };
          }
          const { request_fingerprint: _fingerprint, ...message } = replay.rows[0];
          await client.query('COMMIT');
          return { status: 'ok', session, message, replayed: true };
        }
      }
      if (session.status !== 'active') {
        await client.query('COMMIT');
        return { status: 'session_not_found' };
      }

      const messageResult = await client.query<{ id: number } & Record<string, unknown>>(
        `INSERT INTO chat_messages (session_id, organization_id, sender_type, content)
         VALUES ($1, $2, 'visitor', $3)
         RETURNING ${chatMessageColumns()}`,
        [session.id, session.organization_id, content],
      );
      if (idempotencyKey && requestFingerprint) {
        await client.query(
          `INSERT INTO chat_visitor_message_requests (
             session_id, idempotency_key, request_fingerprint, chat_message_id
           ) VALUES ($1, $2, $3, $4)`,
          [session.id, idempotencyKey, requestFingerprint, messageResult.rows[0].id],
        );
      }
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
      return {
        status: 'ok',
        session,
        message: messageResult.rows[0],
        replayed: false,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async endSession(
    sessionToken: string,
  ): Promise<EndSessionOutcome> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: number;
        organization_id: number;
        status: string;
      }>(
        `SELECT id, organization_id, status
         FROM chat_sessions
         WHERE session_token = $1
         FOR UPDATE`,
        [sessionToken],
      );
      const session = result.rows[0];
      if (!session || session.status === 'converted') {
        await client.query('COMMIT');
        return { status: 'session_not_found' };
      }
      if (session.status === 'ended') {
        await client.query('COMMIT');
        return { status: 'ok', session, replayed: true };
      }
      await client.query(
        `UPDATE chat_sessions SET
           status = 'ended',
           is_online = FALSE,
           ended_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [session.id],
      );
      await client.query('COMMIT');
      return { status: 'ok', session, replayed: false };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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
