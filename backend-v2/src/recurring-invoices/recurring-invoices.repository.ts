import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type RecurringInvoiceItemValues = {
  productId: number | null;
  name: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

export type RecurringInvoiceValues = {
  templateName: string;
  contactId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  frequency: string;
  startDate: string;
  endDate: string | null;
  items: RecurringInvoiceItemValues[];
  discountType: string | null;
  discountValue: string;
  notes: string | null;
  paymentTerms: string | null;
};

export type RecurringInvoiceUpdates = Partial<
  Omit<RecurringInvoiceValues, 'startDate' | 'items'>
> & { items?: RecurringInvoiceItemValues[] };

export type RecurringInvoiceRow = {
  id: number;
  organization_id: number;
  template_name: string;
  contact_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  frequency: string;
  start_date: string;
  end_date: string | null;
  next_run_date: string | null;
  last_generated_at: Date | null;
  status: string;
  items: unknown;
  subtotal: string;
  tax_amount: string;
  discount_amount: string;
  discount_type: string | null;
  discount_value: string;
  total: string;
  currency: string;
  notes: string | null;
  payment_terms: string | null;
  custom_fields: Record<string, unknown> | null;
  source_invoice_id: number | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  source_invoice_number: string | null;
  invoices_generated: string;
};

export type RecurringInvoiceWriteOutcome =
  | { kind: 'saved'; row: RecurringInvoiceRow }
  | { kind: 'not-found' }
  | { kind: 'contact-not-found' }
  | { kind: 'product-not-found' }
  | { kind: 'invalid-date-order' }
  | { kind: 'invalid-discount' }
  | { kind: 'negative-total' };

export type RecurringInvoiceLifecycleOutcome =
  | { kind: 'saved'; row: RecurringInvoiceRow }
  | { kind: 'not-found' }
  | { kind: 'invalid-state'; actualStatus: string };

export type RecurringInvoiceHistoryRow = {
  id: number;
  invoice_number: string;
  total: string;
  status: string;
  created_at: Date;
};

export type RecurringInvoiceHistoryOutcome =
  | { kind: 'found'; rows: RecurringInvoiceHistoryRow[]; total: number }
  | { kind: 'not-found' };

export type RecurringInvoiceCloneValues = {
  templateName: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
};

export type RecurringInvoiceCloneOutcome =
  | { kind: 'saved'; row: RecurringInvoiceRow }
  | { kind: 'not-found' }
  | { kind: 'invalid-state'; actualStatus: string }
  | { kind: 'no-items' }
  | { kind: 'invalid-source' }
  | { kind: 'invalid-discount' }
  | { kind: 'negative-total' };

export type RecurringInvoiceGeneration = {
  invoiceId: number;
  invoiceNumber: string;
  nextRunDate: string | null;
  templateStatus: string;
  replayed: boolean;
};

export type RecurringInvoiceGenerationOutcome =
  | { kind: 'generated'; result: RecurringInvoiceGeneration }
  | { kind: 'not-found' }
  | { kind: 'completed' }
  | { kind: 'not-due' }
  | { kind: 'invalid-template' };

export type ScheduledRecurringInvoiceFailure = {
  templateId: number;
  organizationId: number;
  reason: 'INVALID_TEMPLATE' | 'DATABASE_ERROR';
};

export type ScheduledRecurringInvoiceGeneration = {
  candidates: number;
  generated: RecurringInvoiceGeneration[];
  replayed: number;
  skipped: number;
  failures: ScheduledRecurringInvoiceFailure[];
};

export type RecurringInvoiceCriteria = {
  organizationId: number;
  status?: string;
  pageSize: number;
  offset: number;
};

const selection = `
  r.id, r.organization_id, r.template_name, r.contact_id,
  r.customer_name, r.customer_email, r.customer_phone, r.customer_address,
  r.frequency, r.start_date::text, r.end_date::text, r.next_run_date::text,
  r.last_generated_at, r.status, r.items, r.subtotal, r.tax_amount,
  r.discount_amount, r.discount_type, r.discount_value, r.total, r.currency,
  r.notes, r.payment_terms, r.custom_fields, r.source_invoice_id,
  r.created_by, r.created_at, r.updated_at,
  c.first_name AS contact_first_name, c.last_name AS contact_last_name,
  c.email AS contact_email, si.invoice_number AS source_invoice_number,
  (SELECT COUNT(*) FROM invoices generated
   WHERE generated.recurring_template_id = r.id
     AND generated.organization_id = r.organization_id) AS invoices_generated`;

@Injectable()
export class RecurringInvoicesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(
    criteria: RecurringInvoiceCriteria,
  ): Promise<{ rows: RecurringInvoiceRow[]; total: number }> {
    const values: unknown[] = [criteria.organizationId];
    const clauses = ['r.organization_id = $1'];
    if (criteria.status !== undefined) {
      values.push(criteria.status);
      clauses.push(`r.status = $${values.length}`);
    }
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM recurring_invoice_templates r WHERE ${where}`,
      values,
    );
    values.push(criteria.pageSize, criteria.offset);
    const rows = await this.pool.query<RecurringInvoiceRow>(
      `SELECT ${selection}
       FROM recurring_invoice_templates r
       LEFT JOIN contacts c
         ON c.id = r.contact_id AND c.organization_id = r.organization_id
       LEFT JOIN invoices si
         ON si.id = r.source_invoice_id AND si.organization_id = r.organization_id
       WHERE ${where}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { rows: rows.rows, total: Number(count.rows[0].total) };
  }

  async findById(
    organizationId: number,
    recurringInvoiceId: number,
  ): Promise<RecurringInvoiceRow | null> {
    const result = await this.pool.query<RecurringInvoiceRow>(
      `SELECT ${selection}
       FROM recurring_invoice_templates r
       LEFT JOIN contacts c
         ON c.id = r.contact_id AND c.organization_id = r.organization_id
       LEFT JOIN invoices si
         ON si.id = r.source_invoice_id AND si.organization_id = r.organization_id
       WHERE r.id = $1 AND r.organization_id = $2`,
      [recurringInvoiceId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async previewInvoiceNumber(organizationId: number): Promise<string> {
    const result = await this.pool.query<{
      invoice_prefix: string;
      next_invoice_number: string;
    }>(
      `SELECT
         COALESCE(NULLIF(invoice_prefix, ''), 'INV-') AS invoice_prefix,
         GREATEST(COALESCE(next_invoice_number, 1), 1) AS next_invoice_number
       FROM payment_settings
       WHERE organization_id = $1`,
      [organizationId],
    );
    const prefix = result.rows[0]?.invoice_prefix ?? 'INV-';
    const nextNumber = String(result.rows[0]?.next_invoice_number ?? 1);
    return `${prefix}${nextNumber.padStart(5, '0')}`;
  }

  async create(
    organizationId: number,
    userId: number,
    values: RecurringInvoiceValues,
  ): Promise<RecurringInvoiceWriteOutcome> {
    return this.transaction(async (client) => {
      const reference = await this.references(client, organizationId, values);
      if (reference) return reference;
      if (values.endDate !== null && values.endDate < values.startDate) {
        return { kind: 'invalid-date-order' };
      }
      const discount = this.discount(values.discountType, values.discountValue);
      if (!discount) return { kind: 'invalid-discount' };
      const totals = await this.totals(
        client, values.items, values.discountType, values.discountValue,
      );
      if (Number(totals.total) < 0) return { kind: 'negative-total' };
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO recurring_invoice_templates (
           organization_id, template_name, contact_id, customer_name,
           customer_email, frequency, start_date, end_date, next_run_date,
           items, subtotal, tax_amount, discount_amount, discount_type,
           discount_value, total, notes, payment_terms, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7::date, $8::date, $7::date,
           $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17, $18
         ) RETURNING id`,
        [
          organizationId, values.templateName, values.contactId,
          values.customerName, values.customerEmail, values.frequency,
          values.startDate, values.endDate, JSON.stringify(this.storedItems(values.items)),
          totals.subtotal, totals.taxAmount, totals.discountAmount,
          values.discountType, values.discountValue, totals.total,
          values.notes, values.paymentTerms, userId,
        ],
      );
      const row = await this.load(client, organizationId, Number(inserted.rows[0].id));
      if (!row) throw new Error('Created recurring invoice could not be reloaded');
      return { kind: 'saved', row };
    });
  }

  async createFromInvoice(
    organizationId: number,
    userId: number,
    invoiceId: number,
    values: RecurringInvoiceCloneValues,
  ): Promise<RecurringInvoiceCloneOutcome> {
    return this.transaction(async (client) => {
      const invoiceResult = await client.query<{
        status: string;
        contact_id: number | null;
        customer_name: string | null;
        customer_email: string | null;
        discount_type: string | null;
        discount_value: string;
        notes: string | null;
        payment_terms: string | null;
      }>(
        `SELECT i.status,
                CASE WHEN c.id IS NULL THEN NULL ELSE i.contact_id END AS contact_id,
                i.customer_name, i.customer_email, i.discount_type,
                COALESCE(i.discount_value, 0)::text AS discount_value,
                i.notes, i.payment_terms
         FROM invoices i
         LEFT JOIN contacts c
           ON c.id = i.contact_id AND c.organization_id = i.organization_id
         WHERE i.id = $1 AND i.organization_id = $2
         FOR UPDATE OF i`,
        [invoiceId, organizationId],
      );
      const invoice = invoiceResult.rows[0];
      if (!invoice) return { kind: 'not-found' };
      if (['cancelled', 'refunded'].includes(invoice.status)) {
        return { kind: 'invalid-state', actualStatus: invoice.status };
      }
      if ((invoice.payment_terms?.length ?? 0) > 50) {
        return { kind: 'invalid-source' };
      }
      const itemResult = await client.query<{
        product_id: number | null;
        name: string;
        description: string | null;
        quantity: string;
        unit_price: string;
        tax_rate: string;
      }>(
        `SELECT CASE WHEN p.id IS NULL THEN NULL ELSE ii.product_id END AS product_id,
                ii.name, ii.description, ii.quantity, ii.unit_price, ii.tax_rate
         FROM invoice_items ii
         LEFT JOIN products p
           ON p.id = ii.product_id AND p.organization_id = ii.organization_id
         WHERE ii.invoice_id = $1 AND ii.organization_id = $2
         ORDER BY ii.sort_order, ii.id
         FOR SHARE OF ii`,
        [invoiceId, organizationId],
      );
      if (itemResult.rows.length === 0) return { kind: 'no-items' };
      const items = itemResult.rows.map((item): RecurringInvoiceItemValues => ({
        productId: item.product_id === null ? null : Number(item.product_id),
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        taxRate: item.tax_rate,
      }));
      if (!this.discount(invoice.discount_type, invoice.discount_value)) {
        return { kind: 'invalid-discount' };
      }
      const totals = await this.totals(
        client, items, invoice.discount_type, invoice.discount_value,
      );
      if (Number(totals.total) < 0) return { kind: 'negative-total' };
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO recurring_invoice_templates (
           organization_id, template_name, contact_id, customer_name,
           customer_email, frequency, start_date, end_date, next_run_date,
           items, subtotal, tax_amount, discount_amount, discount_type,
           discount_value, total, notes, payment_terms, created_by, status,
           source_invoice_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7::date, $8::date, $7::date, $9::jsonb,
           $10, $11, $12, $13, $14, $15, $16, $17, $18, 'active', $19
         ) RETURNING id`,
        [
          organizationId, values.templateName, invoice.contact_id,
          invoice.customer_name, invoice.customer_email, values.frequency,
          values.startDate, values.endDate,
          JSON.stringify(this.storedItems(items)), totals.subtotal,
          totals.taxAmount, totals.discountAmount, invoice.discount_type,
          invoice.discount_value, totals.total, invoice.notes,
          invoice.payment_terms, userId, invoiceId,
        ],
      );
      await client.query(
        `UPDATE invoices
         SET is_recurring_source = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [invoiceId, organizationId],
      );
      const row = await this.load(
        client, organizationId, Number(inserted.rows[0].id),
      );
      if (!row) throw new Error('Cloned recurring invoice could not be reloaded');
      return { kind: 'saved', row };
    });
  }

  async update(
    organizationId: number,
    recurringInvoiceId: number,
    values: RecurringInvoiceUpdates,
  ): Promise<RecurringInvoiceWriteOutcome> {
    return this.transaction(async (client) => {
      const locked = await client.query<{
        start_date: string;
        end_date: string | null;
        items: unknown;
        discount_type: string | null;
        discount_value: string;
      }>(
        `SELECT start_date::text, end_date::text, items,
                discount_type, discount_value
         FROM recurring_invoice_templates
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [recurringInvoiceId, organizationId],
      );
      const current = locked.rows[0];
      if (!current) return { kind: 'not-found' };
      const endDate = values.endDate === undefined ? current.end_date : values.endDate;
      if (endDate !== null && endDate < current.start_date) {
        return { kind: 'invalid-date-order' };
      }
      const reference = await this.references(client, organizationId, values);
      if (reference) return reference;
      const discountType = values.discountType === undefined
        ? current.discount_type
        : values.discountType;
      const discountValue = values.discountValue ?? current.discount_value;
      if (!this.discount(discountType, discountValue)) {
        return { kind: 'invalid-discount' };
      }

      const assignments: string[] = [];
      const parameters: unknown[] = [recurringInvoiceId, organizationId];
      const set = (column: string, value: unknown, cast = '') => {
        parameters.push(value);
        assignments.push(`${column} = $${parameters.length}${cast}`);
      };
      const fields: Array<[keyof RecurringInvoiceUpdates, string, string?]> = [
        ['templateName', 'template_name'], ['contactId', 'contact_id'],
        ['customerName', 'customer_name'], ['customerEmail', 'customer_email'],
        ['frequency', 'frequency'], ['endDate', 'end_date', '::date'],
        ['discountType', 'discount_type'], ['discountValue', 'discount_value'],
        ['notes', 'notes'], ['paymentTerms', 'payment_terms'],
      ];
      for (const [key, column, cast] of fields) {
        if (values[key] !== undefined) set(column, values[key], cast);
      }
      if (
        values.items !== undefined ||
        values.discountType !== undefined ||
        values.discountValue !== undefined
      ) {
        const items = values.items ?? this.itemValues(current.items);
        const totals = await this.totals(client, items, discountType, discountValue);
        if (Number(totals.total) < 0) return { kind: 'negative-total' };
        if (values.items !== undefined) {
          set('items', JSON.stringify(this.storedItems(values.items)), '::jsonb');
        }
        set('subtotal', totals.subtotal);
        set('tax_amount', totals.taxAmount);
        set('discount_amount', totals.discountAmount);
        set('total', totals.total);
      }
      if (assignments.length > 0) {
        await client.query(
          `UPDATE recurring_invoice_templates
           SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2`,
          parameters,
        );
      }
      const row = await this.load(client, organizationId, recurringInvoiceId);
      if (!row) return { kind: 'not-found' };
      return { kind: 'saved', row };
    });
  }

  async delete(
    organizationId: number,
    recurringInvoiceId: number,
  ): Promise<{ id: number; template_name: string } | null> {
    const result = await this.pool.query<{ id: number; template_name: string }>(
      `DELETE FROM recurring_invoice_templates
       WHERE id = $1 AND organization_id = $2
       RETURNING id, template_name`,
      [recurringInvoiceId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async pause(
    organizationId: number,
    recurringInvoiceId: number,
  ): Promise<RecurringInvoiceLifecycleOutcome> {
    return this.transaction(async (client) => {
      const locked = await client.query<{ status: string }>(
        `SELECT status
         FROM recurring_invoice_templates
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [recurringInvoiceId, organizationId],
      );
      const current = locked.rows[0];
      if (!current) return { kind: 'not-found' };
      if (current.status !== 'active') {
        return { kind: 'invalid-state', actualStatus: current.status };
      }
      await client.query(
        `UPDATE recurring_invoice_templates
         SET status = 'paused', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [recurringInvoiceId, organizationId],
      );
      const row = await this.load(client, organizationId, recurringInvoiceId);
      if (!row) return { kind: 'not-found' };
      return { kind: 'saved', row };
    });
  }

  async resume(
    organizationId: number,
    recurringInvoiceId: number,
  ): Promise<RecurringInvoiceLifecycleOutcome> {
    return this.transaction(async (client) => {
      const locked = await client.query<{
        status: string;
        start_date: string;
        next_run_date: string | null;
        frequency: string;
        today: string;
      }>(
        `SELECT status, start_date::text, next_run_date::text, frequency,
                CURRENT_DATE::text AS today
         FROM recurring_invoice_templates
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [recurringInvoiceId, organizationId],
      );
      const current = locked.rows[0];
      if (!current) return { kind: 'not-found' };
      if (current.status !== 'paused') {
        return { kind: 'invalid-state', actualStatus: current.status };
      }
      const nextRunDate = this.futureRunDate(
        current.start_date,
        current.frequency,
        current.next_run_date,
        current.today,
      );
      await client.query(
        `UPDATE recurring_invoice_templates
         SET status = 'active', next_run_date = $3::date,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [recurringInvoiceId, organizationId, nextRunDate],
      );
      const row = await this.load(client, organizationId, recurringInvoiceId);
      if (!row) return { kind: 'not-found' };
      return { kind: 'saved', row };
    });
  }

  async generateNow(
    organizationId: number,
    userId: number | null,
    recurringInvoiceId: number,
    idempotencyKey: string,
    scheduledRunDate?: string,
  ): Promise<RecurringInvoiceGenerationOutcome> {
    return this.transaction(async (client) => {
      const locked = await client.query<{
        id: number;
        contact_id: number | null;
        customer_name: string | null;
        customer_email: string | null;
        contact_email: string | null;
        frequency: string;
        start_date: string;
        end_date: string | null;
        next_run_date: string | null;
        status: string;
        items: unknown;
        subtotal: string;
        tax_amount: string;
        discount_amount: string;
        discount_type: string | null;
        discount_value: string;
        total: string;
        notes: string | null;
        payment_terms: string | null;
        today: string;
      }>(
        `SELECT r.id,
                CASE WHEN c.id IS NULL THEN NULL ELSE r.contact_id END AS contact_id,
                r.customer_name, r.customer_email, c.email AS contact_email,
                r.frequency, r.start_date::text, r.end_date::text,
                r.next_run_date::text, r.status, r.items, r.subtotal,
                r.tax_amount, r.discount_amount, r.discount_type,
                r.discount_value, r.total, r.notes, r.payment_terms,
                CURRENT_DATE::text AS today
         FROM recurring_invoice_templates r
         LEFT JOIN contacts c
           ON c.id = r.contact_id AND c.organization_id = r.organization_id
         WHERE r.id = $1 AND r.organization_id = $2
         FOR UPDATE OF r`,
        [recurringInvoiceId, organizationId],
      );
      const template = locked.rows[0];
      if (!template) return { kind: 'not-found' };

      const replay = await client.query<{
        id: number;
        invoice_number: string;
        next_run_date: string | null;
        template_status: string;
      }>(
        `SELECT id, invoice_number,
                NULLIF(custom_fields #>> '{_itemize,recurringGeneration,nextRunDate}', '')
                  AS next_run_date,
                custom_fields #>> '{_itemize,recurringGeneration,templateStatus}'
                  AS template_status
         FROM invoices
         WHERE organization_id = $1
           AND recurring_template_id = $2
           AND custom_fields #>> '{_itemize,recurringGeneration,idempotencyKey}' = $3
         ORDER BY id
         LIMIT 1`,
        [organizationId, recurringInvoiceId, idempotencyKey],
      );
      if (replay.rows[0]) {
        return {
          kind: 'generated',
          result: {
            invoiceId: Number(replay.rows[0].id),
            invoiceNumber: replay.rows[0].invoice_number,
            nextRunDate: replay.rows[0].next_run_date,
            templateStatus:
              replay.rows[0].template_status || template.status,
            replayed: true,
          },
        };
      }
      if (
        scheduledRunDate !== undefined &&
        (
          template.status !== 'active' ||
          template.next_run_date !== scheduledRunDate ||
          scheduledRunDate > template.today ||
          (template.end_date !== null && template.end_date < template.today)
        )
      ) {
        return { kind: 'not-due' };
      }
      if (template.status === 'completed') return { kind: 'completed' };

      const items = this.generationItems(template.items);
      const paymentTermDays = this.paymentTermDays(template.payment_terms);
      if (
        !items ||
        paymentTermDays === null ||
        !this.generationTotals(template)
      ) {
        return { kind: 'invalid-template' };
      }
      const productIds = [...new Set(
        items
          .map((item) => item.productId)
          .filter((id): id is number => id !== null),
      )];
      if (productIds.length > 0) {
        const products = await client.query<{ id: number }>(
          `SELECT id FROM products
           WHERE organization_id = $1 AND id = ANY($2::int[])`,
          [organizationId, productIds],
        );
        const allowed = new Set(products.rows.map((row) => Number(row.id)));
        for (const item of items) {
          if (item.productId !== null && !allowed.has(item.productId)) {
            item.productId = null;
          }
        }
      }

      const currentRunDate = template.next_run_date ?? template.start_date;
      const followingRunDate = this.nextRunDate(
        currentRunDate,
        template.frequency,
      );
      if (!followingRunDate) return { kind: 'invalid-template' };
      const completed =
        template.end_date !== null && followingRunDate > template.end_date;
      const storedNextRunDate = completed
        ? template.end_date
        : followingRunDate;
      const responseNextRunDate = completed ? null : followingRunDate;
      const templateStatus = completed ? 'completed' : template.status;

      const allocation = await client.query<{
        invoice_prefix: string;
        allocated_number: string;
      }>(
        `INSERT INTO payment_settings (organization_id, next_invoice_number)
         VALUES ($1, 2)
         ON CONFLICT (organization_id) DO UPDATE SET
           next_invoice_number =
             GREATEST(COALESCE(payment_settings.next_invoice_number, 1), 1) + 1,
           updated_at = CURRENT_TIMESTAMP
         RETURNING COALESCE(invoice_prefix, 'INV-') AS invoice_prefix,
                   next_invoice_number - 1 AS allocated_number`,
        [organizationId],
      );
      const invoiceNumber =
        `${allocation.rows[0].invoice_prefix}` +
        `${allocation.rows[0].allocated_number}`.padStart(5, '0');
      const metadata = {
        _itemize: {
          recurringGeneration: {
            idempotencyKey,
            nextRunDate: responseNextRunDate ?? '',
            templateStatus,
          },
        },
      };
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO invoices (
           organization_id, invoice_number, contact_id,
           customer_name, customer_email, due_date, subtotal, tax_amount,
           discount_amount, discount_type, discount_value, total, amount_due,
           notes, recurring_template_id, custom_fields, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, CURRENT_DATE + $6::int, $7, $8, $9, $10,
           $11, $12, $12, $13, $14, $15::jsonb, $16
         ) RETURNING id`,
        [
          organizationId, invoiceNumber, template.contact_id,
          template.customer_name,
          template.customer_email || template.contact_email,
          paymentTermDays, template.subtotal, template.tax_amount,
          template.discount_amount, template.discount_type,
          template.discount_value, template.total, template.notes,
          recurringInvoiceId, JSON.stringify(metadata), userId,
        ],
      );
      const invoiceId = Number(inserted.rows[0].id);
      for (const [index, item] of items.entries()) {
        await client.query(
          `INSERT INTO invoice_items (
             invoice_id, organization_id, product_id, name, description,
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
            invoiceId, organizationId, item.productId, item.name,
            item.description, item.quantity, item.unitPrice, item.taxRate,
            index,
          ],
        );
      }
      await client.query(
        `UPDATE recurring_invoice_templates
         SET next_run_date = $3::date,
             last_generated_at = CURRENT_TIMESTAMP,
             status = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [
          recurringInvoiceId, organizationId, storedNextRunDate,
          templateStatus,
        ],
      );
      return {
        kind: 'generated',
        result: {
          invoiceId,
          invoiceNumber,
          nextRunDate: responseNextRunDate,
          templateStatus,
          replayed: false,
        },
      };
    });
  }

  async generateDue(
    batchSize: number,
  ): Promise<ScheduledRecurringInvoiceGeneration> {
    const due = await this.pool.query<{
      id: number;
      organization_id: number;
      created_by: number | null;
      next_run_date: string;
    }>(
      `SELECT id, organization_id, created_by, next_run_date::text
       FROM recurring_invoice_templates
       WHERE status = 'active'
         AND next_run_date <= CURRENT_DATE
         AND (end_date IS NULL OR end_date >= CURRENT_DATE)
       ORDER BY next_run_date, id
       LIMIT $1`,
      [batchSize],
    );
    const result: ScheduledRecurringInvoiceGeneration = {
      candidates: due.rows.length,
      generated: [],
      replayed: 0,
      skipped: 0,
      failures: [],
    };
    for (const candidate of due.rows) {
      try {
        const outcome = await this.generateNow(
          Number(candidate.organization_id),
          candidate.created_by === null ? null : Number(candidate.created_by),
          Number(candidate.id),
          `scheduled-${candidate.id}-${candidate.next_run_date}`,
          candidate.next_run_date,
        );
        if (outcome.kind === 'generated') {
          if (outcome.result.replayed) result.replayed += 1;
          else result.generated.push(outcome.result);
        } else if (outcome.kind === 'invalid-template') {
          result.failures.push({
            templateId: Number(candidate.id),
            organizationId: Number(candidate.organization_id),
            reason: 'INVALID_TEMPLATE',
          });
        } else {
          result.skipped += 1;
        }
      } catch {
        result.failures.push({
          templateId: Number(candidate.id),
          organizationId: Number(candidate.organization_id),
          reason: 'DATABASE_ERROR',
        });
      }
    }
    return result;
  }

  async findHistoryPage(
    organizationId: number,
    recurringInvoiceId: number,
    pageSize: number,
    offset: number,
  ): Promise<RecurringInvoiceHistoryOutcome> {
    const template = await this.pool.query(
      `SELECT 1 FROM recurring_invoice_templates
       WHERE id = $1 AND organization_id = $2`,
      [recurringInvoiceId, organizationId],
    );
    if (!template.rows[0]) return { kind: 'not-found' };
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM invoices
       WHERE recurring_template_id = $1 AND organization_id = $2`,
      [recurringInvoiceId, organizationId],
    );
    const rows = await this.pool.query<RecurringInvoiceHistoryRow>(
      `SELECT id, invoice_number, total, status, created_at
       FROM invoices
       WHERE recurring_template_id = $1 AND organization_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT $3 OFFSET $4`,
      [recurringInvoiceId, organizationId, pageSize, offset],
    );
    return {
      kind: 'found',
      rows: rows.rows,
      total: Number(count.rows[0].total),
    };
  }

  private async load(
    client: PoolClient,
    organizationId: number,
    recurringInvoiceId: number,
  ): Promise<RecurringInvoiceRow | null> {
    const result = await client.query<RecurringInvoiceRow>(
      `SELECT ${selection}
       FROM recurring_invoice_templates r
       LEFT JOIN contacts c
         ON c.id = r.contact_id AND c.organization_id = r.organization_id
       LEFT JOIN invoices si
         ON si.id = r.source_invoice_id AND si.organization_id = r.organization_id
       WHERE r.id = $1 AND r.organization_id = $2`,
      [recurringInvoiceId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  private async references(
    client: PoolClient,
    organizationId: number,
    values: Partial<RecurringInvoiceValues>,
  ): Promise<RecurringInvoiceWriteOutcome | null> {
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
    items: RecurringInvoiceItemValues[],
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
                  WHEN $2::text = 'percent' THEN subtotal * $3::numeric / 100
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

  private discount(type: string | null, value: string): boolean {
    const amount = Number(value);
    if (amount > 0 && type === null) return false;
    if (type === 'percent' && amount > 100) return false;
    return true;
  }

  private storedItems(items: RecurringInvoiceItemValues[]) {
    return items.map((item) => ({
      product_id: item.productId,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      tax_rate: item.taxRate,
    }));
  }

  private itemValues(value: unknown): RecurringInvoiceItemValues[] {
    if (!Array.isArray(value)) throw new Error('Stored recurring items are invalid');
    return value.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error('Stored recurring item is invalid');
      }
      const item = entry as Record<string, unknown>;
      const rawProductId = item.productId ?? item.product_id;
      return {
        productId: Number.isSafeInteger(Number(rawProductId)) && Number(rawProductId) > 0
          ? Number(rawProductId)
          : null,
        name: String(item.name ?? ''),
        description: item.description === undefined || item.description === null
          ? null : String(item.description),
        quantity: String(item.quantity ?? '1'),
        unitPrice: String(item.unitPrice ?? item.unit_price ?? '0'),
        taxRate: String(item.taxRate ?? item.tax_rate ?? '0'),
      };
    });
  }

  private generationItems(value: unknown): RecurringInvoiceItemValues[] | null {
    if (!Array.isArray(value)) return null;
    let items: RecurringInvoiceItemValues[];
    try {
      items = this.itemValues(value);
    } catch {
      return null;
    }
    if (items.length < 1 || items.length > 100) return null;
    const money = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
    const rate = /^(?:(?:0|[1-9]\d?)(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/;
    if (items.some((item) =>
      item.name.trim().length < 1 ||
      item.name.length > 255 ||
      !money.test(item.quantity) ||
      Number(item.quantity) <= 0 ||
      !money.test(item.unitPrice) ||
      !rate.test(item.taxRate)
    )) {
      return null;
    }
    return items;
  }

  private generationTotals(template: {
    subtotal: string;
    tax_amount: string;
    discount_amount: string;
    discount_value: string;
    total: string;
  }): boolean {
    const money = /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/;
    return [
      template.subtotal,
      template.tax_amount,
      template.discount_amount,
      template.discount_value,
      template.total,
    ].every((value) => money.test(String(value)));
  }

  private paymentTermDays(value: string | null): number | null {
    if (value === null || value.trim() === '') return 30;
    const days = Number.parseInt(value, 10);
    return Number.isSafeInteger(days) && Math.abs(days) <= 36_500
      ? days
      : null;
  }

  private nextRunDate(currentDate: string, frequency: string): string | null {
    const date = new Date(`${currentDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return null;
    if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
    else if (frequency === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
    else if (frequency === 'quarterly') date.setUTCMonth(date.getUTCMonth() + 3);
    else if (frequency === 'yearly') date.setUTCFullYear(date.getUTCFullYear() + 1);
    else return null;
    return date.toISOString().slice(0, 10);
  }

  private futureRunDate(
    startDate: string,
    frequency: string,
    nextRunDate: string | null,
    today: string,
  ): string {
    let candidate = nextRunDate ?? startDate;
    while (candidate <= today) {
      const date = new Date(`${candidate}T00:00:00.000Z`);
      if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
      else if (frequency === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
      else if (frequency === 'quarterly') date.setUTCMonth(date.getUTCMonth() + 3);
      else if (frequency === 'yearly') date.setUTCFullYear(date.getUTCFullYear() + 1);
      else throw new Error(`Unsupported recurring frequency: ${frequency}`);
      candidate = date.toISOString().slice(0, 10);
    }
    return candidate;
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
