import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { signatureDeliveryTokenHash } from './signature-delivery.token';

type SignatureDeliveryDocument = {
  id: number; organization_id: number; title: string; message: string | null;
  status: string; routing_mode: string | null; expiration_days: number | null;
  expires_at: Date | null; sender_name: string | null; sender_email: string | null;
  created_by: number | null; file_url: string | null;
};

type SignatureDeliveryRecipient = {
  id: number; name: string | null; email: string; status: string;
  routing_status: string | null; signing_order: number;
};

export class SignatureDeliveryStateError extends Error {
  constructor(message: string, readonly reason: string) {
    super(message);
    this.name = 'SignatureDeliveryStateError';
  }
}

@Injectable()
export class SignatureDeliveryRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async hasFeatureAccess(organizationId: number): Promise<boolean> {
    const result = await this.pool.query<{ plan: string | null }>(
      'SELECT plan FROM organizations WHERE id=$1',
      [organizationId],
    );
    return result.rows[0] !== undefined
      && ['starter', 'unlimited', 'pro'].includes(result.rows[0].plan ?? 'starter');
  }

  async enqueueInitial(organizationId: number, documentId: number): Promise<boolean> {
    return this.transaction(async (client) => {
      const document = await this.lockDocument(client, organizationId, documentId);
      if (!document) return false;
      if (document.status !== 'draft') {
        throw new SignatureDeliveryStateError(
          'Only draft documents can be sent',
          'SIGNATURE_DOCUMENT_NOT_DRAFT',
        );
      }
      if (!document.file_url) {
        throw new SignatureDeliveryStateError(
          'Upload a PDF before sending',
          'SIGNATURE_DOCUMENT_FILE_REQUIRED',
        );
      }
      const recipients = await this.lockRecipients(client, organizationId, documentId);
      if (recipients.length === 0) {
        throw new SignatureDeliveryStateError(
          'No recipients configured',
          'SIGNATURE_RECIPIENTS_REQUIRED',
        );
      }
      const sender = await this.sender(client, document);
      const routingMode = document.routing_mode || 'parallel';
      const now = new Date();
      const expiresAt = document.expiration_days
        ? new Date(now.getTime() + document.expiration_days * 86_400_000)
        : null;

      for (let index = 0; index < recipients.length; index += 1) {
        const recipient = recipients[index];
        const active = routingMode === 'parallel' || index === 0;
        if (!active) {
          await client.query(
            `UPDATE signature_recipients SET status='pending',routing_status='locked',
               signing_token_hash=NULL,token_expires_at=$2
             WHERE id=$1`,
            [recipient.id, expiresAt],
          );
          continue;
        }
        const key = `signature-request-v1-${documentId}-${recipient.id}`;
        await client.query(
          `INSERT INTO signature_delivery_outbox
             (idempotency_key,organization_id,document_id,recipient_id,delivery_type,payload)
           VALUES ($1,$2,$3,$4,'signature_request',$5::jsonb)`,
          [key, organizationId, documentId, recipient.id, JSON.stringify({
            to: recipient.email,
            recipientName: recipient.name,
            documentTitle: document.title,
            senderName: sender.name,
            senderEmail: sender.email,
            message: document.message,
            expiresAt: expiresAt?.toISOString() ?? null,
          })],
        );
        await client.query(
          `UPDATE signature_recipients SET signing_token_hash=$2,token_expires_at=$3,
             status='sent',routing_status='active',sent_at=CURRENT_TIMESTAMP
           WHERE id=$1`,
          [recipient.id, signatureDeliveryTokenHash(key), expiresAt],
        );
        await client.query(
          `INSERT INTO signature_audit_log
             (document_id,recipient_id,event_type,description,created_at)
           VALUES ($1,$2,'delivery_queued','Signature request queued',CURRENT_TIMESTAMP)`,
          [documentId, recipient.id],
        );
      }
      await client.query(
        `UPDATE signature_documents SET status='sent',sent_at=CURRENT_TIMESTAMP,
           expires_at=$3,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [documentId, organizationId, expiresAt],
      );
      return true;
    });
  }

  async enqueueReminder(organizationId: number, documentId: number): Promise<boolean> {
    return this.transaction(async (client) => {
      const document = await this.lockDocument(client, organizationId, documentId);
      if (!document) return false;
      if (!['sent', 'in_progress'].includes(document.status)) {
        throw new SignatureDeliveryStateError(
          'Only active signature documents can be reminded',
          'SIGNATURE_DOCUMENT_NOT_ACTIVE',
        );
      }
      const recipients = await client.query<SignatureDeliveryRecipient>(
        `SELECT id,name,email,status,routing_status,signing_order
         FROM signature_recipients
         WHERE document_id=$1 AND organization_id=$2
           AND status IN ('sent','viewed')
           AND (COALESCE($3,'parallel')='parallel' OR routing_status='active')
         ORDER BY signing_order,id FOR UPDATE`,
        [documentId, organizationId, document.routing_mode],
      );
      if (recipients.rows.length === 0) {
        throw new SignatureDeliveryStateError(
          'No active recipients to remind',
          'SIGNATURE_ACTIVE_RECIPIENTS_REQUIRED',
        );
      }
      const inFlight = await client.query(
        `SELECT id FROM signature_delivery_outbox
         WHERE document_id=$1 AND recipient_id=ANY($2::int[]) AND status='processing'
         LIMIT 1`,
        [documentId, recipients.rows.map((recipient) => recipient.id)],
      );
      if (inFlight.rows[0]) {
        throw new SignatureDeliveryStateError(
          'A signature delivery is already in progress',
          'SIGNATURE_DELIVERY_IN_PROGRESS',
        );
      }
      const sender = await this.sender(client, document);
      for (const recipient of recipients.rows) {
        await client.query(
          `UPDATE signature_delivery_outbox SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,
             cancellation_reason='superseded_by_reminder',updated_at=CURRENT_TIMESTAMP
           WHERE document_id=$1 AND recipient_id=$2 AND status IN ('queued','retry')`,
          [documentId, recipient.id],
        );
        const generation = await client.query<{ total: string }>(
          `SELECT COUNT(*) AS total FROM signature_delivery_outbox
           WHERE document_id=$1 AND recipient_id=$2 AND delivery_type='signature_reminder'`,
          [documentId, recipient.id],
        );
        const key = `signature-reminder-v1-${documentId}-${recipient.id}-${Number(generation.rows[0]?.total ?? 0) + 1}`;
        await client.query(
          `INSERT INTO signature_delivery_outbox
             (idempotency_key,organization_id,document_id,recipient_id,delivery_type,payload)
           VALUES ($1,$2,$3,$4,'signature_reminder',$5::jsonb)`,
          [key, organizationId, documentId, recipient.id, JSON.stringify({
            to: recipient.email,
            recipientName: recipient.name,
            documentTitle: document.title,
            senderName: sender.name,
            senderEmail: sender.email,
            message: document.message,
            expiresAt: document.expires_at?.toISOString() ?? null,
          })],
        );
        await client.query(
          'UPDATE signature_recipients SET signing_token_hash=$2,token_expires_at=$3 WHERE id=$1',
          [recipient.id, signatureDeliveryTokenHash(key), document.expires_at],
        );
        await client.query(
          `INSERT INTO signature_audit_log
             (document_id,recipient_id,event_type,description,created_at)
           VALUES ($1,$2,'reminder_queued','Signature reminder queued',CURRENT_TIMESTAMP)`,
          [documentId, recipient.id],
        );
      }
      return true;
    });
  }

  async scheduleReminders(
    organizationId: number,
    documentId: number,
    days: number,
  ): Promise<{ scheduledAt: Date; reminderCount: number } | null> {
    return this.transaction(async (client) => {
      const document = await this.lockDocument(client, organizationId, documentId);
      if (!document || !['sent', 'in_progress'].includes(document.status)) return null;
      const scheduledAt = new Date(Date.now() + days * 86_400_000);
      const inserted = await client.query(
        `INSERT INTO signature_reminders (document_id,recipient_id,scheduled_at,status)
         SELECT document_id,id,$1,'pending' FROM signature_recipients
         WHERE document_id=$2 AND organization_id=$3
           AND status IN ('pending','sent','viewed') RETURNING id`,
        [scheduledAt, documentId, organizationId],
      );
      if (inserted.rows.length === 0) {
        throw new SignatureDeliveryStateError(
          'No active recipients to remind',
          'SIGNATURE_ACTIVE_RECIPIENTS_REQUIRED',
        );
      }
      await client.query(
        `INSERT INTO signature_audit_log
           (document_id,event_type,description,created_at)
         VALUES ($1,'reminder_scheduled','Signature reminders scheduled',CURRENT_TIMESTAMP)`,
        [documentId],
      );
      return { scheduledAt, reminderCount: inserted.rows.length };
    });
  }

  private async lockDocument(
    client: PoolClient,
    organizationId: number,
    documentId: number,
  ): Promise<SignatureDeliveryDocument | null> {
    const result = await client.query<SignatureDeliveryDocument>(
      `SELECT id,organization_id,title,message,status,routing_mode,expiration_days,
         expires_at,sender_name,sender_email,created_by,file_url
       FROM signature_documents WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
      [documentId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async lockRecipients(
    client: PoolClient,
    organizationId: number,
    documentId: number,
  ): Promise<SignatureDeliveryRecipient[]> {
    const result = await client.query<SignatureDeliveryRecipient>(
      `SELECT id,name,email,status,routing_status,signing_order
       FROM signature_recipients WHERE document_id=$1 AND organization_id=$2
       ORDER BY signing_order,id FOR UPDATE`,
      [documentId, organizationId],
    );
    return result.rows;
  }

  private async sender(
    client: PoolClient,
    document: SignatureDeliveryDocument,
  ): Promise<{ name: string | null; email: string | null }> {
    if (document.sender_name && document.sender_email) {
      return { name: document.sender_name, email: document.sender_email };
    }
    if (!document.created_by) {
      return { name: document.sender_name, email: document.sender_email };
    }
    const user = await client.query<{ name: string | null; email: string | null }>(
      'SELECT name,email FROM users WHERE id=$1',
      [document.created_by],
    );
    return {
      name: document.sender_name || user.rows[0]?.name || null,
      email: document.sender_email || user.rows[0]?.email || null,
    };
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
