import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { signatureDeliveryTokenHash } from '../signature-delivery/signature-delivery.token';
import {
  PublicSigningFieldValue,
  PublicSigningValidationError,
  validatePublicSigningFieldValue,
} from './public-signing.validation';

export type PublicSigningAudit = {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
};

type CapabilityRow = {
  recipient_id: number;
  recipient_name: string | null;
  recipient_email: string;
  recipient_status: string;
  routing_status: string | null;
  signing_order: number;
  identity_method: string;
  identity_verified_at: Date | null;
  document_id: number;
  organization_id: number;
  title: string;
  description: string | null;
  message: string | null;
  file_url: string | null;
  file_name: string | null;
  file_type: string | null;
  original_sha256: string | null;
  document_status: string;
  expires_at: Date | null;
  routing_mode: string | null;
  sender_name: string | null;
  sender_email: string | null;
};

type SigningFieldRow = {
  id: number;
  field_type: string;
  page_number: number;
  x_position: string;
  y_position: string;
  width: string;
  height: string;
  label: string | null;
  is_required: boolean;
  locked: boolean;
};

type RecipientState = {
  id: number;
  name: string | null;
  email: string;
  contact_id: number | null;
  status: string;
  routing_status: string | null;
  signing_order: number;
};

export type PublicSigningSessionRow = {
  capability: CapabilityRow;
  fields: SigningFieldRow[];
};

export type PublicSigningFileRow = {
  fileUrl: string;
  fileName: string | null;
  originalSha256: string | null;
};

export type PublicSigningSubmitResult = {
  recipientId: number;
  documentId: number;
  completionQueued: boolean;
};

@Injectable()
export class PublicSigningRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  openSession(
    tokenHash: string,
    audit: PublicSigningAudit,
  ): Promise<PublicSigningSessionRow | null> {
    return this.transaction(async (client) => {
      const capability = await this.capability(client, tokenHash, true);
      if (!capability) return null;
      const viewed = await client.query(
        `UPDATE signature_recipients
         SET status='viewed',viewed_at=CURRENT_TIMESTAMP,
           ip_address=$2,user_agent=$3
         WHERE id=$1 AND status IN ('pending','sent','viewed') AND viewed_at IS NULL
         RETURNING id`,
        [capability.recipient_id, audit.ipAddress, audit.userAgent],
      );
      if (viewed.rows[0]) {
        await this.audit(
          client,
          capability.document_id,
          capability.recipient_id,
          'viewed',
          'Recipient viewed document',
          audit,
        );
        capability.recipient_status = 'viewed';
      }
      return {
        capability,
        fields: await this.signerFields(client, capability.document_id, capability.recipient_id),
      };
    });
  }

  async file(tokenHash: string): Promise<PublicSigningFileRow | null> {
    const capability = await this.capability(this.pool, tokenHash, false);
    if (!capability?.file_url) return null;
    return {
      fileUrl: capability.file_url,
      fileName: capability.file_name,
      originalSha256: capability.original_sha256,
    };
  }

  submit(
    tokenHash: string,
    fields: PublicSigningFieldValue[],
    audit: PublicSigningAudit,
  ): Promise<PublicSigningSubmitResult | null> {
    return this.transaction(async (client) => {
      const capability = await this.capability(client, tokenHash, true);
      if (!capability) return null;
      const recipients = await this.lockRecipients(client, capability);
      const allowed = await client.query<SigningFieldRow>(
        `SELECT id,field_type,page_number,x_position,y_position,width,height,
           label,is_required,locked
         FROM signature_fields
         WHERE document_id=$1 AND recipient_id=$2
         ORDER BY page_number,id
         FOR UPDATE`,
        [capability.document_id, capability.recipient_id],
      );
      const submitted = new Map(fields.map((field) => [field.id, field.value]));
      const byId = new Map(
        allowed.rows.filter((field) => !field.locked).map((field) => [field.id, field]),
      );
      for (const id of submitted.keys()) {
        if (!byId.has(id)) {
          throw new PublicSigningValidationError(
            'Unknown signature field',
            'UNKNOWN_SIGNATURE_FIELD',
          );
        }
      }
      const imageBudget = { bytes: 0 };
      const validated = new Map<number, string>();
      for (const field of byId.values()) {
        const value = validatePublicSigningFieldValue(
          field.field_type,
          submitted.get(field.id),
          field.is_required,
          imageBudget,
        );
        if (value !== undefined) validated.set(field.id, value);
      }
      for (const [id, value] of validated) {
        await client.query(
          `UPDATE signature_fields SET value=$1
           WHERE id=$2 AND document_id=$3 AND recipient_id=$4 AND locked=false`,
          [value, id, capability.document_id, capability.recipient_id],
        );
      }
      await client.query(
        `UPDATE signature_recipients SET status='signed',signed_at=CURRENT_TIMESTAMP,
           signing_token_hash=NULL,token_expires_at=NULL,routing_status='locked',
           ip_address=$2,user_agent=$3
         WHERE id=$1`,
        [capability.recipient_id, audit.ipAddress, audit.userAgent],
      );
      await this.cancelRecipientDeliveries(
        client,
        capability.recipient_id,
        'recipient_signed',
      );
      await this.audit(
        client,
        capability.document_id,
        capability.recipient_id,
        'signed',
        'Recipient signed document',
        audit,
      );
      await this.enqueueSignerCompleted(client, capability);

      const remaining = recipients.filter(
        (recipient) =>
          recipient.id !== capability.recipient_id && recipient.status !== 'signed',
      );
      if (remaining.length === 0) {
        const completion = await client.query(
          `INSERT INTO signature_completion_jobs
             (idempotency_key,organization_id,document_id)
           VALUES ($1,$2,$3)
           ON CONFLICT (document_id) DO NOTHING
           RETURNING id`,
          [
            `signature-completion-v1-${capability.document_id}`,
            capability.organization_id,
            capability.document_id,
          ],
        );
        await client.query(
          `UPDATE signature_documents SET status='in_progress',updated_at=CURRENT_TIMESTAMP
           WHERE id=$1`,
          [capability.document_id],
        );
        if (completion.rows[0]) {
          await this.audit(
            client,
            capability.document_id,
            capability.recipient_id,
            'completion_queued',
            'Signed PDF completion queued',
            audit,
          );
        }
        return {
          recipientId: capability.recipient_id,
          documentId: capability.document_id,
          completionQueued: true,
        };
      }

      if ((capability.routing_mode || 'parallel') === 'sequential') {
        const alreadyActive = remaining.some(
          (recipient) =>
            ['sent', 'viewed'].includes(recipient.status)
            && recipient.routing_status === 'active',
        );
        if (!alreadyActive) {
          const next = remaining
            .filter((recipient) => recipient.status === 'pending')
            .sort(
              (left, right) =>
                left.signing_order - right.signing_order || left.id - right.id,
            )[0];
          if (next) await this.activateNext(client, capability, next);
        }
      }
      await client.query(
        `UPDATE signature_documents SET status='in_progress',updated_at=CURRENT_TIMESTAMP
         WHERE id=$1`,
        [capability.document_id],
      );
      return {
        recipientId: capability.recipient_id,
        documentId: capability.document_id,
        completionQueued: false,
      };
    });
  }

  decline(
    tokenHash: string,
    reason: string | null,
    audit: PublicSigningAudit,
  ): Promise<{ documentId: number; recipientId: number } | null> {
    return this.transaction(async (client) => {
      const capability = await this.capability(client, tokenHash, true);
      if (!capability) return null;
      await this.lockRecipients(client, capability);
      await client.query(
        `UPDATE signature_recipients SET status='declined',declined_at=CURRENT_TIMESTAMP,
           decline_reason=$2,signing_token_hash=NULL,token_expires_at=NULL,
           routing_status='locked',ip_address=$3,user_agent=$4
         WHERE id=$1`,
        [capability.recipient_id, reason, audit.ipAddress, audit.userAgent],
      );
      await client.query(
        `UPDATE signature_recipients SET signing_token_hash=NULL,token_expires_at=NULL,
           routing_status='locked'
         WHERE document_id=$1 AND id<>$2
           AND status IN ('pending','sent','viewed')`,
        [capability.document_id, capability.recipient_id],
      );
      await client.query(
        `UPDATE signature_documents SET status='cancelled',updated_at=CURRENT_TIMESTAMP
         WHERE id=$1`,
        [capability.document_id],
      );
      await client.query(
        `UPDATE signature_reminders SET status='cancelled'
         WHERE document_id=$1 AND status IN ('pending','queued')`,
        [capability.document_id],
      );
      await client.query(
        `UPDATE signature_delivery_outbox
         SET status=CASE WHEN status='processing' THEN status ELSE 'cancelled' END,
           cancelled_at=CURRENT_TIMESTAMP,cancellation_reason='document_declined',
           lease_expires_at=CASE WHEN status='processing' THEN lease_expires_at ELSE NULL END,
           updated_at=CURRENT_TIMESTAMP
         WHERE document_id=$1 AND delivery_type IN ('signature_request','signature_reminder')
           AND status IN ('queued','retry','processing')`,
        [capability.document_id],
      );
      await client.query(
        `UPDATE signature_completion_jobs SET status='cancelled',
           cancelled_at=CURRENT_TIMESTAMP,cancellation_reason='document_declined',
           lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
         WHERE document_id=$1 AND status IN ('queued','retry')`,
        [capability.document_id],
      );
      await this.audit(
        client,
        capability.document_id,
        capability.recipient_id,
        'declined',
        reason || 'Recipient declined to sign',
        audit,
      );
      await this.enqueueDeclined(client, capability, reason);
      return {
        documentId: capability.document_id,
        recipientId: capability.recipient_id,
      };
    });
  }

  private async capability(
    queryable: Pick<Pool, 'query'> | PoolClient,
    tokenHash: string,
    lock: boolean,
  ): Promise<CapabilityRow | null> {
    const result = await queryable.query<CapabilityRow>(
      `SELECT
         recipient.id AS recipient_id,recipient.name AS recipient_name,
         recipient.email AS recipient_email,recipient.status AS recipient_status,
         recipient.routing_status,recipient.signing_order,recipient.identity_method,
         recipient.identity_verified_at,
         document.id AS document_id,document.organization_id,document.title,
         document.description,document.message,document.file_url,document.file_name,
         document.file_type,document.original_sha256,
         document.status AS document_status,document.expires_at,
         document.routing_mode,document.sender_name,document.sender_email
       FROM signature_recipients recipient
       JOIN signature_documents document ON document.id=recipient.document_id
         AND document.organization_id=recipient.organization_id
       WHERE recipient.signing_token_hash=$1
         AND recipient.status IN ('pending','sent','viewed')
         AND recipient.identity_method='none'
         AND document.status IN ('sent','in_progress')
         AND (recipient.token_expires_at IS NULL
           OR recipient.token_expires_at>=CURRENT_TIMESTAMP)
         AND (document.expires_at IS NULL OR document.expires_at>=CURRENT_TIMESTAMP)
         AND (COALESCE(document.routing_mode,'parallel')='parallel'
           OR recipient.routing_status='active')
       ${lock ? 'FOR UPDATE OF recipient,document' : ''}`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  private async signerFields(
    client: PoolClient,
    documentId: number,
    recipientId: number,
  ): Promise<SigningFieldRow[]> {
    const result = await client.query<SigningFieldRow>(
      `SELECT id,field_type,page_number,x_position,y_position,width,height,
         label,is_required,locked
       FROM signature_fields
       WHERE document_id=$1 AND recipient_id=$2 AND locked=false
       ORDER BY page_number,id`,
      [documentId, recipientId],
    );
    return result.rows;
  }

  private async lockRecipients(
    client: PoolClient,
    capability: CapabilityRow,
  ): Promise<RecipientState[]> {
    const result = await client.query<RecipientState>(
      `SELECT id,name,email,contact_id,status,routing_status,signing_order
       FROM signature_recipients
       WHERE document_id=$1 AND organization_id=$2
       ORDER BY signing_order,id
       FOR UPDATE`,
      [capability.document_id, capability.organization_id],
    );
    return result.rows;
  }

  private async activateNext(
    client: PoolClient,
    capability: CapabilityRow,
    recipient: RecipientState,
  ): Promise<void> {
    const key =
      `signature-request-sequential-v1-${capability.document_id}-${recipient.id}`
      + `-after-${capability.recipient_id}`;
    const inserted = await client.query(
      `INSERT INTO signature_delivery_outbox
         (idempotency_key,organization_id,document_id,recipient_id,
          delivery_type,payload)
       VALUES ($1,$2,$3,$4,'signature_request',$5::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        key,
        capability.organization_id,
        capability.document_id,
        recipient.id,
        JSON.stringify({
          to: recipient.email,
          recipientName: recipient.name,
          documentTitle: capability.title,
          senderName: capability.sender_name,
          senderEmail: capability.sender_email,
          message: capability.message,
          expiresAt: capability.expires_at?.toISOString() ?? null,
        }),
      ],
    );
    if (!inserted.rows[0]) return;
    await client.query(
      `UPDATE signature_recipients SET signing_token_hash=$2,
         token_expires_at=$3,status='sent',routing_status='active',
         sent_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND status='pending'`,
      [
        recipient.id,
        signatureDeliveryTokenHash(key),
        capability.expires_at,
      ],
    );
    await client.query(
      `INSERT INTO signature_audit_log
         (document_id,recipient_id,event_type,description,metadata,created_at)
       VALUES ($1,$2,'delivery_queued','Sequential signature request queued',
         '{"actor_class":"system","version":1}'::jsonb,CURRENT_TIMESTAMP)`,
      [capability.document_id, recipient.id],
    );
  }

  private async cancelRecipientDeliveries(
    client: PoolClient,
    recipientId: number,
    reason: string,
  ): Promise<void> {
    await client.query(
      `UPDATE signature_delivery_outbox
       SET status=CASE WHEN status='processing' THEN status ELSE 'cancelled' END,
         cancelled_at=CURRENT_TIMESTAMP,cancellation_reason=$2,
         lease_expires_at=CASE WHEN status='processing' THEN lease_expires_at ELSE NULL END,
         updated_at=CURRENT_TIMESTAMP
       WHERE recipient_id=$1 AND delivery_type IN ('signature_request','signature_reminder')
         AND status IN ('queued','retry','processing')`,
      [recipientId, reason],
    );
    await client.query(
      `UPDATE signature_reminders SET status='cancelled'
       WHERE recipient_id=$1 AND status IN ('pending','queued')`,
      [recipientId],
    );
  }

  private async enqueueSignerCompleted(
    client: PoolClient,
    capability: CapabilityRow,
  ): Promise<void> {
    if (!capability.sender_email) return;
    await client.query(
      `INSERT INTO signature_delivery_outbox
         (idempotency_key,organization_id,document_id,recipient_id,
          delivery_type,payload)
       VALUES ($1,$2,$3,$4,'signer_completed',$5::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        `signature-signer-completed-v1-${capability.document_id}-${capability.recipient_id}`,
        capability.organization_id,
        capability.document_id,
        capability.recipient_id,
        JSON.stringify({
          to: capability.sender_email,
          recipientName: capability.recipient_name,
          documentTitle: capability.title,
          senderName: capability.sender_name,
          senderEmail: capability.sender_email,
          message: null,
          expiresAt: null,
        }),
      ],
    );
  }

  private async enqueueDeclined(
    client: PoolClient,
    capability: CapabilityRow,
    reason: string | null,
  ): Promise<void> {
    if (!capability.sender_email) return;
    await client.query(
      `INSERT INTO signature_delivery_outbox
         (idempotency_key,organization_id,document_id,recipient_id,
          delivery_type,payload)
       VALUES ($1,$2,$3,$4,'signature_declined',$5::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        `signature-declined-v1-${capability.document_id}-${capability.recipient_id}`,
        capability.organization_id,
        capability.document_id,
        capability.recipient_id,
        JSON.stringify({
          to: capability.sender_email,
          recipientName: capability.recipient_name,
          documentTitle: capability.title,
          senderName: capability.sender_name,
          senderEmail: capability.sender_email,
          message: reason,
          expiresAt: null,
        }),
      ],
    );
  }

  private audit(
    client: PoolClient,
    documentId: number,
    recipientId: number,
    eventType: string,
    description: string,
    audit: PublicSigningAudit,
  ): Promise<unknown> {
    return client.query(
      `INSERT INTO signature_audit_log
         (document_id,recipient_id,event_type,description,ip_address,user_agent,
          metadata,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,CURRENT_TIMESTAMP)`,
      [
        documentId,
        recipientId,
        eventType,
        description,
        audit.ipAddress,
        audit.userAgent,
        JSON.stringify({
          actor_class: 'signing_capability',
          request_id: audit.requestId,
          version: 1,
        }),
      ],
    );
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
