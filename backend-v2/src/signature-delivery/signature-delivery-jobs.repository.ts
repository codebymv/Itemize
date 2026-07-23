import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { workflowJobBackoffMs } from '../workflow-jobs/workflow-job.util';
import { SignatureDeliveryPayload } from './signature-delivery.email';
import { signatureDeliveryTokenHash } from './signature-delivery.token';

export type SignatureDeliveryClaim = {
  id: number;
  idempotency_key: string;
  organization_id: number;
  document_id: number;
  recipient_id: number | null;
  reminder_id: number | null;
  delivery_type:
    | 'signature_request'
    | 'signature_reminder'
    | 'signer_completed'
    | 'document_completed'
    | 'signature_declined';
  payload: SignatureDeliveryPayload;
  attempt_count: number;
};

const redactedError = (error: unknown): string =>
  String(error instanceof Error ? error.message : error || 'Signature delivery failed')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:re|sk|Bearer)\S+\b/gi, '[redacted-secret]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .slice(0, 500);

@Injectable()
export class SignatureDeliveryJobsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async enqueueDueReminders(limit: number): Promise<number> {
    await this.pool.query(
      `UPDATE signature_reminders reminder SET status='skipped'
       FROM signature_documents document
       WHERE reminder.document_id=document.id AND reminder.status='pending'
         AND reminder.scheduled_at<=CURRENT_TIMESTAMP
         AND (document.status NOT IN ('sent','in_progress')
           OR reminder.recipient_id IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM signature_recipients recipient
             WHERE recipient.id=reminder.recipient_id
           )
           OR EXISTS (
             SELECT 1 FROM signature_recipients recipient
             WHERE recipient.id=reminder.recipient_id
               AND recipient.status IN ('signed','declined')
           ))`,
    );
    let queued = 0;
    for (let index = 0; index < limit; index += 1) {
      if (!(await this.enqueueOneDueReminder())) break;
      queued += 1;
    }
    return queued;
  }

  private enqueueOneDueReminder(): Promise<boolean> {
    return this.transaction(async (client) => {
      const selected = await client.query<{
        reminder_id: number; document_id: number; organization_id: number;
        recipient_id: number; email: string; name: string | null; title: string;
        message: string | null; sender_name: string | null; sender_email: string | null;
        expires_at: Date | null;
      }>(
        `SELECT reminder.id AS reminder_id,document.id AS document_id,
           document.organization_id,recipient.id AS recipient_id,recipient.email,recipient.name,
           document.title,document.message,document.sender_name,document.sender_email,
           document.expires_at
         FROM signature_reminders reminder
         JOIN signature_documents document ON document.id=reminder.document_id
         JOIN signature_recipients recipient ON recipient.id=reminder.recipient_id
           AND recipient.document_id=document.id
           AND recipient.organization_id=document.organization_id
         WHERE reminder.status='pending' AND reminder.scheduled_at<=CURRENT_TIMESTAMP
           AND document.status IN ('sent','in_progress')
           AND recipient.status IN ('pending','sent','viewed')
           AND (COALESCE(document.routing_mode,'parallel')='parallel'
             OR recipient.routing_status='active')
           AND NOT EXISTS (
             SELECT 1 FROM signature_delivery_outbox active_delivery
             WHERE active_delivery.recipient_id=recipient.id
               AND active_delivery.delivery_type IN ('signature_request','signature_reminder')
               AND active_delivery.status='processing'
           )
         ORDER BY reminder.scheduled_at,reminder.id
         FOR UPDATE OF reminder,document,recipient SKIP LOCKED LIMIT 1`,
      );
      const row = selected.rows[0];
      if (!row) return false;
      await client.query(
        `UPDATE signature_delivery_outbox SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,
           cancellation_reason='superseded_by_scheduled_reminder',updated_at=CURRENT_TIMESTAMP
         WHERE recipient_id=$1
           AND delivery_type IN ('signature_request','signature_reminder')
           AND status IN ('queued','retry')`,
        [row.recipient_id],
      );
      const key = `signature-reminder-scheduled-v1-${row.reminder_id}`;
      await client.query(
        `INSERT INTO signature_delivery_outbox
           (idempotency_key,organization_id,document_id,recipient_id,reminder_id,
            delivery_type,payload)
         VALUES ($1,$2,$3,$4,$5,'signature_reminder',$6::jsonb)
         ON CONFLICT (reminder_id) WHERE reminder_id IS NOT NULL DO NOTHING`,
        [key, row.organization_id, row.document_id, row.recipient_id, row.reminder_id,
          JSON.stringify({
            to: row.email,
            recipientName: row.name,
            documentTitle: row.title,
            senderName: row.sender_name,
            senderEmail: row.sender_email,
            message: row.message,
            expiresAt: row.expires_at?.toISOString() ?? null,
          })],
      );
      await client.query(
        `UPDATE signature_recipients SET signing_token_hash=$2,token_expires_at=$3
         WHERE id=$1`,
        [row.recipient_id, signatureDeliveryTokenHash(key), row.expires_at],
      );
      await client.query(
        `UPDATE signature_reminders SET status='queued' WHERE id=$1 AND status='pending'`,
        [row.reminder_id],
      );
      await client.query(
        `INSERT INTO signature_audit_log
           (document_id,recipient_id,event_type,description,created_at)
         VALUES ($1,$2,'reminder_queued','Scheduled signature reminder queued',CURRENT_TIMESTAMP)`,
        [row.document_id, row.recipient_id],
      );
      return true;
    });
  }

  claim(leaseSeconds: number, outboxId: number | null = null): Promise<SignatureDeliveryClaim | null> {
    return this.transaction(async (client) => {
      await client.query(
        `UPDATE signature_delivery_outbox outbox SET status='cancelled',
           cancelled_at=COALESCE(cancelled_at,CURRENT_TIMESTAMP),
           cancellation_reason=COALESCE(cancellation_reason,'document_or_recipient_terminal'),
           lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
         FROM signature_documents document
         WHERE outbox.document_id=document.id AND outbox.status IN ('queued','retry')
           AND outbox.delivery_type IN ('signature_request','signature_reminder')
           AND (document.status NOT IN ('sent','in_progress')
             OR outbox.recipient_id IS NULL
             OR NOT EXISTS (
               SELECT 1 FROM signature_recipients recipient
               WHERE recipient.id=outbox.recipient_id
             )
             OR EXISTS (
               SELECT 1 FROM signature_recipients recipient
               WHERE recipient.id=outbox.recipient_id
                 AND recipient.status IN ('signed','declined')
             ))`,
      );
      const result = await client.query<SignatureDeliveryClaim>(
        `WITH candidate AS (
           SELECT id FROM signature_delivery_outbox
           WHERE ($2::bigint IS NULL OR id=$2) AND cancelled_at IS NULL
             AND ((status IN ('queued','retry') AND next_attempt_at<=CURRENT_TIMESTAMP)
               OR (status='processing' AND lease_expires_at<=CURRENT_TIMESTAMP))
           ORDER BY next_attempt_at,created_at,id
           FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE signature_delivery_outbox outbox
         SET status='processing',attempt_count=attempt_count+1,
           lease_expires_at=CURRENT_TIMESTAMP+($1::int*INTERVAL '1 second'),
           last_error=NULL,updated_at=CURRENT_TIMESTAMP
         FROM candidate WHERE outbox.id=candidate.id RETURNING outbox.*`,
        [leaseSeconds, outboxId],
      );
      return result.rows[0] ?? null;
    });
  }

  markSent(claim: SignatureDeliveryClaim, providerId: string | null): Promise<boolean> {
    return this.transaction(async (client) => {
      const updated = await client.query(
        `UPDATE signature_delivery_outbox SET status=CASE WHEN cancelled_at IS NULL THEN 'sent' ELSE 'cancelled' END,
           provider_id=CASE WHEN cancelled_at IS NULL THEN $3 ELSE provider_id END,
           sent_at=CASE WHEN cancelled_at IS NULL THEN CURRENT_TIMESTAMP ELSE sent_at END,
           lease_expires_at=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND status='processing' AND attempt_count=$2
         RETURNING status`,
        [claim.id, claim.attempt_count, providerId],
      );
      if (!updated.rows[0] || updated.rows[0].status !== 'sent') return false;
      if (claim.reminder_id) {
        await client.query(
          `UPDATE signature_reminders SET status='sent',sent_at=CURRENT_TIMESTAMP
           WHERE id=$1`,
          [claim.reminder_id],
        );
      }
      await client.query(
        `INSERT INTO signature_audit_log
           (document_id,recipient_id,event_type,description,created_at)
         VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP)`,
        [
          claim.document_id,
          claim.recipient_id,
          {
            signature_request: 'sent',
            signature_reminder: 'reminder_sent',
            signer_completed: 'signer_notice_sent',
            document_completed: 'completion_notice_sent',
            signature_declined: 'decline_notice_sent',
          }[claim.delivery_type],
          {
            signature_request: 'Signature request sent',
            signature_reminder: 'Signature reminder sent',
            signer_completed: 'Signer completion notice sent',
            document_completed: 'Document completion notice sent',
            signature_declined: 'Signature decline notice sent',
          }[claim.delivery_type],
        ],
      );
      return true;
    });
  }

  async markFailure(
    claim: SignatureDeliveryClaim,
    error: unknown,
    options: { maxAttempts: number; baseDelayMs: number; maximumDelayMs: number; retryable?: boolean },
  ): Promise<'cancelled' | 'dead_letter' | 'retry' | 'stale'> {
    const status = options.retryable === false || claim.attempt_count >= options.maxAttempts
      ? 'dead_letter'
      : 'retry';
    const delay = workflowJobBackoffMs(
      claim.attempt_count,
      options.baseDelayMs,
      options.maximumDelayMs,
    );
    const result = await this.pool.query<{ status: 'cancelled' | 'dead_letter' | 'retry' }>(
      `UPDATE signature_delivery_outbox SET
         status=CASE WHEN cancelled_at IS NOT NULL THEN 'cancelled' ELSE $3::varchar END,
         next_attempt_at=CASE WHEN cancelled_at IS NOT NULL OR $3::varchar='dead_letter'
           THEN next_attempt_at ELSE CURRENT_TIMESTAMP+($4::bigint*INTERVAL '1 millisecond') END,
         lease_expires_at=NULL,last_error=$5,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND status='processing' AND attempt_count=$2 RETURNING status`,
      [claim.id, claim.attempt_count, status, delay, redactedError(error)],
    );
    return result.rows[0]?.status ?? 'stale';
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
