import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type InvoiceLogoDeletionJobRow = {
  id: number;
  organization_id: number;
  scope: 'business' | 'settings';
  resource_id: number | null;
  logo_url: string;
  status: string;
  attempt_count: number;
  next_attempt_at: Date;
  lease_expires_at: Date | null;
  claimed_by: string | null;
  last_error: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class InvoiceLogoCleanupRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async isReferenced(organizationId: number, logoUrl: string): Promise<boolean> {
    const result = await this.pool.query<{ referenced: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM businesses
         WHERE organization_id = $1 AND logo_url = $2
         UNION ALL
         SELECT 1 FROM payment_settings
         WHERE organization_id = $1 AND logo_url = $2
       ) AS referenced`,
      [organizationId, logoUrl],
    );
    return result.rows[0]?.referenced === true;
  }

  async dueIds(limit: number): Promise<Array<{ id: number; organizationId: number }>> {
    const result = await this.pool.query<{ id: number; organization_id: number }>(
      `SELECT id, organization_id FROM invoice_logo_deletion_jobs
       WHERE (status IN ('queued', 'retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
          OR (status = 'processing' AND lease_expires_at <= CURRENT_TIMESTAMP)
       ORDER BY next_attempt_at, id LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: Number(row.id), organizationId: Number(row.organization_id),
    }));
  }

  async claim(
    organizationId: number,
    jobId: number,
  ): Promise<InvoiceLogoDeletionJobRow | null> {
    const result = await this.pool.query<InvoiceLogoDeletionJobRow>(
      `UPDATE invoice_logo_deletion_jobs
       SET status = 'processing', attempt_count = attempt_count + 1,
           lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '60 seconds',
           claimed_by = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2
         AND ((status IN ('queued', 'retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
           OR (status = 'processing' AND lease_expires_at <= CURRENT_TIMESTAMP))
       RETURNING *`,
      [jobId, organizationId, `nest:${process.pid}`],
    );
    return result.rows[0] ?? null;
  }

  async complete(
    organizationId: number,
    jobId: number,
  ): Promise<InvoiceLogoDeletionJobRow> {
    const result = await this.pool.query<InvoiceLogoDeletionJobRow>(
      `UPDATE invoice_logo_deletion_jobs
       SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP,
           lease_expires_at = NULL, claimed_by = NULL, last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2 AND status = 'processing'
       RETURNING *`,
      [jobId, organizationId],
    );
    if (!result.rows[0]) throw new Error('Invoice logo deletion job not found');
    return result.rows[0];
  }

  async fail(
    organizationId: number,
    jobId: number,
    error: string,
    retryable: boolean,
  ): Promise<InvoiceLogoDeletionJobRow> {
    const result = await this.pool.query<InvoiceLogoDeletionJobRow>(
      `UPDATE invoice_logo_deletion_jobs
       SET status = CASE WHEN NOT $3::boolean OR attempt_count >= 5
                         THEN 'dead_letter' ELSE 'retry' END,
           next_attempt_at = CURRENT_TIMESTAMP +
             (LEAST(300, POWER(2, GREATEST(attempt_count - 1))) * INTERVAL '1 second'),
           lease_expires_at = NULL, claimed_by = NULL,
           last_error = LEFT($4, 2000), updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2 AND status = 'processing'
       RETURNING *`,
      [jobId, organizationId, retryable, error],
    );
    if (!result.rows[0]) throw new Error('Invoice logo deletion job not found');
    return result.rows[0];
  }
}
