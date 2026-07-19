import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
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
    values: InvoiceBusinessValues,
  ): Promise<InvoiceBusinessRow> {
    const result = await this.pool.query<InvoiceBusinessRow>(
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
    return result.rows[0];
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
}
