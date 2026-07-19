import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type EstimateRow = {
  id: number;
  organization_id: number;
  estimate_number: string;
  contact_id: number | null;
  business_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  issue_date: string;
  valid_until: string;
  subtotal: string;
  tax_amount: string;
  discount_amount: string;
  discount_type: string | null;
  discount_value: string;
  total: string;
  currency: string;
  status: string;
  notes: string | null;
  terms_and_conditions: string | null;
  sent_at: Date | null;
  viewed_at: Date | null;
  accepted_at: Date | null;
  declined_at: Date | null;
  converted_invoice_id: number | null;
  custom_fields: Record<string, unknown> | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
};

export type EstimateItemRow = {
  id: number;
  estimate_id: number;
  organization_id: number;
  product_id: number | null;
  name: string;
  description: string | null;
  quantity: string;
  unit_price: string;
  tax_rate: string;
  tax_amount: string;
  discount_amount: string;
  total: string;
  sort_order: number;
  product_name: string | null;
  created_at: Date;
  updated_at: Date;
};

export type EstimateItemValues = {
  productId: number | null;
  name: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

export type EstimateValues = {
  contactId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  validUntil: string | null;
  items: EstimateItemValues[];
  discountType: string | null;
  discountValue: string;
  notes: string | null;
  termsAndConditions: string | null;
};

export type EstimateUpdates = Partial<Omit<EstimateValues, 'items'>> & {
  items?: EstimateItemValues[];
};

export type EstimateAggregate = {
  estimate: EstimateRow;
  items: EstimateItemRow[];
};

export type EstimateWriteOutcome =
  | { kind: 'saved'; aggregate: EstimateAggregate }
  | { kind: 'not-found' }
  | { kind: 'not-editable' }
  | { kind: 'contact-not-found' }
  | { kind: 'product-not-found' }
  | { kind: 'invalid-date-order' }
  | { kind: 'invalid-discount' }
  | { kind: 'negative-total' };

export type EstimateCriteria = {
  organizationId: number;
  status?: string;
  contactId?: number;
  searchPattern?: string;
  pageSize: number;
  offset: number;
};

const selection = `
  e.id, e.organization_id, e.estimate_number, e.contact_id, e.business_id,
  e.customer_name, e.customer_email, e.customer_phone, e.customer_address,
  e.issue_date::text, e.valid_until::text, e.subtotal, e.tax_amount,
  e.discount_amount, e.discount_type, e.discount_value, e.total, e.currency,
  e.status, e.notes, e.terms_and_conditions, e.sent_at, e.viewed_at,
  e.accepted_at, e.declined_at, e.converted_invoice_id, e.custom_fields,
  e.created_by, e.created_at, e.updated_at,
  c.first_name AS contact_first_name, c.last_name AS contact_last_name,
  c.email AS contact_email`;

@Injectable()
export class EstimatesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(
    criteria: EstimateCriteria,
  ): Promise<{ rows: EstimateRow[]; total: number }> {
    const values: unknown[] = [criteria.organizationId];
    const clauses = ['e.organization_id = $1'];
    if (criteria.status !== undefined) {
      values.push(criteria.status);
      clauses.push(`e.status = $${values.length}`);
    }
    if (criteria.contactId !== undefined) {
      values.push(criteria.contactId);
      clauses.push(`e.contact_id = $${values.length}`);
    }
    if (criteria.searchPattern !== undefined) {
      values.push(criteria.searchPattern);
      clauses.push(
        `(e.estimate_number ILIKE $${values.length} ESCAPE '\\' OR ` +
        `e.customer_name ILIKE $${values.length} ESCAPE '\\')`,
      );
    }
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM estimates e WHERE ${where}`,
      values,
    );
    values.push(criteria.pageSize, criteria.offset);
    const rows = await this.pool.query<EstimateRow>(
      `SELECT ${selection}
       FROM estimates e
       LEFT JOIN contacts c
         ON c.id = e.contact_id AND c.organization_id = e.organization_id
       WHERE ${where}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { rows: rows.rows, total: Number(count.rows[0].total) };
  }

  async findById(
    organizationId: number,
    estimateId: number,
  ): Promise<EstimateAggregate | null> {
    const client = await this.pool.connect();
    try {
      return await this.load(client, organizationId, estimateId);
    } finally {
      client.release();
    }
  }

  async create(
    organizationId: number,
    userId: number,
    values: EstimateValues,
  ): Promise<EstimateWriteOutcome> {
    return this.transaction(async (client) => {
      const reference = await this.references(client, organizationId, values);
      if (reference) return reference;
      const totals = await this.totals(
        client,
        values.items,
        values.discountType,
        values.discountValue,
      );
      if (Number(totals.total) < 0) return { kind: 'negative-total' };
      const dates = await client.query<{ issue_date: string; valid_until: string }>(
        `SELECT CURRENT_DATE::text AS issue_date,
                COALESCE($1::date, CURRENT_DATE + 30)::text AS valid_until`,
        [values.validUntil],
      );
      if (dates.rows[0].valid_until < dates.rows[0].issue_date) {
        return { kind: 'invalid-date-order' };
      }
      const estimateNumber = await this.allocateNumber(client, organizationId);
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO estimates (
           organization_id, estimate_number, contact_id, customer_name,
           customer_email, customer_phone, customer_address, valid_until,
           subtotal, tax_amount, discount_amount, discount_type,
           discount_value, total, notes, terms_and_conditions, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16, $17
         ) RETURNING id`,
        [
          organizationId, estimateNumber, values.contactId,
          values.customerName, values.customerEmail, values.customerPhone,
          values.customerAddress, dates.rows[0].valid_until, totals.subtotal,
          totals.taxAmount, totals.discountAmount, values.discountType,
          values.discountValue, totals.total, values.notes,
          values.termsAndConditions, userId,
        ],
      );
      const estimateId = Number(inserted.rows[0].id);
      await this.replaceItems(client, organizationId, estimateId, values.items);
      const aggregate = await this.load(client, organizationId, estimateId);
      if (!aggregate) throw new Error('Created estimate could not be reloaded');
      return { kind: 'saved', aggregate };
    });
  }

  async update(
    organizationId: number,
    estimateId: number,
    values: EstimateUpdates,
  ): Promise<EstimateWriteOutcome> {
    return this.transaction(async (client) => {
      const locked = await client.query<{
        status: string;
        issue_date: string;
        valid_until: string;
        discount_type: string | null;
        discount_value: string;
      }>(
        `SELECT status, issue_date::text, valid_until::text,
                discount_type, discount_value
         FROM estimates
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [estimateId, organizationId],
      );
      const current = locked.rows[0];
      if (!current) return { kind: 'not-found' };
      if (!['draft', 'sent'].includes(current.status)) {
        return { kind: 'not-editable' };
      }
      const validUntil = values.validUntil ?? current.valid_until;
      if (validUntil < current.issue_date) return { kind: 'invalid-date-order' };
      const discountType = values.discountType === undefined
        ? current.discount_type
        : values.discountType;
      const discountValue = values.discountValue ?? current.discount_value;
      if (discountType === 'percent' && Number(discountValue) > 100) {
        return { kind: 'invalid-discount' };
      }
      const reference = await this.references(client, organizationId, values);
      if (reference) return reference;

      const assignments: string[] = [];
      const parameters: unknown[] = [estimateId, organizationId];
      const set = (column: string, value: unknown) => {
        parameters.push(value);
        assignments.push(`${column} = $${parameters.length}`);
      };
      const fields: Array<[keyof EstimateUpdates, string]> = [
        ['contactId', 'contact_id'], ['customerName', 'customer_name'],
        ['customerEmail', 'customer_email'], ['customerPhone', 'customer_phone'],
        ['customerAddress', 'customer_address'], ['validUntil', 'valid_until'],
        ['discountType', 'discount_type'], ['discountValue', 'discount_value'],
        ['notes', 'notes'], ['termsAndConditions', 'terms_and_conditions'],
      ];
      for (const [key, column] of fields) {
        if (values[key] !== undefined) set(column, values[key]);
      }
      if (values.items !== undefined) {
        const totals = await this.totals(
          client,
          values.items,
          discountType,
          discountValue,
        );
        if (Number(totals.total) < 0) return { kind: 'negative-total' };
        set('subtotal', totals.subtotal);
        set('tax_amount', totals.taxAmount);
        set('discount_amount', totals.discountAmount);
        set('total', totals.total);
        await this.replaceItems(client, organizationId, estimateId, values.items);
      }
      if (assignments.length > 0) {
        await client.query(
          `UPDATE estimates SET ${assignments.join(', ')},
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2`,
          parameters,
        );
      }
      const aggregate = await this.load(client, organizationId, estimateId);
      if (!aggregate) return { kind: 'not-found' };
      return { kind: 'saved', aggregate };
    });
  }

  async delete(
    organizationId: number,
    estimateId: number,
  ): Promise<{ id: number; estimate_number: string } | null> {
    const result = await this.pool.query<{ id: number; estimate_number: string }>(
      `DELETE FROM estimates
       WHERE id = $1 AND organization_id = $2
       RETURNING id, estimate_number`,
      [estimateId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async references(
    client: PoolClient,
    organizationId: number,
    values: Partial<EstimateValues>,
  ): Promise<EstimateWriteOutcome | null> {
    if (values.contactId !== undefined && values.contactId !== null) {
      const contact = await client.query(
        'SELECT 1 FROM contacts WHERE id = $1 AND organization_id = $2',
        [values.contactId, organizationId],
      );
      if (!contact.rows[0]) return { kind: 'contact-not-found' };
    }
    const productIds = [...new Set(
      (values.items ?? [])
        .map((item) => item.productId)
        .filter((id): id is number => id !== null),
    )];
    if (productIds.length > 0) {
      const products = await client.query<{ id: number }>(
        `SELECT id FROM products
         WHERE organization_id = $1 AND id = ANY($2::int[])`,
        [organizationId, productIds],
      );
      if (products.rows.length !== productIds.length) {
        return { kind: 'product-not-found' };
      }
    }
    return null;
  }

  private async totals(
    client: PoolClient,
    items: EstimateItemValues[],
    discountType: string | null,
    discountValue: string,
  ) {
    const result = await client.query<{
      subtotal: string;
      tax_amount: string;
      discount_amount: string;
      total: string;
    }>(
      `WITH lines AS (
         SELECT
           COALESCE(SUM(
             (item->>'quantity')::numeric * (item->>'unitPrice')::numeric
           ), 0) AS subtotal,
           COALESCE(SUM(
             (item->>'quantity')::numeric * (item->>'unitPrice')::numeric *
             (item->>'taxRate')::numeric / 100
           ), 0) AS tax_amount
         FROM jsonb_array_elements($1::jsonb) item
       ), amounts AS (
         SELECT ROUND(subtotal, 2) AS subtotal,
                ROUND(tax_amount, 2) AS tax_amount,
                ROUND(CASE
                  WHEN $2::text = 'percent'
                    THEN subtotal * $3::numeric / 100
                  WHEN $2::text = 'fixed' THEN $3::numeric
                  ELSE 0
                END, 2) AS discount_amount
         FROM lines
       )
       SELECT subtotal::text, tax_amount::text, discount_amount::text,
              ROUND(subtotal + tax_amount - discount_amount, 2)::text AS total
       FROM amounts`,
      [JSON.stringify(items), discountType, discountValue],
    );
    return {
      subtotal: result.rows[0].subtotal,
      taxAmount: result.rows[0].tax_amount,
      discountAmount: result.rows[0].discount_amount,
      total: result.rows[0].total,
    };
  }

  private async allocateNumber(
    client: PoolClient,
    organizationId: number,
  ): Promise<string> {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('estimate_number'), $1::integer)",
      [organizationId],
    );
    const result = await client.query<{ next_num: string }>(
      `SELECT COALESCE(MAX(
         CAST(REGEXP_REPLACE(estimate_number, '[^0-9]', '', 'g') AS INTEGER)
       ), 0) + 1 AS next_num
       FROM estimates
       WHERE organization_id = $1`,
      [organizationId],
    );
    return `EST-${String(Number(result.rows[0].next_num)).padStart(5, '0')}`;
  }

  private async replaceItems(
    client: PoolClient,
    organizationId: number,
    estimateId: number,
    items: EstimateItemValues[],
  ): Promise<void> {
    await client.query(
      `DELETE FROM estimate_items
       WHERE estimate_id = $1 AND organization_id = $2`,
      [estimateId, organizationId],
    );
    for (const [index, item] of items.entries()) {
      await client.query(
        `INSERT INTO estimate_items (
           estimate_id, organization_id, product_id, name, description,
           quantity, unit_price, tax_rate, tax_amount, total, sort_order
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           ROUND($6::numeric * $7::numeric * $8::numeric / 100, 2),
           ROUND(
             ($6::numeric * $7::numeric) +
             ($6::numeric * $7::numeric * $8::numeric / 100),
             2
           ),
           $9
         )`,
        [
          estimateId, organizationId, item.productId, item.name,
          item.description, item.quantity, item.unitPrice, item.taxRate, index,
        ],
      );
    }
  }

  private async load(
    client: PoolClient,
    organizationId: number,
    estimateId: number,
  ): Promise<EstimateAggregate | null> {
    const estimate = await client.query<EstimateRow>(
      `SELECT ${selection}
       FROM estimates e
       LEFT JOIN contacts c
         ON c.id = e.contact_id AND c.organization_id = e.organization_id
       WHERE e.id = $1 AND e.organization_id = $2`,
      [estimateId, organizationId],
    );
    if (!estimate.rows[0]) return null;
    const items = await client.query<EstimateItemRow>(
      `SELECT ei.id, ei.estimate_id, ei.organization_id, ei.product_id,
              ei.name, ei.description, ei.quantity, ei.unit_price,
              ei.tax_rate, ei.tax_amount, ei.discount_amount, ei.total,
              ei.sort_order, p.name AS product_name,
              ei.created_at, ei.updated_at
       FROM estimate_items ei
       LEFT JOIN products p
         ON p.id = ei.product_id AND p.organization_id = ei.organization_id
       WHERE ei.estimate_id = $1 AND ei.organization_id = $2
       ORDER BY ei.sort_order, ei.id`,
      [estimateId, organizationId],
    );
    return { estimate: estimate.rows[0], items: items.rows };
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
