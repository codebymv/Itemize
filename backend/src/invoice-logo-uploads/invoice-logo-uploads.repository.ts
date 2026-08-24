import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

@Injectable()
export class InvoiceLogoUploadsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async businessExists(organizationId: number, businessId: number): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM businesses WHERE id = $1 AND organization_id = $2',
      [businessId, organizationId],
    );
    return result.rowCount === 1;
  }

  replaceBusiness(
    organizationId: number, businessId: number, logoUrl: string,
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const locked = await client.query<{ logo_url: string | null }>(
        `SELECT logo_url FROM businesses
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [businessId, organizationId],
      );
      if (!locked.rows[0]) return false;
      await this.queueOld(client, organizationId, 'business', businessId, locked.rows[0].logo_url);
      await client.query(
        `UPDATE businesses SET logo_url = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND organization_id = $3`,
        [logoUrl, businessId, organizationId],
      );
      return true;
    });
  }

  replaceSettings(organizationId: number, logoUrl: string): Promise<void> {
    return this.transaction(async (client) => {
      await client.query(
        `INSERT INTO payment_settings (organization_id)
         VALUES ($1) ON CONFLICT (organization_id) DO NOTHING`,
        [organizationId],
      );
      const locked = await client.query<{ logo_url: string | null }>(
        `SELECT logo_url FROM payment_settings
         WHERE organization_id = $1 FOR UPDATE`,
        [organizationId],
      );
      await this.queueOld(client, organizationId, 'settings', null, locked.rows[0]?.logo_url ?? null);
      await client.query(
        `UPDATE payment_settings SET logo_url = $1, updated_at = CURRENT_TIMESTAMP
         WHERE organization_id = $2`,
        [logoUrl, organizationId],
      );
    });
  }

  private async queueOld(
    client: PoolClient,
    organizationId: number,
    scope: 'business' | 'settings',
    resourceId: number | null,
    logoUrl: string | null,
  ): Promise<void> {
    if (!logoUrl) return;
    await client.query(
      `INSERT INTO invoice_logo_deletion_jobs (
         organization_id, scope, resource_id, logo_url
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, logo_url) DO UPDATE SET
         scope = EXCLUDED.scope, resource_id = EXCLUDED.resource_id,
         status = 'queued', attempt_count = 0,
         next_attempt_at = CURRENT_TIMESTAMP, lease_expires_at = NULL,
         claimed_by = NULL, last_error = NULL, deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE invoice_logo_deletion_jobs.status IN ('deleted', 'dead_letter')`,
      [organizationId, scope, resourceId, logoUrl],
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
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
