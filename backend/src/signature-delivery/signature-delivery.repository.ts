import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { hasPaidEntitlement, PaidEntitlementState } from '../billing/billing-entitlement';
import { signatureDeliveryTokenHash } from './signature-delivery.token';
import {
  SIGNATURE_CONSENT_SHA256,
  SIGNATURE_CONSENT_VERSION,
} from '../public-signing/signature-consent';

type SignatureDeliveryDocument = {
  id: number; organization_id: number; title: string; message: string | null;
  status: string; routing_mode: string | null; expiration_days: number | null;
  expires_at: Date | null; sender_name: string | null; sender_email: string | null;
  created_by: number | null; file_url: string | null; original_sha256: string | null;
  page_count: number | null;
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
    const result = await this.pool.query<PaidEntitlementState>(
      'SELECT plan, subscription_status, trial_ends_at FROM organizations WHERE id=$1',
      [organizationId],
    );
    return hasPaidEntitlement(result.rows[0]);
  }

  async preflightSource(organizationId: number, documentId: number): Promise<{
    status: string;
    fileUrl: string | null;
    originalSha256: string | null;
    pageCount: number | null;
  } | null> {
    const result = await this.pool.query<{
      status: string; file_url: string | null; original_sha256: string | null;
      page_count: number | null;
    }>(
      `SELECT status,file_url,original_sha256,page_count
       FROM signature_documents WHERE id=$1 AND organization_id=$2`,
      [documentId, organizationId],
    );
    const row = result.rows[0];
    return row ? {
      status: row.status,
      fileUrl: row.file_url,
      originalSha256: row.original_sha256,
      pageCount: row.page_count,
    } : null;
  }

  async enqueueInitial(
    organizationId: number,
    documentId: number,
    actorUserId: number,
    inspection?: { fileUrl: string; originalSha256: string; pageCount: number },
  ): Promise<boolean> {
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
      if (inspection) {
        if (
          document.file_url !== inspection.fileUrl
          || (document.original_sha256 !== null
            && document.original_sha256 !== inspection.originalSha256)
        ) {
          throw new SignatureDeliveryStateError(
            'The PDF changed during send preparation. Please try again',
            'SIGNATURE_DOCUMENT_FILE_CHANGED',
          );
        }
        await client.query(
          `UPDATE signature_documents SET page_count=$3,
             original_sha256=COALESCE(original_sha256,$4),updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND organization_id=$2`,
          [documentId, organizationId, inspection.pageCount, inspection.originalSha256],
        );
        document.page_count = inspection.pageCount;
      }
      if (!document.page_count) {
        throw new SignatureDeliveryStateError(
          'The PDF must be inspected before sending',
          'SIGNATURE_DOCUMENT_INSPECTION_REQUIRED',
        );
      }
      const recipients = await this.lockRecipients(client, organizationId, documentId);
      if (recipients.length === 0) {
        throw new SignatureDeliveryStateError(
          'No recipients configured',
          'SIGNATURE_RECIPIENTS_REQUIRED',
        );
      }
      await this.assertSendReady(
        client,
        organizationId,
        documentId,
        document.page_count,
        recipients,
      );
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
             (document_id,recipient_id,event_type,description,metadata,created_at)
           VALUES ($1,$2,'delivery_queued','Signature request queued',$3::jsonb,CURRENT_TIMESTAMP)`,
          [documentId, recipient.id, JSON.stringify({
            actor_class: 'authenticated_user', actor_user_id: actorUserId, version: 1,
          })],
        );
      }
      await client.query(
        `UPDATE signature_documents SET status='sent',sent_at=CURRENT_TIMESTAMP,
           expires_at=$3,consent_disclosure_version=$4,
           consent_disclosure_sha256=$5,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [
          documentId,
          organizationId,
          expiresAt,
          SIGNATURE_CONSENT_VERSION,
          SIGNATURE_CONSENT_SHA256,
        ],
      );
      return true;
    });
  }

  async enqueueReminder(
    organizationId: number,
    documentId: number,
    actorUserId: number,
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const document = await this.lockDocument(client, organizationId, documentId);
      if (!document) return false;
      if (!['sent', 'in_progress'].includes(document.status)) {
        throw new SignatureDeliveryStateError(
          'Only active signature documents can be reminded',
          'SIGNATURE_DOCUMENT_NOT_ACTIVE',
        );
      }
      if (document.expires_at && document.expires_at.getTime() < Date.now()) {
        throw new SignatureDeliveryStateError(
          'Expired signature documents cannot be reminded',
          'SIGNATURE_DOCUMENT_EXPIRED',
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
         WHERE document_id=$1 AND recipient_id=ANY($2::int[])
           AND delivery_type IN ('signature_request','signature_reminder')
           AND status='processing'
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
           WHERE document_id=$1 AND recipient_id=$2
             AND delivery_type IN ('signature_request','signature_reminder')
             AND status IN ('queued','retry')`,
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
             (document_id,recipient_id,event_type,description,metadata,created_at)
           VALUES ($1,$2,'reminder_queued','Signature reminder queued',$3::jsonb,CURRENT_TIMESTAMP)`,
          [documentId, recipient.id, JSON.stringify({
            actor_class: 'authenticated_user', actor_user_id: actorUserId, version: 1,
          })],
        );
      }
      return true;
    });
  }

  async retryFailures(
    organizationId: number,
    documentId: number,
    actorUserId: number,
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const document = await this.lockDocument(client, organizationId, documentId);
      if (!document) return false;
      if (!['sent', 'in_progress'].includes(document.status)) {
        throw new SignatureDeliveryStateError(
          'Only active signature documents can be retried',
          'SIGNATURE_DOCUMENT_NOT_ACTIVE',
        );
      }
      if (document.expires_at && document.expires_at.getTime() < Date.now()) {
        throw new SignatureDeliveryStateError(
          'Expired signature documents cannot be retried',
          'SIGNATURE_DOCUMENT_EXPIRED',
        );
      }
      const delivery = await client.query(
        `UPDATE signature_delivery_outbox SET status='retry',attempt_count=0,
           next_attempt_at=CURRENT_TIMESTAMP,lease_expires_at=NULL,last_error=NULL,
           updated_at=CURRENT_TIMESTAMP
         WHERE document_id=$1 AND organization_id=$2 AND status='dead_letter'
           AND delivery_type IN ('signature_request','signature_reminder')
         RETURNING id`,
        [documentId, organizationId],
      );
      const completion = await client.query(
        `UPDATE signature_completion_jobs SET status='retry',attempt_count=0,
           next_attempt_at=CURRENT_TIMESTAMP,lease_expires_at=NULL,last_error=NULL,
           cancelled_at=NULL,cancellation_reason=NULL,updated_at=CURRENT_TIMESTAMP
         WHERE document_id=$1 AND organization_id=$2 AND status='dead_letter'
         RETURNING id`,
        [documentId, organizationId],
      );
      if (delivery.rows.length === 0 && completion.rows.length === 0) {
        throw new SignatureDeliveryStateError(
          'This signature document has no failed work to retry',
          'SIGNATURE_RETRY_NOT_AVAILABLE',
        );
      }
      await client.query(
        `INSERT INTO signature_audit_log
           (document_id,event_type,description,metadata,created_at)
         VALUES ($1,'retry_queued','Failed signature processing queued for retry',
           $2::jsonb,CURRENT_TIMESTAMP)`,
        [documentId, JSON.stringify({
          actor_class: 'authenticated_user',
          actor_user_id: actorUserId,
          delivery_count: delivery.rows.length,
          completion_count: completion.rows.length,
          version: 1,
        })],
      );
      return true;
    });
  }

  async scheduleReminders(
    organizationId: number,
    documentId: number,
    days: number,
    actorUserId: number,
  ): Promise<{ scheduledAt: Date; reminderCount: number } | null> {
    return this.transaction(async (client) => {
      const document = await this.lockDocument(client, organizationId, documentId);
      if (!document || !['sent', 'in_progress'].includes(document.status)) return null;
      if (document.expires_at && document.expires_at.getTime() < Date.now()) {
        throw new SignatureDeliveryStateError(
          'Expired signature documents cannot be reminded',
          'SIGNATURE_DOCUMENT_EXPIRED',
        );
      }
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
           (document_id,event_type,description,metadata,created_at)
         VALUES ($1,'reminder_scheduled','Signature reminders scheduled',$2::jsonb,CURRENT_TIMESTAMP)`,
        [documentId, JSON.stringify({
          actor_class: 'authenticated_user', actor_user_id: actorUserId, version: 1,
        })],
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
          expires_at,sender_name,sender_email,created_by,file_url,original_sha256,page_count
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

  private async assertSendReady(
    client: PoolClient,
    organizationId: number,
    documentId: number,
    pageCount: number,
    recipients: SignatureDeliveryRecipient[],
  ): Promise<void> {
    const result = await client.query<{
      id: number; recipient_id: number | null; field_type: string;
      page_number: number; is_required: boolean; locked: boolean;
    }>(
      `SELECT field.id,field.recipient_id,field.field_type,field.page_number,
         field.is_required,field.locked
       FROM signature_fields field
       JOIN signature_documents document ON document.id=field.document_id
       WHERE field.document_id=$1 AND document.organization_id=$2
       ORDER BY field.id FOR UPDATE OF field`,
      [documentId, organizationId],
    );
    if (result.rows.length === 0) {
      throw new SignatureDeliveryStateError(
        'Add signature fields before sending',
        'SIGNATURE_FIELDS_REQUIRED',
      );
    }
    const recipientIds = new Set(recipients.map((recipient) => recipient.id));
    for (const field of result.rows) {
      if (field.page_number > pageCount) {
        throw new SignatureDeliveryStateError(
          `A signature field references page ${field.page_number}, but the PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}`,
          'SIGNATURE_FIELD_PAGE_OUT_OF_RANGE',
        );
      }
      if (!field.locked && (!field.recipient_id || !recipientIds.has(field.recipient_id))) {
        throw new SignatureDeliveryStateError(
          'Assign every signer field to a recipient before sending',
          'SIGNATURE_FIELD_RECIPIENT_REQUIRED',
        );
      }
    }
    for (const recipient of recipients) {
      const hasRequiredSignature = result.rows.some((field) =>
        field.recipient_id === recipient.id
        && !field.locked
        && field.is_required
        && (field.field_type === 'signature' || field.field_type === 'initials'));
      if (!hasRequiredSignature) {
        throw new SignatureDeliveryStateError(
          `Add a required signature or initials field for ${recipient.name || recipient.email}`,
          'SIGNATURE_RECIPIENT_SIGNATURE_REQUIRED',
        );
      }
    }
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
