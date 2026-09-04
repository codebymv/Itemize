import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type InvoiceBusinessRow = {
  id: number;
  organization_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
  logo_url: string | null;
  is_active: boolean;
  last_used_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type InvoiceBusinessValues = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
};

export type InvoiceBusinessUpdates = Partial<
  InvoiceBusinessValues & { isActive: boolean }
>;

export type CreateInvoiceBusinessOutcome =
  | { kind: 'created'; row: InvoiceBusinessRow; replayed: boolean }
  | { kind: 'idempotency_conflict' }
  | { kind: 'result_unavailable' };

export type InvoiceBusinessLogoRemoval = {
  row: InvoiceBusinessRow;
  cleanupQueued: boolean;
};

const selection = `
  id, organization_id, name, email, phone, address, tax_id, logo_url,
  is_active, last_used_at, created_at, updated_at`;

@Injectable()
export class InvoiceBusinessesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(
    organizationId: number,
    pageSize: number,
    offset: number,
  ): Promise<{ rows: InvoiceBusinessRow[]; total: number }> {
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM businesses
       WHERE organization_id = $1 AND is_active = TRUE`,
      [organizationId],
    );
    const rows = await this.pool.query<InvoiceBusinessRow>(
      `SELECT ${selection}
       FROM businesses
       WHERE organization_id = $1 AND is_active = TRUE
       ORDER BY last_used_at DESC NULLS LAST, created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, pageSize, offset],
    );
    return { rows: rows.rows, total: Number(count.rows[0].total) };
  }

  async findById(
    organizationId: number,
    businessId: number,
  ): Promise<InvoiceBusinessRow | null> {
    const result = await this.pool.query<InvoiceBusinessRow>(
      `SELECT ${selection}
       FROM businesses
       WHERE id = $1 AND organization_id = $2`,
      [businessId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async create(
    organizationId: number,
    userId: number,
    values: InvoiceBusinessValues,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<CreateInvoiceBusinessOutcome> {
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [organizationId]);
      const receipt = await client.query<{
        request_fingerprint: string;
        result_business_id: number | null;
      }>(
        `SELECT request_fingerprint, result_business_id
         FROM invoice_business_creation_receipts
         WHERE organization_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [organizationId, idempotencyKey],
      );
      const replay = receipt.rows[0];
      if (replay) {
        if (replay.request_fingerprint !== requestFingerprint) {
          return { kind: 'idempotency_conflict' };
        }
        if (replay.result_business_id === null) {
          return { kind: 'result_unavailable' };
        }
        const row = await this.selectById(
          client,
          organizationId,
          Number(replay.result_business_id),
        );
        return row
          ? { kind: 'created', row, replayed: true }
          : { kind: 'result_unavailable' };
      }
      const result = await client.query<InvoiceBusinessRow>(
        `INSERT INTO businesses (
           organization_id, name, email, phone, address, tax_id
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${selection}`,
        [
          organizationId,
          values.name,
          values.email,
          values.phone,
          values.address,
          values.taxId,
        ],
      );
      const row = result.rows[0];
      await client.query(
        `INSERT INTO invoice_business_creation_receipts (
           organization_id, requested_by_user_id, idempotency_key,
           request_fingerprint, result_business_id
         ) VALUES ($1,$2,$3,$4,$5)`,
        [organizationId, userId, idempotencyKey, requestFingerprint, row.id],
      );
      return { kind: 'created', row, replayed: false };
    });
  }

  async update(
    organizationId: number,
    businessId: number,
    values: InvoiceBusinessUpdates,
  ): Promise<InvoiceBusinessRow | null> {
    const parameters: unknown[] = [businessId, organizationId];
    const assignments: string[] = [];
    const set = (column: string, value: unknown) => {
      parameters.push(value);
      assignments.push(`${column} = $${parameters.length}`);
    };
    if (values.name !== undefined) set('name', values.name);
    if (values.email !== undefined) set('email', values.email);
    if (values.phone !== undefined) set('phone', values.phone);
    if (values.address !== undefined) set('address', values.address);
    if (values.taxId !== undefined) set('tax_id', values.taxId);
    if (values.isActive !== undefined) set('is_active', values.isActive);

    if (assignments.length === 0) {
      return this.findById(organizationId, businessId);
    }
    const result = await this.pool.query<InvoiceBusinessRow>(
      `UPDATE businesses
       SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2
       RETURNING ${selection}`,
      parameters,
    );
    return result.rows[0] ?? null;
  }

  async deactivate(
    organizationId: number,
    businessId: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE businesses
       SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [businessId, organizationId],
    );
    return result.rows.length === 1;
  }

  async removeLogo(
    organizationId: number,
    businessId: number,
  ): Promise<InvoiceBusinessLogoRemoval | null> {
    return this.transaction(async (client) => {
      const locked = await client.query<InvoiceBusinessRow>(
        `SELECT ${selection} FROM businesses
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [businessId, organizationId],
      );
      const business = locked.rows[0];
      if (!business) return null;
      let cleanupQueued = false;
      if (business.logo_url) {
        const queued = await client.query(
          `INSERT INTO invoice_logo_deletion_jobs (
             organization_id, scope, resource_id, logo_url
           ) VALUES ($1, 'business', $2, $3)
           ON CONFLICT (organization_id, logo_url) DO UPDATE SET
             scope = EXCLUDED.scope,
             resource_id = EXCLUDED.resource_id,
             status = 'queued',
             attempt_count = 0,
             next_attempt_at = CURRENT_TIMESTAMP,
             lease_expires_at = NULL,
             claimed_by = NULL,
             last_error = NULL,
             deleted_at = NULL,
             updated_at = CURRENT_TIMESTAMP
           WHERE invoice_logo_deletion_jobs.status IN ('deleted', 'dead_letter')
           RETURNING id`,
          [organizationId, businessId, business.logo_url],
        );
        cleanupQueued = queued.rows.length === 1;
      }
      const updated = await client.query<InvoiceBusinessRow>(
        `UPDATE businesses
         SET logo_url = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2
         RETURNING ${selection}`,
        [businessId, organizationId],
      );
      return { row: updated.rows[0], cleanupQueued };
    });
  }

  private async selectById(
    client: PoolClient,
    organizationId: number,
    businessId: number,
  ): Promise<InvoiceBusinessRow | null> {
    const result = await client.query<InvoiceBusinessRow>(
      `SELECT ${selection}
       FROM businesses
       WHERE id = $1 AND organization_id = $2`,
      [businessId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async transaction<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
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
