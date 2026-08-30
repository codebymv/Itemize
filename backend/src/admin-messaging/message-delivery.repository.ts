import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { NotificationsService } from '../notifications/notifications.service';

export type MessageDeliveryKind =
  | 'contact_email'
  | 'contact_sms'
  | 'test_email'
  | 'test_sms';

export type MessageDeliveryPayload = {
  to: string;
  from: string;
  subject?: string;
  html?: string;
  text?: string | null;
  replyTo?: string | null;
  message?: string;
  segments?: number;
  templateName?: string | null;
};

export type MessageDeliveryJobRow = {
  id: number;
  organization_id: number;
  requested_by_user_id: number | null;
  idempotency_key: string;
  request_fingerprint: string;
  kind: MessageDeliveryKind;
  channel: 'email' | 'sms';
  contact_id: number | null;
  email_template_id: number | null;
  sms_template_id: number | null;
  conversation_id: number | null;
  message_id: number | null;
  payload: MessageDeliveryPayload;
  status: string;
  attempt_count: number;
  provider_id: string | null;
  last_error: string | null;
  created_at: Date;
};

export type DeliveryContact = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  custom_fields: Record<string, unknown> | null;
  email_unsubscribed: boolean;
  email_bounced: boolean;
};

export type DeliveryEmailTemplate = {
  id: number;
  name: string;
  subject: string;
  preheader?: string | null;
  body_html: string;
  body_text: string | null;
};

export type DeliverySmsTemplate = {
  id: number;
  name: string;
  message: string;
};

type EnqueueBase = {
  organizationId: number;
  userId: number;
  idempotencyKey: string;
  fingerprint: string;
};

export type Prepared =
  | { kind: 'created' | 'replayed'; job: MessageDeliveryJobRow }
  | { kind: 'key_conflict' | 'contact_not_found' | 'template_not_found' }
  | { kind: 'missing_email' | 'email_suppressed' | 'missing_phone' }
  | { kind: 'usage_exhausted' };

type JobInsert = {
  kind: MessageDeliveryKind;
  channel: 'email' | 'sms';
  contactId: number | null;
  emailTemplateId: number | null;
  smsTemplateId: number | null;
  payload: MessageDeliveryPayload;
};

const selection = `
  id, organization_id, requested_by_user_id, idempotency_key,
  request_fingerprint, kind, channel, contact_id, email_template_id,
  sms_template_id, conversation_id, message_id, payload, status, attempt_count,
  provider_id, last_error,
  created_at`;

@Injectable()
export class MessageDeliveryRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly notifications: NotificationsService,
  ) {}

  enqueueContactEmail(
    input: EnqueueBase & { contactId: number; templateId?: number | null },
    build: (
      contact: DeliveryContact,
      template: DeliveryEmailTemplate | null,
      organizationName: string,
    ) => MessageDeliveryPayload,
  ): Promise<Prepared> {
    return this.enqueue(input, async (client) => {
      const contact = await this.contact(client, input.organizationId, input.contactId);
      if (!contact) return { kind: 'contact_not_found' as const };
      if (!contact.email) return { kind: 'missing_email' as const };
      if (contact.email_unsubscribed || contact.email_bounced) {
        return { kind: 'email_suppressed' as const };
      }
      const template = input.templateId
        ? await this.emailTemplate(client, input.organizationId, input.templateId)
        : null;
      if (input.templateId && !template) return { kind: 'template_not_found' as const };
      const organizationName = await this.organizationName(client, input.organizationId);
      return {
        kind: 'ready' as const,
        job: {
          kind: 'contact_email' as const,
          channel: 'email' as const,
          contactId: contact.id,
          emailTemplateId: template?.id ?? null,
          smsTemplateId: null,
          payload: build(contact, template, organizationName),
        },
      };
    });
  }

  enqueueContactSms(
    input: EnqueueBase & { contactId: number; templateId?: number | null },
    build: (
      contact: DeliveryContact,
      template: DeliverySmsTemplate | null,
    ) => MessageDeliveryPayload,
  ): Promise<Prepared> {
    return this.enqueue(input, async (client) => {
      const contact = await this.contact(client, input.organizationId, input.contactId);
      if (!contact) return { kind: 'contact_not_found' as const };
      if (!contact.phone) return { kind: 'missing_phone' as const };
      const template = input.templateId
        ? await this.smsTemplate(client, input.organizationId, input.templateId)
        : null;
      if (input.templateId && !template) return { kind: 'template_not_found' as const };
      return {
        kind: 'ready' as const,
        job: {
          kind: 'contact_sms' as const,
          channel: 'sms' as const,
          contactId: contact.id,
          emailTemplateId: null,
          smsTemplateId: template?.id ?? null,
          payload: build(contact, template),
        },
      };
    });
  }

  enqueueTestEmail(
    input: EnqueueBase & { templateId: number; useDraft: boolean },
    build: (template: DeliveryEmailTemplate, organizationName: string) => MessageDeliveryPayload,
  ): Promise<Prepared> {
    return this.enqueue(input, async (client) => {
      const template = await this.emailTemplate(
        client, input.organizationId, input.templateId, input.useDraft,
      );
      if (!template) return { kind: 'template_not_found' as const };
      return {
        kind: 'ready' as const,
        job: {
          kind: 'test_email' as const,
          channel: 'email' as const,
          contactId: null,
          emailTemplateId: template.id,
          smsTemplateId: null,
          payload: build(
            template,
            await this.organizationName(client, input.organizationId),
          ),
        },
      };
    });
  }

  enqueueTestSms(
    input: EnqueueBase & { templateId: number },
    build: (template: DeliverySmsTemplate) => MessageDeliveryPayload,
  ): Promise<Prepared> {
    return this.enqueue(input, async (client) => {
      const template = await this.smsTemplate(client, input.organizationId, input.templateId);
      if (!template) return { kind: 'template_not_found' as const };
      return {
        kind: 'ready' as const,
        job: {
          kind: 'test_sms' as const,
          channel: 'sms' as const,
          contactId: null,
          emailTemplateId: null,
          smsTemplateId: template.id,
          payload: build(template),
        },
      };
    });
  }

  async dueIds(limit: number): Promise<Array<{ id: number; organizationId: number }>> {
    await this.recoverExpiredClaims();
    const result = await this.pool.query<{ id: number; organization_id: number }>(
      `SELECT id, organization_id
       FROM message_delivery_jobs
       WHERE status IN ('queued', 'retry')
         AND next_attempt_at <= CURRENT_TIMESTAMP
         AND attempt_count < 5
       ORDER BY next_attempt_at, id
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      organizationId: Number(row.organization_id),
    }));
  }

  async claim(organizationId: number, id: number): Promise<MessageDeliveryJobRow | null> {
    const result = await this.pool.query<MessageDeliveryJobRow>(
      `UPDATE message_delivery_jobs
       SET status='processing',
           attempt_count=attempt_count+1,
           lease_expires_at=CURRENT_TIMESTAMP + INTERVAL '2 minutes',
           claimed_by=$3,
           updated_at=CURRENT_TIMESTAMP
       WHERE organization_id=$1 AND id=$2
         AND status IN ('queued', 'retry')
         AND next_attempt_at <= CURRENT_TIMESTAMP
       RETURNING ${selection}`,
      [organizationId, id, randomUUID()],
    );
    return result.rows[0] ?? null;
  }

  async find(organizationId: number, id: number): Promise<MessageDeliveryJobRow | null> {
    const result = await this.pool.query<MessageDeliveryJobRow>(
      `SELECT ${selection} FROM message_delivery_jobs
       WHERE organization_id=$1 AND id=$2`,
      [organizationId, id],
    );
    return result.rows[0] ?? null;
  }

  complete(
    organizationId: number,
    id: number,
    providerId: string,
  ): Promise<MessageDeliveryJobRow> {
    return this.transaction(async (client) => {
      const current = await client.query<MessageDeliveryJobRow>(
        `SELECT ${selection} FROM message_delivery_jobs
         WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
        [organizationId, id],
      );
      const job = current.rows[0];
      if (!job) throw new Error('Message delivery disappeared');
      if (job.status === 'provider_accepted') return job;
      if (job.status !== 'processing') throw new Error('Message delivery claim was lost');

      let emailLogId: number | null = null;
      let smsLogId: number | null = null;
      let activityId: number | null = null;
      if (job.contact_id && job.kind === 'contact_email') {
        const email = await client.query<{ id: number }>(
          `INSERT INTO email_logs (
             organization_id, contact_id, template_id, to_email, from_email,
             subject, body_html, status, external_id, metadata, sent_at, sent_by
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,'sent',$8,$9::jsonb,CURRENT_TIMESTAMP,$10
           ) RETURNING id`,
          [
            organizationId,
            job.contact_id,
            job.email_template_id,
            job.payload.to,
            job.payload.from,
            job.payload.subject,
            job.payload.html,
            providerId,
            JSON.stringify({
              message_delivery_job_id: Number(job.id),
              idempotency_key: job.idempotency_key,
            }),
            job.requested_by_user_id,
          ],
        );
        emailLogId = Number(email.rows[0].id);
        activityId = await this.insertActivity(client, job, providerId, {
          subject: job.payload.subject,
        });
      }
      if (job.contact_id && job.kind === 'contact_sms') {
        const sms = await client.query<{ id: number }>(
          `INSERT INTO sms_logs (
             organization_id, contact_id, template_id, to_phone, from_phone,
             message, direction, status, external_id, segments, metadata, sent_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,'outbound','sent',$7,$8,$9::jsonb,CURRENT_TIMESTAMP
           ) RETURNING id`,
          [
            organizationId,
            job.contact_id,
            job.sms_template_id,
            job.payload.to,
            job.payload.from,
            job.payload.message,
            providerId,
            job.payload.segments ?? 1,
            JSON.stringify({
              message_delivery_job_id: Number(job.id),
              idempotency_key: job.idempotency_key,
            }),
          ],
        );
        smsLogId = Number(sms.rows[0].id);
        activityId = await this.insertActivity(client, job, providerId, {
          description: job.payload.templateName
            ? `Sent SMS using template "${job.payload.templateName}"`
            : 'Sent SMS message',
        });
      }

      if (job.message_id) {
        await client.query(
          `UPDATE messages
           SET metadata=COALESCE(metadata, '{}'::jsonb) || $3::jsonb
           WHERE organization_id=$1 AND id=$2`,
          [
            organizationId,
            job.message_id,
            JSON.stringify({
              delivery_status: 'sent',
              provider_id: providerId,
              email_log_id: emailLogId,
              sms_log_id: smsLogId,
            }),
          ],
        );
      }

      const updated = await client.query<MessageDeliveryJobRow>(
        `UPDATE message_delivery_jobs
         SET status='provider_accepted', provider_id=$3, email_log_id=$4,
             sms_log_id=$5, contact_activity_id=$6,
             accepted_at=CURRENT_TIMESTAMP, lease_expires_at=NULL,
             claimed_by=NULL, last_error=NULL, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2
         RETURNING ${selection}`,
        [organizationId, id, providerId, emailLogId, smsLogId, activityId],
      );
      return updated.rows[0];
    });
  }

  async fail(
    organizationId: number,
    id: number,
    message: string,
    retryable: boolean,
  ): Promise<MessageDeliveryJobRow> {
    return this.transaction(async (client) => {
      const found = await client.query<MessageDeliveryJobRow>(
        `SELECT ${selection} FROM message_delivery_jobs
         WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
        [organizationId, id],
      );
      const current = found.rows[0];
      if (!current) throw new Error('Message delivery disappeared');
      const retry = retryable && current.channel === 'email' && current.attempt_count < 5;
      const delaySeconds = Math.min(300, 5 * (2 ** Math.max(0, current.attempt_count - 1)));
      const result = await client.query<MessageDeliveryJobRow>(
        `UPDATE message_delivery_jobs
         SET status=$3::varchar,
             next_attempt_at=CASE WHEN $3::varchar='retry'
               THEN CURRENT_TIMESTAMP + ($4::int * INTERVAL '1 second')
               ELSE next_attempt_at END,
             lease_expires_at=NULL, claimed_by=NULL, last_error=$5,
             updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2 AND status='processing'
         RETURNING ${selection}`,
        [organizationId, id, retry ? 'retry' : 'dead_letter', delaySeconds, message],
      );
      const updated = result.rows[0] ?? current;
      if (updated.message_id) {
        await client.query(
          `UPDATE messages
           SET metadata=COALESCE(metadata, '{}'::jsonb) || $3::jsonb
           WHERE organization_id=$1 AND id=$2`,
          [
            organizationId,
            updated.message_id,
            JSON.stringify({
              delivery_status: updated.status === 'retry' ? 'retrying' : 'failed',
              delivery_error: message,
            }),
          ],
        );
      }
      if (updated.status === 'dead_letter') {
        await this.notifyDeliveryAttention(client, updated, 'failed');
      }
      return updated;
    });
  }

  async reconciliation(
    organizationId: number,
    id: number,
    message: string,
  ): Promise<MessageDeliveryJobRow> {
    return this.transaction(async (client) => {
      const result = await client.query<MessageDeliveryJobRow>(
        `UPDATE message_delivery_jobs
         SET status='reconciliation_required', lease_expires_at=NULL,
             claimed_by=NULL, last_error=$3, updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2 AND status='processing'
         RETURNING ${selection}`,
        [organizationId, id, message],
      );
      const current = result.rows[0] ?? (await client.query<MessageDeliveryJobRow>(
        `SELECT ${selection} FROM message_delivery_jobs
         WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
        [organizationId, id],
      )).rows[0];
      if (!current) throw new Error('Message delivery disappeared');
      if (current.message_id) {
        await client.query(
          `UPDATE messages
           SET metadata=COALESCE(metadata, '{}'::jsonb) || $3::jsonb
           WHERE organization_id=$1 AND id=$2`,
          [
            organizationId,
            current.message_id,
            JSON.stringify({
              delivery_status: 'needs_review',
              delivery_error: message,
            }),
          ],
        );
      }
      if (current.status === 'reconciliation_required') {
        await this.notifyDeliveryAttention(client, current, 'needs review');
      }
      return current;
    });
  }

  private async notifyDeliveryAttention(
    client: PoolClient,
    job: MessageDeliveryJobRow,
    state: 'failed' | 'needs review',
  ): Promise<void> {
    if (!job.conversation_id || !job.message_id || !job.contact_id) return;
    const contact = await client.query<{
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
    }>(
      `SELECT first_name,last_name,email,phone FROM contacts
       WHERE organization_id=$1 AND id=$2`,
      [job.organization_id, job.contact_id],
    );
    const row = contact.rows[0];
    const name = [row?.first_name, row?.last_name].filter(Boolean).join(' ')
      || row?.email
      || row?.phone
      || 'a contact';
    await this.notifications.createForOrganizationOwnerWithClient(client, {
      organizationId: job.organization_id,
      preferredUserId: job.requested_by_user_id,
      actorUserId: job.requested_by_user_id,
      eventType: 'communication.delivery_failed',
      entityType: 'conversation',
      entityId: job.conversation_id,
      dedupeKey: `communication:delivery:${job.id}:attention`,
      payload: {
        channel: job.channel,
        conversationId: job.conversation_id,
        messageId: job.message_id,
        deliveryJobId: Number(job.id),
        state,
      },
      category: 'business',
      priority: 'high',
      title: `${job.channel === 'email' ? 'Email' : 'SMS'} delivery ${state === 'failed' ? 'failed' : 'needs review'}`,
      body: `Your message to ${name} ${state === 'failed' ? 'could not be delivered' : 'needs review'}.`,
      href: `/inbox?conversation=${job.conversation_id}`,
    });
  }

  private async enqueue(
    input: EnqueueBase,
    prepare: (
      client: PoolClient,
    ) => Promise<
      | { kind: 'ready'; job: JobInsert }
      | Exclude<Prepared, { kind: 'created' | 'replayed' | 'key_conflict' }>
    >,
  ): Promise<Prepared> {
    return this.transaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock($1::int, hashtext($2))',
        [input.organizationId, `message-delivery:${input.idempotencyKey}`],
      );
      const existing = await client.query<MessageDeliveryJobRow>(
        `SELECT ${selection} FROM message_delivery_jobs
         WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE`,
        [input.organizationId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        return existing.rows[0].request_fingerprint === input.fingerprint
          ? { kind: 'replayed', job: existing.rows[0] }
          : { kind: 'key_conflict' };
      }
      const prepared = await prepare(client);
      if (prepared.kind !== 'ready') return prepared;
      const job = prepared.job;
      if (
        (job.kind === 'contact_email' || job.kind === 'contact_sms') &&
        !(await this.reserveUsage(client, input.organizationId, job.channel))
      ) {
        return { kind: 'usage_exhausted' };
      }
      const inserted = await client.query<MessageDeliveryJobRow>(
        `INSERT INTO message_delivery_jobs (
           organization_id, requested_by_user_id, idempotency_key,
           request_fingerprint, kind, channel, contact_id, email_template_id,
           sms_template_id, payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
         RETURNING ${selection}`,
        [
          input.organizationId,
          input.userId,
          input.idempotencyKey,
          input.fingerprint,
          job.kind,
          job.channel,
          job.contactId,
          job.emailTemplateId,
          job.smsTemplateId,
          JSON.stringify(job.payload),
        ],
      );
      const tracked = await this.trackContactDelivery(
        client,
        inserted.rows[0],
      );
      return { kind: 'created', job: tracked };
    });
  }

  private async trackContactDelivery(
    client: PoolClient,
    job: MessageDeliveryJobRow,
  ): Promise<MessageDeliveryJobRow> {
    if (!job.contact_id || (job.kind !== 'contact_email' && job.kind !== 'contact_sms')) {
      return job;
    }

    await client.query(
      'SELECT pg_advisory_xact_lock($1::int, hashtext($2))',
      [job.organization_id, `conversation:${job.contact_id}:${job.channel}`],
    );
    const existing = await client.query<{ id: number }>(
      `SELECT id
       FROM conversations
       WHERE organization_id=$1 AND contact_id=$2 AND channel=$3 AND status='open'
       ORDER BY last_message_at DESC NULLS LAST, id DESC
       LIMIT 1
       FOR UPDATE`,
      [job.organization_id, job.contact_id, job.channel],
    );
    const content = job.channel === 'email'
      ? (job.payload.text?.trim() || job.payload.subject || 'Email')
      : (job.payload.message?.trim() || 'SMS message');
    let conversationId = existing.rows[0]?.id;
    if (!conversationId) {
      const created = await client.query<{ id: number }>(
        `INSERT INTO conversations (
           organization_id, contact_id, assigned_to, channel, subject,
           last_message_at, last_message_preview, status
         ) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,$6,'open')
         RETURNING id`,
        [
          job.organization_id,
          job.contact_id,
          job.requested_by_user_id,
          job.channel,
          job.payload.subject ?? null,
          content.slice(0, 200),
        ],
      );
      conversationId = Number(created.rows[0].id);
    } else {
      await client.query(
        `UPDATE conversations
         SET assigned_to=COALESCE(assigned_to,$3),
             subject=COALESCE(subject,$4),
             last_message_at=CURRENT_TIMESTAMP,
             last_message_preview=$5,
             updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND id=$2`,
        [
          job.organization_id,
          conversationId,
          job.requested_by_user_id,
          job.payload.subject ?? null,
          content.slice(0, 200),
        ],
      );
    }

    const message = await client.query<{ id: number }>(
      `INSERT INTO messages (
         conversation_id, organization_id, sender_type, sender_user_id,
         channel, content, content_html, metadata, is_read
       ) VALUES ($1,$2,'user',$3,$4,$5,$6,$7::jsonb,TRUE)
       RETURNING id`,
      [
        conversationId,
        job.organization_id,
        job.requested_by_user_id,
        job.channel,
        content,
        job.channel === 'email' ? job.payload.html ?? null : null,
        JSON.stringify({
          message_delivery_job_id: Number(job.id),
          delivery_status: 'queued',
          to: job.payload.to,
          from: job.payload.from,
          subject: job.payload.subject ?? null,
          template_name: job.payload.templateName ?? null,
        }),
      ],
    );
    const linked = await client.query<MessageDeliveryJobRow>(
      `UPDATE message_delivery_jobs
       SET conversation_id=$3, message_id=$4, updated_at=CURRENT_TIMESTAMP
       WHERE organization_id=$1 AND id=$2
       RETURNING ${selection}`,
      [job.organization_id, job.id, conversationId, message.rows[0].id],
    );
    return linked.rows[0];
  }

  private async contact(
    client: PoolClient,
    organizationId: number,
    contactId: number,
  ): Promise<DeliveryContact | null> {
    const result = await client.query<DeliveryContact>(
      `SELECT id, first_name, last_name, email, phone, company, job_title,
              custom_fields, COALESCE(email_unsubscribed, false) AS email_unsubscribed,
              COALESCE(email_bounced, false) AS email_bounced
       FROM contacts
       WHERE organization_id=$1 AND id=$2
       FOR KEY SHARE`,
      [organizationId, contactId],
    );
    return result.rows[0] ?? null;
  }

  private async emailTemplate(
    client: PoolClient,
    organizationId: number,
    templateId: number,
    useDraft = false,
  ): Promise<DeliveryEmailTemplate | null> {
    const result = await client.query<DeliveryEmailTemplate>(
      `SELECT template.id, template.name,
              CASE WHEN $3 THEN draft.subject ELSE template.subject END AS subject,
              CASE WHEN $3 THEN draft.preheader ELSE template.preheader END AS preheader,
              CASE WHEN $3 THEN draft.body_html ELSE template.body_html END AS body_html,
              CASE WHEN $3 THEN draft.body_text ELSE template.body_text END AS body_text
       FROM email_templates template
       LEFT JOIN email_template_versions draft
         ON draft.id=template.draft_version_id
        AND draft.organization_id=template.organization_id
        AND draft.state='draft'
       WHERE template.organization_id=$1 AND template.id=$2
         AND ($3=FALSE OR draft.id IS NOT NULL)
       FOR KEY SHARE OF template`,
      [organizationId, templateId, useDraft],
    );
    return result.rows[0] ?? null;
  }

  private async smsTemplate(
    client: PoolClient,
    organizationId: number,
    templateId: number,
  ): Promise<DeliverySmsTemplate | null> {
    const result = await client.query<DeliverySmsTemplate>(
      `SELECT id, name, message
       FROM sms_templates
       WHERE organization_id=$1 AND id=$2
       FOR KEY SHARE`,
      [organizationId, templateId],
    );
    return result.rows[0] ?? null;
  }

  private async organizationName(
    client: PoolClient,
    organizationId: number,
  ): Promise<string> {
    const result = await client.query<{ name: string }>(
      'SELECT name FROM organizations WHERE id=$1',
      [organizationId],
    );
    return result.rows[0]?.name || 'Itemize';
  }

  private async reserveUsage(
    client: PoolClient,
    organizationId: number,
    channel: 'email' | 'sms',
  ): Promise<boolean> {
    const usedColumn = channel === 'email' ? 'emails_used' : 'sms_used';
    const limitColumn = channel === 'email' ? 'emails_limit' : 'sms_limit';
    const result = await client.query(
      `UPDATE organizations
       SET ${usedColumn}=COALESCE(${usedColumn}, 0)+1
       WHERE id=$1
         AND (
           COALESCE(${limitColumn}, -1)=-1
           OR COALESCE(${usedColumn}, 0) < ${limitColumn}
         )
       RETURNING id`,
      [organizationId],
    );
    return result.rowCount === 1;
  }

  private async insertActivity(
    client: PoolClient,
    job: MessageDeliveryJobRow,
    providerId: string,
    content: Record<string, unknown>,
  ): Promise<number> {
    const result = await client.query<{ id: number }>(
      `INSERT INTO contact_activities (
         contact_id, user_id, type, title, content, metadata
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)
       RETURNING id`,
      [
        job.contact_id,
        job.requested_by_user_id,
        job.channel,
        job.channel === 'email' ? 'Email sent' : 'SMS sent',
        JSON.stringify(content),
        JSON.stringify({
          template_id: job.email_template_id ?? job.sms_template_id,
          provider_id: providerId,
          message_delivery_job_id: Number(job.id),
        }),
      ],
    );
    return Number(result.rows[0].id);
  }

  private async recoverExpiredClaims(): Promise<void> {
    await this.pool.query(
      `UPDATE message_delivery_jobs
       SET status=CASE WHEN channel='email' THEN 'retry'
                       ELSE 'reconciliation_required' END,
           next_attempt_at=CASE WHEN channel='email' THEN CURRENT_TIMESTAMP
                                ELSE next_attempt_at END,
           lease_expires_at=NULL, claimed_by=NULL,
           last_error=CASE WHEN channel='email'
             THEN 'Recovered expired provider-safe email claim'
             ELSE 'Expired SMS claim requires provider reconciliation' END,
           updated_at=CURRENT_TIMESTAMP
       WHERE status='processing' AND lease_expires_at < CURRENT_TIMESTAMP`,
    );
  }

  private async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
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
