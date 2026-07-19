import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

export type ProductRow = {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  sku: string | null;
  price: string;
  currency: string;
  product_type: string;
  billing_period: string | null;
  tax_rate: string;
  taxable: boolean;
  is_active: boolean;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
};

export type ProductValues = {
  name: string;
  description: string | null;
  sku: string | null;
  price: string;
  currency: string;
  productType: string;
  billingPeriod: string | null;
  taxRate: string;
  taxable: boolean;
  isActive: boolean;
};

export type ProductUpdates = Partial<ProductValues>;

export type ProductCriteria = {
  organizationId: number;
  isActive?: boolean;
  searchPattern?: string;
  pageSize: number;
  offset: number;
};

const productSelection = `
  id,
  organization_id,
  name,
  description,
  sku,
  price,
  currency,
  product_type,
  billing_period,
  tax_rate,
  taxable,
  is_active,
  created_by,
  created_at,
  updated_at`;

@Injectable()
export class ProductsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(
    organizationId: number,
    productId: number,
  ): Promise<ProductRow | null> {
    const result = await this.pool.query<ProductRow>(
      `SELECT ${productSelection}
       FROM products
       WHERE id = $1 AND organization_id = $2`,
      [productId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async findPage(
    criteria: ProductCriteria,
  ): Promise<{ rows: ProductRow[]; total: number }> {
    const parameters: unknown[] = [criteria.organizationId];
    const clauses = ['organization_id = $1'];
    if (criteria.isActive !== undefined) {
      parameters.push(criteria.isActive);
      clauses.push(`is_active = $${parameters.length}`);
    }
    if (criteria.searchPattern !== undefined) {
      parameters.push(criteria.searchPattern);
      clauses.push(
        `(name ILIKE $${parameters.length} ESCAPE '\\' OR sku ILIKE $${parameters.length} ESCAPE '\\')`,
      );
    }
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM products WHERE ${where}`,
      parameters,
    );
    parameters.push(criteria.pageSize, criteria.offset);
    const rows = await this.pool.query<ProductRow>(
      `SELECT ${productSelection}
       FROM products
       WHERE ${where}
       ORDER BY lower(name), id
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    );
    return { rows: rows.rows, total: Number(count.rows[0].total) };
  }

  async create(
    organizationId: number,
    userId: number,
    values: ProductValues,
  ): Promise<ProductRow> {
    const result = await this.pool.query<ProductRow>(
      `INSERT INTO products (
         organization_id, name, description, sku, price, currency,
         product_type, billing_period, tax_rate, taxable, is_active, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${productSelection}`,
      [
        organizationId,
        values.name,
        values.description,
        values.sku,
        values.price,
        values.currency,
        values.productType,
        values.billingPeriod,
        values.taxRate,
        values.taxable,
        values.isActive,
        userId,
      ],
    );
    return result.rows[0];
  }

  async update(
    organizationId: number,
    productId: number,
    values: ProductUpdates,
  ): Promise<ProductRow | null> {
    const assignments: string[] = [];
    const parameters: unknown[] = [productId, organizationId];
    const set = (column: string, value: unknown) => {
      parameters.push(value);
      assignments.push(`${column} = $${parameters.length}`);
    };
    if (values.name !== undefined) set('name', values.name);
    if (values.description !== undefined) set('description', values.description);
    if (values.sku !== undefined) set('sku', values.sku);
    if (values.price !== undefined) set('price', values.price);
    if (values.currency !== undefined) set('currency', values.currency);
    if (values.productType !== undefined) set('product_type', values.productType);
    if (values.billingPeriod !== undefined) {
      set('billing_period', values.billingPeriod);
    }
    if (values.taxRate !== undefined) set('tax_rate', values.taxRate);
    if (values.taxable !== undefined) set('taxable', values.taxable);
    if (values.isActive !== undefined) set('is_active', values.isActive);

    if (assignments.length === 0) {
      const current = await this.pool.query<ProductRow>(
        `SELECT ${productSelection}
         FROM products
         WHERE id = $1 AND organization_id = $2`,
        parameters,
      );
      return current.rows[0] ?? null;
    }
    const result = await this.pool.query<ProductRow>(
      `UPDATE products
       SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2
       RETURNING ${productSelection}`,
      parameters,
    );
    return result.rows[0] ?? null;
  }

  async delete(organizationId: number, productId: number): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM products
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      [productId, organizationId],
    );
    return result.rows.length === 1;
  }
}
