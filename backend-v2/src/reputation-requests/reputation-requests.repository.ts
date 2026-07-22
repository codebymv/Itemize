import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type ReputationRequestRow = {
  id: number | string; organization_id: number | string; contact_id: number | string | null;
  contact_email: string | null; contact_phone: string | null; contact_name: string | null;
  channel: string; template_id: number | string | null; email_sent: boolean;
  email_sent_at: Date | string | null; email_opened: boolean; email_opened_at: Date | string | null;
  sms_sent: boolean; sms_sent_at: Date | string | null; clicked: boolean;
  clicked_at: Date | string | null; rating_given: number | string | null;
  review_submitted: boolean; review_submitted_at: Date | string | null;
  review_id: number | string | null; preferred_platform: string | null; redirect_url: string | null;
  status: string; scheduled_at: Date | string | null; expires_at: Date | string | null;
  custom_message: string | null; created_at: Date | string; updated_at: Date | string;
  contact_first_name: string | null; contact_last_name: string | null;
  current_contact_email: string | null;
};

export type ReputationRequestPageQuery = {
  organizationId: number; status?: string; pageSize: number; offset: number;
};

const projection = `rr.id, rr.organization_id, rr.contact_id, rr.contact_email,
  rr.contact_phone, rr.contact_name, rr.channel, rr.template_id, rr.email_sent,
  rr.email_sent_at, rr.email_opened, rr.email_opened_at, rr.sms_sent, rr.sms_sent_at,
  rr.clicked, rr.clicked_at, rr.rating_given, rr.review_submitted, rr.review_submitted_at,
  rr.review_id, rr.preferred_platform, rr.redirect_url, rr.status, rr.scheduled_at,
  rr.expires_at, rr.custom_message, rr.created_at, rr.updated_at,
  c.first_name AS contact_first_name, c.last_name AS contact_last_name,
  c.email AS current_contact_email`;

@Injectable()
export class ReputationRequestsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(input: ReputationRequestPageQuery): Promise<{ rows: ReputationRequestRow[]; total: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const values: unknown[] = [input.organizationId];
      let where = 'rr.organization_id = $1';
      if (input.status) {
        values.push(input.status);
        where += ` AND rr.status = $${values.length}`;
      }
      const count = await client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM review_requests rr WHERE ${where}`,
        values,
      );
      const total = Number(count.rows[0]?.count ?? 0);
      if (!Number.isSafeInteger(total) || total < 0) throw new Error('Unsafe reputation request count');
      const rows = await client.query<ReputationRequestRow>(`
        SELECT ${projection}
        FROM review_requests rr
        LEFT JOIN contacts c
          ON c.id = rr.contact_id AND c.organization_id = rr.organization_id
        WHERE ${where}
        ORDER BY rr.created_at DESC, rr.id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, input.pageSize, input.offset]);
      await client.query('COMMIT');
      return { rows: rows.rows, total };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(organizationId: number, requestId: number): Promise<boolean> {
    const result = await this.pool.query<{ id: number }>(
      `DELETE FROM review_requests
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [requestId, organizationId],
    );
    return result.rows.length === 1 && Number(result.rows[0].id) === requestId;
  }
}
