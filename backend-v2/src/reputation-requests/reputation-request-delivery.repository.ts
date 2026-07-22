import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type ReputationDeliveryChannel = 'email' | 'sms';
export type ReputationRequestChannel = ReputationDeliveryChannel | 'both';

export type NormalizedSendRequest = {
  idempotencyKey: string; fingerprint: string; contactId: number | null;
  contactEmail: string | null; contactPhone: string | null; contactName: string | null;
  channel: ReputationRequestChannel; customMessage: string | null;
  preferredPlatform: string | null; redirectUrl: string | null; scheduledAt: Date | null;
};

export type NormalizedBulkRequest = {
  idempotencyKey: string; fingerprint: string; contactIds: number[];
  channel: ReputationRequestChannel; customMessage: string | null;
  preferredPlatform: string | null;
};

export type ReputationDeliveryBatchRow = {
  id: number; organization_id: number; requested_by_user_id: number | null;
  idempotency_key: string; operation: 'send' | 'bulk' | 'resend';
  input_fingerprint: string; status: string; completed_at: Date | null;
  created_at: Date; updated_at: Date;
};

export type ReputationDeliveryPayload = { message: string };

export type ReputationDeliveryRow = {
  id: number; batch_id: number; organization_id: number; review_request_id: number;
  channel: ReputationDeliveryChannel; recipient: string; subject: string | null;
  payload: ReputationDeliveryPayload; status: string; attempt_count: number;
  next_attempt_at: Date; lease_expires_at: Date | null; claimed_by: string | null;
  provider_id: string | null; last_error: string | null; sent_at: Date | null;
  created_at: Date; updated_at: Date;
};

export type ReputationDeliverySnapshot = {
  batch: ReputationDeliveryBatchRow;
  deliveries: ReputationDeliveryRow[];
};

export type ReputationDeliveryPreparation =
  | { kind: 'created' | 'replayed'; snapshot: ReputationDeliverySnapshot }
  | { kind: 'key_conflict' }
  | { kind: 'contact_not_found'; contactIds: number[] }
  | { kind: 'missing_recipient'; contactIds: Array<number | null>; channel: ReputationDeliveryChannel }
  | { kind: 'request_not_found' }
  | { kind: 'invalid_state'; status: string }
  | { kind: 'delivery_in_progress' };

type ContactRow = {
  id: number; email: string | null; phone: string | null;
  first_name: string | null; last_name: string | null;
};

@Injectable()
export class ReputationRequestDeliveryRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async prepareSend(
    organizationId: number,
    userId: number,
    input: NormalizedSendRequest,
  ): Promise<ReputationDeliveryPreparation> {
    return this.transaction(async (client) => {
      await this.idempotencyLock(client, organizationId, input.idempotencyKey);
      const prior = await this.existing(client, organizationId, input.idempotencyKey, 'send', input.fingerprint);
      if (prior) return prior;

      let contact: ContactRow | null = null;
      if (input.contactId !== null) {
        const result = await client.query<ContactRow>(
          `SELECT id,email,phone,first_name,last_name FROM contacts
           WHERE id=$1 AND organization_id=$2 FOR SHARE`,
          [input.contactId, organizationId],
        );
        contact = result.rows[0] ?? null;
        if (!contact) return { kind: 'contact_not_found', contactIds: [input.contactId] };
      }
      const email = this.email(input.contactEmail ?? contact?.email ?? null);
      const phone = this.phone(input.contactPhone ?? contact?.phone ?? null);
      const name = input.contactName ?? this.contactName(contact);
      const missing = this.missingRecipient(input.channel, email, phone);
      if (missing) return { kind: 'missing_recipient', contactIds: [input.contactId], channel: missing };

      const context = await this.context(client, organizationId);
      const batch = await this.insertBatch(client, organizationId, userId, input.idempotencyKey, 'send', input.fingerprint);
      const token = randomBytes(32).toString('hex');
      const request = await this.insertRequest(client, {
        organizationId, contactId: input.contactId, email, phone, name,
        channel: input.channel, customMessage: input.customMessage,
        preferredPlatform: input.preferredPlatform,
        redirectUrl: input.redirectUrl ?? context.redirectUrl,
        scheduledAt: input.scheduledAt, token,
      });
      await this.insertDeliveries(client, batch.id, request.id, organizationId, {
        channel: input.channel, email, phone,
        message: this.message(input.customMessage, name, context.organizationName, token),
        organizationName: context.organizationName,
        nextAttemptAt: input.scheduledAt,
      });
      return { kind: 'created', snapshot: await this.requiredSnapshot(client, organizationId, batch.id) };
    });
  }

  async prepareBulk(
    organizationId: number,
    userId: number,
    input: NormalizedBulkRequest,
  ): Promise<ReputationDeliveryPreparation> {
    return this.transaction(async (client) => {
      await this.idempotencyLock(client, organizationId, input.idempotencyKey);
      const prior = await this.existing(client, organizationId, input.idempotencyKey, 'bulk', input.fingerprint);
      if (prior) return prior;
      const contacts = await client.query<ContactRow>(
        `SELECT id,email,phone,first_name,last_name FROM contacts
         WHERE id=ANY($1::int[]) AND organization_id=$2 FOR SHARE`,
        [input.contactIds, organizationId],
      );
      const byId = new Map(contacts.rows.map((contact) => [Number(contact.id), contact]));
      const missingIds = input.contactIds.filter((id) => !byId.has(id));
      if (missingIds.length) return { kind: 'contact_not_found', contactIds: missingIds };
      for (const id of input.contactIds) {
        const contact = byId.get(id)!;
        const missing = this.missingRecipient(
          input.channel, this.email(contact.email), this.phone(contact.phone),
        );
        if (missing) return { kind: 'missing_recipient', contactIds: [id], channel: missing };
      }

      const context = await this.context(client, organizationId);
      const batch = await this.insertBatch(client, organizationId, userId, input.idempotencyKey, 'bulk', input.fingerprint);
      for (const id of input.contactIds) {
        const contact = byId.get(id)!;
        const name = this.contactName(contact);
        const token = randomBytes(32).toString('hex');
        const email = this.email(contact.email);
        const phone = this.phone(contact.phone);
        const request = await this.insertRequest(client, {
          organizationId, contactId: id, email, phone, name,
          channel: input.channel, customMessage: input.customMessage,
          preferredPlatform: input.preferredPlatform, redirectUrl: context.redirectUrl,
          scheduledAt: null, token,
        });
        await this.insertDeliveries(client, batch.id, request.id, organizationId, {
          channel: input.channel, email, phone,
          message: this.message(input.customMessage, name, context.organizationName, token),
          organizationName: context.organizationName, nextAttemptAt: null,
        });
      }
      return { kind: 'created', snapshot: await this.requiredSnapshot(client, organizationId, batch.id) };
    });
  }

  async prepareResend(
    organizationId: number,
    userId: number,
    requestId: number,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<ReputationDeliveryPreparation> {
    return this.transaction(async (client) => {
      await this.idempotencyLock(client, organizationId, idempotencyKey);
      const prior = await this.existing(client, organizationId, idempotencyKey, 'resend', fingerprint);
      if (prior) return prior;
      const found = await client.query<{
        id: number; channel: ReputationRequestChannel; contact_email: string | null;
        contact_phone: string | null; contact_name: string | null; custom_message: string | null;
        unique_token: string; status: string;
      }>(
        `SELECT id,channel,contact_email,contact_phone,contact_name,custom_message,unique_token,status
         FROM review_requests WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
        [requestId, organizationId],
      );
      const request = found.rows[0];
      if (!request) return { kind: 'request_not_found' };
      if (['completed', 'unsubscribed'].includes(request.status)) {
        return { kind: 'invalid_state', status: request.status };
      }
      const active = await client.query(
        `SELECT 1 FROM review_request_deliveries
         WHERE organization_id=$1 AND review_request_id=$2
           AND status IN ('queued','processing','retry','reconciliation_required') LIMIT 1`,
        [organizationId, requestId],
      );
      if (active.rows[0]) return { kind: 'delivery_in_progress' };
      const missing = this.missingRecipient(request.channel, request.contact_email, request.contact_phone);
      if (missing) return { kind: 'missing_recipient', contactIds: [null], channel: missing };

      const context = await this.context(client, organizationId);
      const batch = await this.insertBatch(client, organizationId, userId, idempotencyKey, 'resend', fingerprint);
      await this.insertDeliveries(client, batch.id, request.id, organizationId, {
        channel: request.channel, email: request.contact_email, phone: request.contact_phone,
        message: this.message(request.custom_message, request.contact_name, context.organizationName, request.unique_token),
        organizationName: context.organizationName, nextAttemptAt: null,
      });
      await client.query(
        `UPDATE review_requests SET status=CASE WHEN status IN ('clicked','opened') THEN status ELSE 'pending' END,
           updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND organization_id=$2`,
        [requestId, organizationId],
      );
      return { kind: 'created', snapshot: await this.requiredSnapshot(client, organizationId, batch.id) };
    });
  }

  async findSnapshot(organizationId: number, batchId: number): Promise<ReputationDeliverySnapshot | null> {
    const client = await this.pool.connect();
    try { return await this.snapshot(client, organizationId, batchId, true); }
    finally { client.release(); }
  }

  async due(limit: number): Promise<Array<{ id: number; organizationId: number }>> {
    const result = await this.pool.query<{ id: number; organization_id: number }>(
      `SELECT id,organization_id FROM review_request_deliveries
       WHERE (status IN ('queued','retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
          OR (status='processing' AND lease_expires_at <= CURRENT_TIMESTAMP)
       ORDER BY next_attempt_at,id LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({ id: Number(row.id), organizationId: Number(row.organization_id) }));
  }

  async claim(organizationId: number, deliveryId: number): Promise<ReputationDeliveryRow | null> {
    return this.transaction(async (client) => {
      const result = await client.query<ReputationDeliveryRow>(
        `UPDATE review_request_deliveries SET status='processing',attempt_count=attempt_count+1,
           lease_expires_at=CURRENT_TIMESTAMP + INTERVAL '30 seconds',claimed_by=$3,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2 AND (
           (status IN ('queued','retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
           OR (status='processing' AND lease_expires_at <= CURRENT_TIMESTAMP)
         ) RETURNING *`,
        [deliveryId, organizationId, `nest:${process.pid}`],
      );
      if (result.rows[0]) {
        await client.query(
          `UPDATE review_request_delivery_batches SET status='processing',updated_at=CURRENT_TIMESTAMP
           WHERE id=$1 AND status='queued'`,
          [result.rows[0].batch_id],
        );
      }
      return result.rows[0] ?? null;
    });
  }

  async complete(organizationId: number, deliveryId: number, providerId: string | null): Promise<void> {
    await this.transaction(async (client) => {
      const updated = await client.query<{ batch_id: number; review_request_id: number; channel: ReputationDeliveryChannel }>(
        `UPDATE review_request_deliveries SET status='sent',provider_id=$3,
           sent_at=COALESCE(sent_at,CURRENT_TIMESTAMP),last_error=NULL,
           lease_expires_at=NULL,claimed_by=NULL,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2 AND status='processing'
         RETURNING batch_id,review_request_id,channel`,
        [deliveryId, organizationId, providerId],
      );
      const row = updated.rows[0];
      if (!row) return;
      await client.query(
        `UPDATE review_requests SET
           email_sent=CASE WHEN $3='email' THEN TRUE ELSE email_sent END,
           email_sent_at=CASE WHEN $3='email' THEN COALESCE(email_sent_at,CURRENT_TIMESTAMP) ELSE email_sent_at END,
           sms_sent=CASE WHEN $3='sms' THEN TRUE ELSE sms_sent END,
           sms_sent_at=CASE WHEN $3='sms' THEN COALESCE(sms_sent_at,CURRENT_TIMESTAMP) ELSE sms_sent_at END,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2`,
        [row.review_request_id, organizationId, row.channel],
      );
      await this.finalize(client, Number(row.batch_id), Number(row.review_request_id));
    });
  }

  async fail(organizationId: number, deliveryId: number, error: string, ambiguous: boolean): Promise<void> {
    await this.transaction(async (client) => {
      const updated = await client.query<{ batch_id: number; review_request_id: number }>(
        `UPDATE review_request_deliveries SET
           status=CASE WHEN $3::boolean THEN 'reconciliation_required'
             WHEN attempt_count >= 5 THEN 'dead_letter' ELSE 'retry' END,
           next_attempt_at=CURRENT_TIMESTAMP +
             (LEAST(300,POWER(2,GREATEST(attempt_count-1))) * INTERVAL '1 second'),
           last_error=LEFT($4,2000),lease_expires_at=NULL,claimed_by=NULL,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2 AND status='processing'
         RETURNING batch_id,review_request_id`,
        [deliveryId, organizationId, ambiguous, error],
      );
      const row = updated.rows[0];
      if (row) await this.finalize(client, Number(row.batch_id), Number(row.review_request_id));
    });
  }

  private async finalize(client: PoolClient, batchId: number, requestId: number): Promise<void> {
    const requestCounts = await client.query<{ active: number; ambiguous: number; failed: number; total: number; sent: number }>(
      `SELECT COUNT(*)::int total,
         COUNT(*) FILTER (WHERE status IN ('queued','processing','retry'))::int active,
         COUNT(*) FILTER (WHERE status='reconciliation_required')::int ambiguous,
         COUNT(*) FILTER (WHERE status='dead_letter')::int failed,
         COUNT(*) FILTER (WHERE status='sent')::int sent
       FROM review_request_deliveries WHERE batch_id=$1 AND review_request_id=$2`,
      [batchId, requestId],
    );
    const request = requestCounts.rows[0];
    const status = Number(request.active) > 0 ? 'pending'
      : Number(request.ambiguous) > 0 || Number(request.failed) > 0 ? 'failed'
        : Number(request.sent) === Number(request.total) && Number(request.total) > 0 ? 'sent' : 'failed';
    await client.query(
      `UPDATE review_requests SET status=CASE
         WHEN status IN ('completed','unsubscribed','clicked','opened') THEN status ELSE $3 END,
         updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND organization_id=$2`,
      [requestId, (await this.batchOrganization(client, batchId)), status],
    );

    const batchCounts = await client.query<{ active: number; ambiguous: number; failed: number; total: number; sent: number }>(
      `SELECT COUNT(*)::int total,
         COUNT(*) FILTER (WHERE status IN ('queued','processing','retry'))::int active,
         COUNT(*) FILTER (WHERE status='reconciliation_required')::int ambiguous,
         COUNT(*) FILTER (WHERE status='dead_letter')::int failed,
         COUNT(*) FILTER (WHERE status='sent')::int sent
       FROM review_request_deliveries WHERE batch_id=$1`,
      [batchId],
    );
    const batch = batchCounts.rows[0];
    const batchStatus = Number(batch.active) > 0 ? 'processing'
      : Number(batch.ambiguous) > 0 ? 'reconciliation_required'
        : Number(batch.failed) > 0 ? 'failed'
          : Number(batch.sent) === Number(batch.total) && Number(batch.total) > 0 ? 'sent' : 'failed';
    await client.query(
      `UPDATE review_request_delivery_batches SET status=$2::varchar,
         completed_at=CASE WHEN $2::text='processing' THEN NULL ELSE CURRENT_TIMESTAMP END,
         updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [batchId, batchStatus],
    );
  }

  private async batchOrganization(client: PoolClient, batchId: number): Promise<number> {
    const result = await client.query<{ organization_id: number }>(
      'SELECT organization_id FROM review_request_delivery_batches WHERE id=$1', [batchId],
    );
    if (!result.rows[0]) throw new Error('Review request delivery batch disappeared');
    return Number(result.rows[0].organization_id);
  }

  private async existing(
    client: PoolClient, organizationId: number, key: string,
    operation: ReputationDeliveryBatchRow['operation'], fingerprint: string,
  ): Promise<ReputationDeliveryPreparation | null> {
    const result = await client.query<ReputationDeliveryBatchRow>(
      `SELECT * FROM review_request_delivery_batches
       WHERE organization_id=$1 AND idempotency_key=$2`,
      [organizationId, key],
    );
    if (!result.rows[0]) return null;
    if (result.rows[0].operation !== operation || result.rows[0].input_fingerprint !== fingerprint) {
      return { kind: 'key_conflict' };
    }
    return { kind: 'replayed', snapshot: await this.requiredSnapshot(client, organizationId, result.rows[0].id) };
  }

  private async requiredSnapshot(
    client: PoolClient, organizationId: number, batchId: number,
  ): Promise<ReputationDeliverySnapshot> {
    const result = await this.snapshot(client, organizationId, batchId);
    if (!result) throw new Error('Review request delivery batch not found');
    return result;
  }

  private async snapshot(
    client: PoolClient, organizationId: number, batchId: number, nullable = false,
  ): Promise<ReputationDeliverySnapshot | null> {
    const batch = await client.query<ReputationDeliveryBatchRow>(
      'SELECT * FROM review_request_delivery_batches WHERE id=$1 AND organization_id=$2',
      [batchId, organizationId],
    );
    if (!batch.rows[0]) {
      if (nullable) return null;
      throw new Error('Review request delivery batch not found');
    }
    const deliveries = await client.query<ReputationDeliveryRow>(
      `SELECT * FROM review_request_deliveries
       WHERE batch_id=$1 AND organization_id=$2 ORDER BY id`,
      [batchId, organizationId],
    );
    return { batch: batch.rows[0], deliveries: deliveries.rows };
  }

  private async insertBatch(
    client: PoolClient, organizationId: number, userId: number, key: string,
    operation: ReputationDeliveryBatchRow['operation'], fingerprint: string,
  ): Promise<ReputationDeliveryBatchRow> {
    const result = await client.query<ReputationDeliveryBatchRow>(
      `INSERT INTO review_request_delivery_batches
       (organization_id,requested_by_user_id,idempotency_key,operation,input_fingerprint)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [organizationId, userId, key, operation, fingerprint],
    );
    return result.rows[0];
  }

  private async insertRequest(client: PoolClient, input: {
    organizationId: number; contactId: number | null; email: string | null;
    phone: string | null; name: string | null; channel: ReputationRequestChannel;
    customMessage: string | null; preferredPlatform: string | null;
    redirectUrl: string | null; scheduledAt: Date | null; token: string;
  }): Promise<{ id: number }> {
    const result = await client.query<{ id: number }>(
      `INSERT INTO review_requests (
         organization_id,contact_id,contact_email,contact_phone,contact_name,channel,
         custom_message,preferred_platform,redirect_url,scheduled_at,unique_token,status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending') RETURNING id`,
      [input.organizationId, input.contactId, input.email, input.phone, input.name,
        input.channel, input.customMessage, input.preferredPlatform, input.redirectUrl,
        input.scheduledAt, input.token],
    );
    return { id: Number(result.rows[0].id) };
  }

  private async insertDeliveries(client: PoolClient, batchId: number, requestId: number, organizationId: number, input: {
    channel: ReputationRequestChannel; email: string | null; phone: string | null;
    message: string; organizationName: string; nextAttemptAt: Date | null;
  }): Promise<void> {
    const channels: Array<{ channel: ReputationDeliveryChannel; recipient: string }> = [];
    if ((input.channel === 'email' || input.channel === 'both') && input.email) {
      channels.push({ channel: 'email', recipient: input.email });
    }
    if ((input.channel === 'sms' || input.channel === 'both') && input.phone) {
      channels.push({ channel: 'sms', recipient: input.phone });
    }
    for (const delivery of channels) {
      await client.query(
        `INSERT INTO review_request_deliveries (
           batch_id,organization_id,review_request_id,channel,recipient,subject,payload,next_attempt_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,COALESCE($8,CURRENT_TIMESTAMP))`,
        [batchId, organizationId, requestId, delivery.channel, delivery.recipient,
          delivery.channel === 'email' ? `We'd love your feedback on ${input.organizationName}`.slice(0, 255) : null,
          JSON.stringify({ message: input.message }), input.nextAttemptAt],
      );
    }
  }

  private async context(client: PoolClient, organizationId: number): Promise<{ organizationName: string; redirectUrl: string | null }> {
    const result = await client.query<{ name: string; default_review_url: string | null }>(
      `SELECT o.name,settings.default_review_url FROM organizations o
       LEFT JOIN reputation_settings settings ON settings.organization_id=o.id
       WHERE o.id=$1`,
      [organizationId],
    );
    if (!result.rows[0]) throw new Error('Organization disappeared');
    return {
      organizationName: result.rows[0].name || 'our business',
      redirectUrl: this.safeUrl(result.rows[0].default_review_url),
    };
  }

  private message(custom: string | null, name: string | null, organization: string, token: string): string {
    const base = custom || `Hi ${name || 'there'},\n\nThank you for choosing ${organization}. We'd love to hear about your experience.`;
    return `${base}\n\nLeave a review: ${this.frontendOrigin()}/review/${token}\n\nThank you!`;
  }

  private frontendOrigin(): string {
    try {
      const url = new URL(process.env.FRONTEND_URL || 'https://itemize.cloud');
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      return url.origin;
    } catch { return 'https://itemize.cloud'; }
  }

  private safeUrl(value: string | null): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        ? url.toString() : null;
    } catch { return null; }
  }

  private contactName(contact: ContactRow | null): string | null {
    if (!contact) return null;
    return [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || null;
  }

  private missingRecipient(channel: ReputationRequestChannel, email: string | null, phone: string | null): ReputationDeliveryChannel | null {
    if ((channel === 'email' || channel === 'both') && !email) return 'email';
    if ((channel === 'sms' || channel === 'both') && !phone) return 'sms';
    return null;
  }

  private email(value: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
      ? normalized : null;
  }

  private phone(value: string | null): string | null {
    if (!value) return null;
    const compact = value.trim().replace(/[^\d+]/g, '');
    const normalized = compact.startsWith('+') ? compact
      : compact.length === 10 ? `+1${compact}`
        : compact.length === 11 && compact.startsWith('1') ? `+${compact}` : `+${compact}`;
    return /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : null;
  }

  private async idempotencyLock(client: PoolClient, organizationId: number, key: string): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`review-request:${organizationId}:${key}`]);
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
