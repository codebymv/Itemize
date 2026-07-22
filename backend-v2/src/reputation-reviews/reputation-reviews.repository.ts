import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type ReputationReviewRow = {
  id: number; organization_id: number; platform_id: number | null; platform: string;
  external_review_id: string | null; rating: number; review_text: string | null;
  reviewer_name: string | null; reviewer_email: string | null; reviewer_phone: string | null;
  reviewer_avatar_url: string | null; reviewer_profile_url: string | null;
  contact_id: number | null; status: string; response_text: string | null;
  responded_at: Date | null; responded_by: number | null; internal_notes: string | null;
  sentiment: string | null; sentiment_score: string | number | null; source: string;
  review_request_id: number | null; review_date: Date; created_at: Date; updated_at: Date;
  platform_name: string | null; platform_review_url: string | null;
  contact_first_name: string | null; contact_last_name: string | null; contact_email: string | null;
};

export type ReputationReviewCreateValues = {
  platformId: number | null; platform: string; platformWasProvided: boolean;
  rating: number; reviewText: string | null;
  reviewerName: string | null; reviewerEmail: string | null; reviewerPhone: string | null;
  contactId: number | null; sentiment: string; reviewDate: Date;
};

export type ReputationReviewUpdateValues = {
  status: string; responseText: string | null; respondedAt: Date | null;
  respondedBy: number | null; internalNotes: string | null; contactId: number | null;
};

export class ReputationReviewReferenceError extends Error {
  constructor(readonly field: 'platformId' | 'contactId', message: string) {
    super(message);
  }
}

export type ReputationReviewMutationOutcome =
  | { kind: 'ok'; row: ReputationReviewRow }
  | { kind: 'not_found' };

const selection = `
  r.id, r.organization_id, r.platform_id, r.platform, r.external_review_id,
  r.rating, r.review_text, r.reviewer_name, r.reviewer_email, r.reviewer_phone,
  r.reviewer_avatar_url, r.reviewer_profile_url, r.contact_id, r.status,
  r.response_text, r.responded_at, r.responded_by, r.internal_notes,
  r.sentiment, r.sentiment_score, r.source, r.review_request_id,
  r.review_date, r.created_at, r.updated_at,
  rp.platform_name, rp.review_url AS platform_review_url,
  c.first_name AS contact_first_name, c.last_name AS contact_last_name,
  c.email AS contact_email`;

const joins = `
  LEFT JOIN review_platforms rp
    ON rp.id = r.platform_id AND rp.organization_id = r.organization_id
  LEFT JOIN contacts c
    ON c.id = r.contact_id AND c.organization_id = r.organization_id`;

@Injectable()
export class ReputationReviewsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(input: {
    organizationId: number; platform?: string; rating?: number; status?: string;
    sentiment?: string; search?: string; pageSize: number; offset: number;
  }): Promise<{ rows: ReputationReviewRow[]; total: number }> {
    const params: unknown[] = [input.organizationId];
    const where = ['r.organization_id = $1'];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (input.platform) add('r.platform = ?', input.platform);
    if (input.rating !== undefined) add('r.rating = ?', input.rating);
    if (input.status) add('r.status = ?', input.status);
    if (input.sentiment) add('r.sentiment = ?', input.sentiment);
    if (input.search) {
      params.push(`%${input.search}%`);
      where.push(`(r.reviewer_name ILIKE $${params.length} OR r.review_text ILIKE $${params.length})`);
    }
    const whereSql = where.join(' AND ');

    return this.transaction(async (client) => {
      const count = await client.query<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM reviews r WHERE ${whereSql}`,
        params,
      );
      const rowsParams = [...params, input.pageSize, input.offset];
      const rows = await client.query<ReputationReviewRow>(
        `SELECT ${selection} FROM reviews r ${joins}
         WHERE ${whereSql}
         ORDER BY r.review_date DESC, r.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        rowsParams,
      );
      return { rows: rows.rows, total: Number(count.rows[0].total) };
    }, true);
  }

  async findById(organizationId: number, reviewId: number): Promise<ReputationReviewRow | null> {
    const result = await this.pool.query<ReputationReviewRow>(
      `SELECT ${selection} FROM reviews r ${joins}
       WHERE r.id = $1 AND r.organization_id = $2`,
      [reviewId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async create(
    organizationId: number,
    values: ReputationReviewCreateValues,
  ): Promise<ReputationReviewRow> {
    return this.transaction(async (client) => {
      const platform = await this.validatePlatform(
        client, organizationId, values.platformId, values.platform, values.platformWasProvided,
      );
      await this.validateContact(client, organizationId, values.contactId);
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO reviews (
          organization_id, platform_id, platform, rating, review_text,
          reviewer_name, reviewer_email, reviewer_phone, contact_id,
          sentiment, source, review_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual',$11)
        RETURNING id`,
        [organizationId, values.platformId, platform, values.rating, values.reviewText,
          values.reviewerName, values.reviewerEmail, values.reviewerPhone, values.contactId,
          values.sentiment, values.reviewDate],
      );
      const row = await this.findByIdWithClient(client, organizationId, Number(inserted.rows[0].id));
      if (!row) throw new Error('Created review could not be reloaded');
      return row;
    });
  }

  async update(
    organizationId: number,
    reviewId: number,
    prepare: (current: ReputationReviewRow) => ReputationReviewUpdateValues,
  ): Promise<ReputationReviewMutationOutcome> {
    return this.transaction(async (client) => {
      const current = await this.findByIdWithClient(client, organizationId, reviewId, true, false);
      if (!current) return { kind: 'not_found' };
      const values = prepare(current);
      await this.validateContact(client, organizationId, values.contactId);
      await client.query(
        `UPDATE reviews SET
          status=$1, response_text=$2, responded_at=$3, responded_by=$4,
          internal_notes=$5, contact_id=$6, updated_at=CURRENT_TIMESTAMP
         WHERE id=$7 AND organization_id=$8`,
        [values.status, values.responseText, values.respondedAt, values.respondedBy,
          values.internalNotes, values.contactId, reviewId, organizationId],
      );
      return {
        kind: 'ok',
        row: (await this.findByIdWithClient(client, organizationId, reviewId))!,
      };
    });
  }

  async delete(organizationId: number, reviewId: number): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM reviews WHERE id=$1 AND organization_id=$2 RETURNING id',
      [reviewId, organizationId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async validatePlatform(
    client: PoolClient,
    organizationId: number,
    platformId: number | null,
    requestedPlatform: string,
    platformWasProvided: boolean,
  ): Promise<string> {
    if (platformId === null) return requestedPlatform;
    const result = await client.query<{ platform: string }>(
      `SELECT platform FROM review_platforms
       WHERE id=$1 AND organization_id=$2 FOR KEY SHARE`,
      [platformId, organizationId],
    );
    const platform = result.rows[0]?.platform;
    if (!platform) throw new ReputationReviewReferenceError('platformId', 'Review platform not found');
    if (platformWasProvided && requestedPlatform !== platform) {
      throw new ReputationReviewReferenceError('platformId', 'Review platform does not match platformId');
    }
    return platform;
  }

  private async validateContact(
    client: PoolClient,
    organizationId: number,
    contactId: number | null,
  ): Promise<void> {
    if (contactId === null) return;
    const result = await client.query(
      'SELECT 1 FROM contacts WHERE id=$1 AND organization_id=$2 FOR KEY SHARE',
      [contactId, organizationId],
    );
    if (!result.rows[0]) throw new ReputationReviewReferenceError('contactId', 'Contact not found');
  }

  private async findByIdWithClient(
    client: PoolClient,
    organizationId: number,
    reviewId: number,
    lock = false,
    required = true,
  ): Promise<ReputationReviewRow | null> {
    const result = await client.query<ReputationReviewRow>(
      `SELECT ${selection} FROM reviews r ${joins}
       WHERE r.id=$1 AND r.organization_id=$2${lock ? ' FOR UPDATE OF r' : ''}`,
      [reviewId, organizationId],
    );
    if (!result.rows[0] && required) throw new Error('Created review could not be reloaded');
    return result.rows[0] ?? null;
  }

  private async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
    readOnly = false,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(readOnly
        ? 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'
        : 'BEGIN');
      const value = await operation(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
