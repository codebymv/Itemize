import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type AdminEmailLogRow = {
  id: number; recipient_email: string; recipient_id: number | null; recipient_name: string | null;
  subject: string; body_html: string | null; status: string; external_id: string | null;
  error_message: string | null; sent_by: number | null; sent_by_name: string | null;
  sent_by_email: string | null; sent_at: Date | null; created_at: Date;
};

export type AdminEmailTemplateRow = {
  id: number; name: string; subject: string; body_html: string | null; category: string | null;
  is_active: boolean; organization_id: number | null; organization_name: string | null;
  created_by: number | null; created_by_name: string | null; created_at: Date; updated_at: Date;
};

export type PreparedAdminEmailRecipient = {
  id?: number; email: string; name?: string; subject: string; bodyHtml: string;
};

export type AdminEmailDeliveryRow = {
  id: number; batch_id: number; recipient_email: string; subject: string; body_html: string;
  status: string; attempt_count: number; provider_id: string | null; last_error: string | null;
};

export type AdminEmailBatchPreparation =
  | { kind: 'created' | 'replayed'; batchId: number; status: string; accepted: number }
  | { kind: 'key_conflict' };

@Injectable()
export class AdminMessagingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async logs(input: { status?: string; limit: number; offset: number }): Promise<{ rows: AdminEmailLogRow[]; total: number }> {
    return this.readTransaction(async (client) => {
      const params: unknown[] = [];
      const where = input.status ? (params.push(input.status), `WHERE el.status = $${params.length}`) : '';
      const count = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM email_logs el ${where}`, params,
      );
      const rows = await client.query<AdminEmailLogRow>(
        `SELECT el.id, COALESCE(el.recipient_email, el.to_email) AS recipient_email,
                el.recipient_id, el.recipient_name, el.subject, NULL::text AS body_html,
                el.status, el.external_id, el.error_message, el.sent_by,
                sender.name AS sent_by_name, sender.email AS sent_by_email,
                el.sent_at, COALESCE(el.created_at, el.queued_at) AS created_at
         FROM email_logs el LEFT JOIN users sender ON sender.id = el.sent_by
         ${where} ORDER BY COALESCE(el.created_at, el.queued_at) DESC, el.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, input.limit + 1, input.offset],
      );
      return { rows: rows.rows, total: Number(count.rows[0].total) };
    });
  }

  async log(id: number): Promise<AdminEmailLogRow | null> {
    const result = await this.pool.query<AdminEmailLogRow>(
      `SELECT el.id, COALESCE(el.recipient_email, el.to_email) AS recipient_email,
              el.recipient_id, el.recipient_name, el.subject, el.body_html,
              el.status, el.external_id, el.error_message, el.sent_by,
              sender.name AS sent_by_name, sender.email AS sent_by_email,
              el.sent_at, COALESCE(el.created_at, el.queued_at) AS created_at
       FROM email_logs el LEFT JOIN users sender ON sender.id = el.sent_by
       WHERE el.id = $1`, [id],
    );
    return result.rows[0] ?? null;
  }

  async templates(input: { category?: string; search?: string }): Promise<{ rows: AdminEmailTemplateRow[]; total: number }> {
    return this.readTransaction(async (client) => {
      const params: unknown[] = [];
      const conditions: string[] = [];
      if (input.category) { params.push(input.category); conditions.push(`et.category = $${params.length}`); }
      if (input.search) {
        params.push(`%${input.search}%`);
        conditions.push(`(et.name ILIKE $${params.length} OR et.subject ILIKE $${params.length})`);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const count = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM email_templates et ${where}`, params,
      );
      const rows = await client.query<AdminEmailTemplateRow>(
        `SELECT et.id, et.name, et.subject, et.body_html, et.category, et.is_active,
                et.organization_id, organization.name AS organization_name,
                et.created_by, creator.name AS created_by_name, et.created_at, et.updated_at
         FROM email_templates et
         LEFT JOIN organizations organization ON organization.id = et.organization_id
         LEFT JOIN users creator ON creator.id = et.created_by
         ${where} ORDER BY et.updated_at DESC, et.id DESC LIMIT 100`, params,
      );
      return { rows: rows.rows, total: Number(count.rows[0].total) };
    });
  }

  async enqueue(input: {
    userId: number; idempotencyKey: string; fingerprint: string; subject: string;
    recipients: PreparedAdminEmailRecipient[];
  }): Promise<AdminEmailBatchPreparation> {
    return this.transaction(async (client) => {
      const existing = await client.query<{ id: number; request_fingerprint: string; status: string; recipient_count: number }>(
        `SELECT id, request_fingerprint, status, recipient_count FROM admin_email_batches
         WHERE requested_by_user_id=$1 AND idempotency_key=$2 FOR UPDATE`,
        [input.userId, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        const batch = existing.rows[0];
        return batch.request_fingerprint === input.fingerprint
          ? { kind: 'replayed', batchId: Number(batch.id), status: batch.status, accepted: batch.recipient_count }
          : { kind: 'key_conflict' };
      }

      const linkedUsers = new Map<number, string>();
      const ids = [...new Set(input.recipients.flatMap((recipient) => recipient.id ? [recipient.id] : []))];
      if (ids.length) {
        const users = await client.query<{ id: number; email: string }>(
          'SELECT id, email FROM users WHERE id = ANY($1::int[])', [ids],
        );
        users.rows.forEach((user) => linkedUsers.set(user.id, user.email.toLowerCase()));
      }

      const batch = await client.query<{ id: number; status: string }>(
        `INSERT INTO admin_email_batches
           (requested_by_user_id,idempotency_key,request_fingerprint,subject,recipient_count)
         VALUES ($1,$2,$3,$4,$5) RETURNING id,status`,
        [input.userId, input.idempotencyKey, input.fingerprint, input.subject, input.recipients.length],
      );
      const batchId = Number(batch.rows[0].id);
      for (const [ordinal, recipient] of input.recipients.entries()) {
        const recipientId = recipient.id && linkedUsers.get(recipient.id) === recipient.email.toLowerCase()
          ? recipient.id : null;
        const log = await client.query<{ id: number }>(
          `INSERT INTO email_logs
             (organization_id,to_email,recipient_email,recipient_id,recipient_name,subject,body_html,status,sent_by,queued_at,created_at,metadata)
           VALUES (NULL,$1,$1,$2,$3,$4,$5,'queued',$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,$7::jsonb)
           RETURNING id`,
          [recipient.email, recipientId, recipient.name ?? null, recipient.subject, recipient.bodyHtml,
            input.userId, JSON.stringify({ adminEmailBatchId: batchId, recipientOrdinal: ordinal })],
        );
        await client.query(
          `INSERT INTO admin_email_deliveries
             (batch_id,recipient_ordinal,recipient_user_id,recipient_email,recipient_name,subject,body_html,email_log_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [batchId, ordinal, recipientId, recipient.email, recipient.name ?? null,
            recipient.subject, recipient.bodyHtml, log.rows[0].id],
        );
      }
      return { kind: 'created', batchId, status: batch.rows[0].status, accepted: input.recipients.length };
    });
  }

  async due(limit: number): Promise<number[]> {
    const result = await this.pool.query<{ id: number }>(
      `SELECT id FROM admin_email_deliveries
       WHERE (status IN ('queued','retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
          OR (status='processing' AND lease_expires_at <= CURRENT_TIMESTAMP)
       ORDER BY next_attempt_at, id LIMIT $1`, [limit],
    );
    return result.rows.map((row) => Number(row.id));
  }

  async claim(id: number): Promise<AdminEmailDeliveryRow | null> {
    const result = await this.pool.query<AdminEmailDeliveryRow>(
      `UPDATE admin_email_deliveries SET status='processing', attempt_count=attempt_count+1,
         lease_expires_at=CURRENT_TIMESTAMP + INTERVAL '30 seconds', claimed_by=$2, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND ((status IN ('queued','retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
         OR (status='processing' AND lease_expires_at <= CURRENT_TIMESTAMP)) RETURNING *`,
      [id, `nest:${process.pid}`],
    );
    return result.rows[0] ?? null;
  }

  async complete(id: number, providerId: string | null): Promise<void> {
    await this.transaction(async (client) => {
      const delivery = await client.query<{ batch_id: number; email_log_id: number | null }>(
        `UPDATE admin_email_deliveries SET status='sent',provider_id=$2,sent_at=COALESCE(sent_at,CURRENT_TIMESTAMP),
           lease_expires_at=NULL,claimed_by=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 RETURNING batch_id,email_log_id`, [id, providerId],
      );
      if (!delivery.rows[0]) throw new Error('Admin email delivery not found');
      if (delivery.rows[0].email_log_id) {
        await client.query(
          `UPDATE email_logs SET status='sent',external_id=$2,sent_at=COALESCE(sent_at,CURRENT_TIMESTAMP),error_message=NULL
           WHERE id=$1`, [delivery.rows[0].email_log_id, providerId],
        );
      }
      await this.refreshBatch(client, Number(delivery.rows[0].batch_id));
    });
  }

  async fail(id: number, error: string, ambiguous: boolean): Promise<string> {
    return this.transaction(async (client) => {
      const delivery = await client.query<{ batch_id: number; email_log_id: number | null; status: string }>(
        `UPDATE admin_email_deliveries SET
           status=CASE WHEN $2::boolean THEN 'reconciliation_required' WHEN attempt_count >= 5 THEN 'dead_letter' ELSE 'retry' END,
           next_attempt_at=CURRENT_TIMESTAMP + (LEAST(300,POWER(2,GREATEST(attempt_count-1))) * INTERVAL '1 second'),
           last_error=LEFT($3,2000),lease_expires_at=NULL,claimed_by=NULL,updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 RETURNING batch_id,email_log_id,status`, [id, ambiguous, error],
      );
      if (!delivery.rows[0]) throw new Error('Admin email delivery not found');
      if (delivery.rows[0].email_log_id) {
        await client.query(
          `UPDATE email_logs SET status=$2,error_message=LEFT($3,2000) WHERE id=$1`,
          [delivery.rows[0].email_log_id,
            ['dead_letter', 'reconciliation_required'].includes(delivery.rows[0].status) ? 'failed' : 'queued', error],
        );
      }
      await this.refreshBatch(client, Number(delivery.rows[0].batch_id));
      return delivery.rows[0].status;
    });
  }

  private async refreshBatch(client: PoolClient, batchId: number): Promise<void> {
    await client.query(
      `WITH totals AS (
         SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='sent')::int AS sent,
           COUNT(*) FILTER (WHERE status IN ('dead_letter','reconciliation_required'))::int AS failed,
           COUNT(*) FILTER (WHERE status IN ('queued','retry','processing'))::int AS active,
           COUNT(*) FILTER (WHERE status='reconciliation_required')::int AS reconciliation
         FROM admin_email_deliveries WHERE batch_id=$1
       ) UPDATE admin_email_batches batch SET sent_count=totals.sent,failed_count=totals.failed,
         status=CASE WHEN totals.reconciliation>0 THEN 'reconciliation_required'
           WHEN totals.active>0 THEN 'processing' WHEN totals.sent=totals.total THEN 'sent'
           WHEN totals.failed=totals.total THEN 'failed' ELSE 'partial' END,
         completed_at=CASE WHEN totals.active=0 THEN COALESCE(batch.completed_at,CURRENT_TIMESTAMP) ELSE NULL END,
         updated_at=CURRENT_TIMESTAMP FROM totals WHERE batch.id=$1`, [batchId],
    );
  }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async readTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
