/**
 * Faithful port of the retained Twilio webhook processors
 * (backend/src/routes/sms-webhooks.routes.js). Durable event-key claims,
 * the provider-to-domain status map, globally unique receiving-number
 * routing, tenant-local sender matching, and quarantine reasons must not
 * drift while both runtimes serve the receivers.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export const SMS_STATUS_MAP: Readonly<Record<string, string>> = Object.freeze({
  accepted: 'queued',
  scheduled: 'queued',
  queued: 'queued',
  receiving: 'sending',
  sending: 'sending',
  sent: 'sent',
  delivered: 'delivered',
  read: 'delivered',
  undelivered: 'undelivered',
  canceled: 'failed',
  failed: 'failed',
});

export function normalizePhoneNumber(phone: string): string {
  if (!phone) return phone;
  let normalized = phone.replace(/[^\d+]/g, '');
  if (!normalized.startsWith('+')) {
    if (normalized.startsWith('1') && normalized.length === 11) {
      normalized = '+' + normalized;
    } else if (normalized.length === 10) {
      normalized = '+1' + normalized;
    } else {
      normalized = '+' + normalized;
    }
  }
  return normalized;
}

export type InboundOutcome = {
  duplicate: boolean;
  routed: boolean;
  reason?: string;
};

@Injectable()
export class SmsWebhooksService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async processStatusEvent(values: {
    messageSid: string;
    dbStatus: string;
    errorCode: string | null;
    errorMessage: string | null;
    providerStatus: string;
  }): Promise<{ duplicate: boolean }> {
    return this.transaction(async (client) => {
      const eventKey = `status:${values.messageSid}:${values.providerStatus}`;
      const claim = await client.query(
        `INSERT INTO sms_webhook_events (event_key, event_type, external_id)
         VALUES ($1, 'status', $2)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING event_key`,
        [eventKey, values.messageSid],
      );
      if (claim.rows.length === 0) return { duplicate: true };

      await client.query(
        `UPDATE sms_logs
         SET status = $1,
             ${values.dbStatus === 'delivered' ? 'delivered_at = CURRENT_TIMESTAMP,' : ''}
             ${values.dbStatus === 'sent' ? 'sent_at = CURRENT_TIMESTAMP,' : ''}
             error_code = $2,
             error_message = $3
         WHERE external_id = $4 AND direction = 'outbound'`,
        [
          values.dbStatus,
          values.errorCode,
          values.errorMessage,
          values.messageSid,
        ],
      );
      await client.query(
        `UPDATE sms_webhook_events
         SET processing_status = 'processed'
         WHERE event_key = $1`,
        [eventKey],
      );
      return { duplicate: false };
    });
  }

  async processInboundEvent(values: {
    messageSid: string;
    fromPhone: string;
    toPhone: string;
    messageBody: string;
  }): Promise<InboundOutcome> {
    return this.transaction(async (client) => {
      const normalizedFrom = normalizePhoneNumber(values.fromPhone);
      const normalizedTo = normalizePhoneNumber(values.toPhone);
      const eventKey = `inbound:${values.messageSid}`;

      const claim = await client.query(
        `INSERT INTO sms_webhook_events (
           event_key, event_type, external_id, to_phone, from_phone, processing_status
         )
         VALUES ($1, 'inbound', $2, $3, $4, 'pending')
         ON CONFLICT (event_key) DO NOTHING
         RETURNING event_key`,
        [eventKey, values.messageSid, normalizedTo, normalizedFrom],
      );
      if (claim.rows.length === 0) return { duplicate: true, routed: false };

      const receiver = await client.query<{
        id: number;
        organization_id: number;
      }>(
        `SELECT id, organization_id
         FROM sms_receiving_numbers
         WHERE phone_number = $1
           AND provider = 'twilio'
           AND is_active = TRUE
         LIMIT 1
         FOR SHARE`,
        [normalizedTo],
      );
      if (receiver.rows.length === 0) {
        await client.query(
          `UPDATE sms_webhook_events
           SET processing_status = 'unmatched_receiver'
           WHERE event_key = $1`,
          [eventKey],
        );
        return { duplicate: false, routed: false, reason: 'unmatched_receiver' };
      }

      const organizationId = receiver.rows[0].organization_id;
      const contacts = await client.query<{ id: number }>(
        `SELECT c.id
         FROM contacts c
         WHERE c.organization_id = $1
           AND (c.phone = $2 OR c.phone = $3)
         ORDER BY c.id
         LIMIT 2`,
        [organizationId, normalizedFrom, values.fromPhone],
      );
      if (contacts.rows.length !== 1) {
        const reason =
          contacts.rows.length === 0 ? 'unmatched_sender' : 'ambiguous_sender';
        await client.query(
          `UPDATE sms_webhook_events
           SET organization_id = $2,
               processing_status = $3
           WHERE event_key = $1`,
          [eventKey, organizationId, reason],
        );
        return { duplicate: false, routed: false, reason };
      }

      const contactId = contacts.rows[0].id;
      const existingConversation = await client.query<{ id: number }>(
        `SELECT id FROM conversations
         WHERE contact_id = $1 AND organization_id = $2 AND channel = 'sms'
         ORDER BY last_message_at DESC
         LIMIT 1`,
        [contactId, organizationId],
      );

      let conversationId: number;
      if (existingConversation.rows.length > 0) {
        conversationId = existingConversation.rows[0].id;
        await client.query(
          `UPDATE conversations
           SET last_message_at = CURRENT_TIMESTAMP,
               last_message_preview = $1,
               unread_count = unread_count + 1,
               status = 'open'
           WHERE id = $2`,
          [values.messageBody.substring(0, 100), conversationId],
        );
      } else {
        const created = await client.query<{ id: number }>(
          `INSERT INTO conversations
             (organization_id, contact_id, channel, status, last_message_at, last_message_preview, unread_count)
           VALUES ($1, $2, 'sms', 'open', CURRENT_TIMESTAMP, $3, 1)
           RETURNING id`,
          [organizationId, contactId, values.messageBody.substring(0, 100)],
        );
        conversationId = created.rows[0].id;
      }

      await client.query(
        `INSERT INTO messages
           (conversation_id, organization_id, sender_type, sender_contact_id, channel, content)
         VALUES ($1, $2, 'contact', $3, 'sms', $4)`,
        [conversationId, organizationId, contactId, values.messageBody],
      );
      await client.query(
        `INSERT INTO sms_logs
           (organization_id, contact_id, conversation_id, to_phone, from_phone, message, direction, status, external_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'inbound', 'received', $7)`,
        [
          organizationId,
          contactId,
          conversationId,
          normalizedTo,
          normalizedFrom,
          values.messageBody,
          values.messageSid,
        ],
      );
      await client.query(
        `UPDATE sms_webhook_events
         SET organization_id = $2,
             contact_id = $3,
             processing_status = 'processed'
         WHERE event_key = $1`,
        [eventKey, organizationId, contactId],
      );

      return { duplicate: false, routed: true };
    });
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
