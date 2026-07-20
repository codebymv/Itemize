import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export type InvoiceRow = {
  id: number;
  organization_id: number;
  invoice_number: string;
  contact_id: number | null;
  business_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  issue_date: string;
  due_date: string;
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  discount_amount: string;
  discount_type: string | null;
  discount_value: string;
  total: string;
  amount_paid: string;
  amount_due: string;
  currency: string;
  status: string;
  payment_terms: string | null;
  payment_instructions: string | null;
  notes: string | null;
  terms_and_conditions: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_hosted_invoice_url: string | null;
  stripe_pdf_url: string | null;
  sent_at: Date | null;
  viewed_at: Date | null;
  paid_at: Date | null;
  is_recurring: boolean;
  recurring_interval: string | null;
  parent_invoice_id: number | null;
  custom_fields: Record<string, unknown> | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_email: string | null;
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  business_tax_id: string | null;
  business_logo_url: string | null;
};

export type InvoiceItemRow = {
  id: number;
  invoice_id: number;
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
};

export type InvoicePaymentRow = {
  id: number;
  amount: string;
  currency: string;
  payment_method: string;
  status: string;
  notes: string | null;
  paid_at: Date | null;
  created_at: Date;
};

export type InvoiceAggregate = {
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  payments: InvoicePaymentRow[];
};

export type InvoiceEmailPayload = {
  subject: string;
  message: string;
  ccEmails: string[];
  includePaymentLink: boolean;
  resend: boolean;
  invoice: Record<string, unknown>;
  settings: Record<string, unknown>;
};

export type InvoiceEmailDeliveryRow = {
  id: number;
  organization_id: number;
  invoice_id: number;
  requested_by_user_id: number | null;
  idempotency_key: string;
  recipient_email: string;
  subject: string;
  payload: InvoiceEmailPayload;
  payment_session_id: string | null;
  payment_url: string | null;
  status: string;
  attempt_count: number;
  next_attempt_at: Date;
  lease_expires_at: Date | null;
  claimed_by: string | null;
  provider_id: string | null;
  last_error: string | null;
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type InvoiceEmailPreparation =
  | { kind: 'created'; delivery: InvoiceEmailDeliveryRow }
  | { kind: 'replayed'; delivery: InvoiceEmailDeliveryRow }
  | { kind: 'idempotency-conflict' }
  | { kind: 'delivery-in-progress' }
  | { kind: 'not-found' }
  | { kind: 'invalid-state' }
  | { kind: 'missing-email' };

export type InvoiceItemValues = {
  productId: number | null;
  name: string;
  description: string | null;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

export type InvoiceValues = {
  contactId: number | null;
  businessId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  issueDate: string | null;
  dueDate: string | null;
  items: InvoiceItemValues[];
  discountType: string | null;
  discountValue: string;
  taxRate: string;
  notes: string | null;
  termsAndConditions: string | null;
  paymentTerms: string | null;
};

export type InvoiceUpdates = Partial<Omit<InvoiceValues, 'items'>> & {
  items?: InvoiceItemValues[];
};

export type InvoiceCriteria = {
  organizationId: number;
  status?: string;
  contactId?: number;
  searchPattern?: string;
  pageSize: number;
  offset: number;
};

export type InvoiceWriteOutcome =
  | { kind: 'saved'; aggregate: InvoiceAggregate }
  | { kind: 'not-found' }
  | { kind: 'not-editable' }
  | { kind: 'contact-not-found' }
  | { kind: 'business-not-found' }
  | { kind: 'product-not-found' }
  | { kind: 'invalid-date-order' }
  | { kind: 'negative-total' };

const selection = `
  i.id, i.organization_id, i.invoice_number, i.contact_id, i.business_id,
  i.customer_name, i.customer_email, i.customer_phone, i.customer_address,
  i.issue_date::text, i.due_date::text, i.subtotal, i.tax_rate, i.tax_amount,
  i.discount_amount, i.discount_type, i.discount_value, i.total, i.amount_paid,
  i.amount_due, i.currency, i.status, i.payment_terms, i.payment_instructions,
  i.notes, i.terms_and_conditions, i.stripe_invoice_id,
  i.stripe_payment_intent_id, i.stripe_hosted_invoice_url, i.stripe_pdf_url,
  i.sent_at, i.viewed_at, i.paid_at, i.is_recurring, i.recurring_interval,
  i.parent_invoice_id, i.custom_fields, i.created_by, i.created_at, i.updated_at,
  c.first_name AS contact_first_name, c.last_name AS contact_last_name,
  c.email AS contact_email, b.name AS business_name, b.email AS business_email,
  b.phone AS business_phone, b.address AS business_address,
  b.tax_id AS business_tax_id, b.logo_url AS business_logo_url`;

@Injectable()
export class InvoicesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(
    criteria: InvoiceCriteria,
  ): Promise<{ rows: InvoiceRow[]; total: number }> {
    const values: unknown[] = [criteria.organizationId];
    const clauses = ['i.organization_id = $1'];
    if (criteria.status !== undefined) {
      values.push(criteria.status);
      clauses.push(`i.status = $${values.length}`);
    }
    if (criteria.contactId !== undefined) {
      values.push(criteria.contactId);
      clauses.push(`i.contact_id = $${values.length}`);
    }
    if (criteria.searchPattern !== undefined) {
      values.push(criteria.searchPattern);
      clauses.push(
        `(i.invoice_number ILIKE $${values.length} ESCAPE '\\' OR ` +
        `i.customer_name ILIKE $${values.length} ESCAPE '\\' OR ` +
        `i.customer_email ILIKE $${values.length} ESCAPE '\\')`,
      );
    }
    const where = clauses.join(' AND ');
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM invoices i WHERE ${where}`,
      values,
    );
    values.push(criteria.pageSize, criteria.offset);
    const rows = await this.pool.query<InvoiceRow>(
      `SELECT ${selection}
       FROM invoices i
       LEFT JOIN contacts c
         ON c.id = i.contact_id AND c.organization_id = i.organization_id
       LEFT JOIN businesses b
         ON b.id = i.business_id AND b.organization_id = i.organization_id
       WHERE ${where}
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { rows: rows.rows, total: Number(count.rows[0].total) };
  }

  async findById(
    organizationId: number,
    invoiceId: number,
  ): Promise<InvoiceAggregate | null> {
    const client = await this.pool.connect();
    try {
      return await this.load(client, organizationId, invoiceId);
    } finally {
      client.release();
    }
  }

  async create(
    organizationId: number,
    userId: number,
    values: InvoiceValues,
  ): Promise<InvoiceWriteOutcome> {
    return this.transaction(async (client) => {
      const reference = await this.references(client, organizationId, values);
      if (reference) return reference;
      const totals = await this.totals(
        client,
        values.items,
        values.taxRate,
        values.discountType,
        values.discountValue,
      );
      if (Number(totals.total) < 0) return { kind: 'negative-total' };
      const dates = await client.query<{ issue_date: string; due_date: string }>(
        `SELECT
           COALESCE($2::date, CURRENT_DATE)::text AS issue_date,
           COALESCE(
             $3::date,
             CURRENT_DATE + COALESCE(
               (SELECT default_payment_terms FROM payment_settings
                WHERE organization_id = $1),
               30
             )
           )::text AS due_date`,
        [organizationId, values.issueDate, values.dueDate],
      );
      if (dates.rows[0].due_date < dates.rows[0].issue_date) {
        return { kind: 'invalid-date-order' };
      }
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
      const number =
        `${allocation.rows[0].invoice_prefix}` +
        `${allocation.rows[0].allocated_number}`.padStart(5, '0');
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO invoices (
           organization_id, invoice_number, contact_id, business_id,
           customer_name, customer_email, customer_phone, customer_address,
           issue_date, due_date, subtotal, tax_rate, tax_amount,
           discount_amount, discount_type, discount_value, total, amount_due,
           notes, terms_and_conditions, payment_terms, created_by
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
           $15, $16, $17, $17, $18, $19, $20, $21
         ) RETURNING id`,
        [
          organizationId, number, values.contactId, values.businessId,
          values.customerName, values.customerEmail, values.customerPhone,
          values.customerAddress, dates.rows[0].issue_date,
          dates.rows[0].due_date, totals.subtotal, values.taxRate,
          totals.taxAmount, totals.discountAmount, values.discountType,
          values.discountValue, totals.total, values.notes,
          values.termsAndConditions, values.paymentTerms, userId,
        ],
      );
      const invoiceId = Number(inserted.rows[0].id);
      await this.replaceItems(client, organizationId, invoiceId, values.items);
      await this.touchBusiness(client, organizationId, values.businessId);
      const aggregate = await this.load(client, organizationId, invoiceId);
      if (!aggregate) throw new Error('Created invoice could not be reloaded');
      return { kind: 'saved', aggregate };
    });
  }

  async update(
    organizationId: number,
    invoiceId: number,
    values: InvoiceUpdates,
  ): Promise<InvoiceWriteOutcome> {
    return this.transaction(async (client) => {
      const locked = await client.query<{
        status: string;
        tax_rate: string;
        discount_type: string | null;
        discount_value: string;
        amount_paid: string;
        issue_date: string;
        due_date: string;
      }>(
        `SELECT status, tax_rate, discount_type, discount_value, amount_paid,
                issue_date::text, due_date::text
         FROM invoices
         WHERE id = $1 AND organization_id = $2
         FOR UPDATE`,
        [invoiceId, organizationId],
      );
      if (!locked.rows[0]) return { kind: 'not-found' };
      if (!['draft', 'sent'].includes(locked.rows[0].status)) {
        return { kind: 'not-editable' };
      }
      const effectiveIssueDate =
        values.issueDate ?? locked.rows[0].issue_date;
      const effectiveDueDate = values.dueDate ?? locked.rows[0].due_date;
      if (effectiveDueDate < effectiveIssueDate) {
        return { kind: 'invalid-date-order' };
      }
      const reference = await this.references(client, organizationId, values);
      if (reference) return reference;
      const assignments: string[] = [];
      const parameters: unknown[] = [invoiceId, organizationId];
      const set = (column: string, value: unknown) => {
        parameters.push(value);
        assignments.push(`${column} = $${parameters.length}`);
      };
      const fields: Array<[keyof InvoiceUpdates, string]> = [
        ['contactId', 'contact_id'], ['businessId', 'business_id'],
        ['customerName', 'customer_name'], ['customerEmail', 'customer_email'],
        ['customerPhone', 'customer_phone'],
        ['customerAddress', 'customer_address'], ['issueDate', 'issue_date'],
        ['dueDate', 'due_date'], ['discountType', 'discount_type'],
        ['discountValue', 'discount_value'], ['taxRate', 'tax_rate'],
        ['notes', 'notes'], ['termsAndConditions', 'terms_and_conditions'],
        ['paymentTerms', 'payment_terms'],
      ];
      for (const [key, column] of fields) {
        if (values[key] !== undefined) set(column, values[key]);
      }
      if (values.items !== undefined) {
        const totals = await this.totals(
          client,
          values.items,
          values.taxRate ?? locked.rows[0].tax_rate,
          values.discountType === undefined
            ? locked.rows[0].discount_type
            : values.discountType,
          values.discountValue ?? locked.rows[0].discount_value,
        );
        if (Number(totals.total) < 0) return { kind: 'negative-total' };
        set('subtotal', totals.subtotal);
        set('tax_amount', totals.taxAmount);
        set('discount_amount', totals.discountAmount);
        set('total', totals.total);
        set(
          'amount_due',
          await this.amountDue(client, totals.total, locked.rows[0].amount_paid),
        );
        await this.replaceItems(client, organizationId, invoiceId, values.items);
      }
      if (assignments.length > 0) {
        await client.query(
          `UPDATE invoices SET ${assignments.join(', ')},
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2`,
          parameters,
        );
      }
      await this.touchBusiness(client, organizationId, values.businessId);
      const aggregate = await this.load(client, organizationId, invoiceId);
      if (!aggregate) return { kind: 'not-found' };
      return { kind: 'saved', aggregate };
    });
  }

  async delete(
    organizationId: number,
    invoiceId: number,
  ): Promise<{ id: number; invoice_number: string } | null> {
    const result = await this.pool.query<{ id: number; invoice_number: string }>(
      `DELETE FROM invoices
       WHERE id = $1 AND organization_id = $2
       RETURNING id, invoice_number`,
      [invoiceId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async prepareEmailDelivery(
    organizationId: number,
    userId: number,
    invoiceId: number,
    idempotencyKey: string,
    options: Pick<InvoiceEmailPayload, 'subject' | 'message' | 'ccEmails' | 'includePaymentLink' | 'resend'>,
  ): Promise<InvoiceEmailPreparation> {
    return this.transaction(async (client) => {
      const locked = await client.query<{ status: string }>(
        `SELECT status FROM invoices
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [invoiceId, organizationId],
      );
      if (!locked.rows[0]) return { kind: 'not-found' };
      const existing = await client.query<InvoiceEmailDeliveryRow>(
        `SELECT * FROM invoice_email_deliveries
         WHERE organization_id = $1 AND invoice_id = $2
           AND idempotency_key = $3`,
        [organizationId, invoiceId, idempotencyKey],
      );
      if (existing.rows[0]) {
        const prior = existing.rows[0].payload;
        const matches = prior.subject === options.subject &&
          prior.message === options.message &&
          prior.includePaymentLink === options.includePaymentLink &&
          prior.resend === options.resend &&
          JSON.stringify(prior.ccEmails) === JSON.stringify(options.ccEmails);
        return matches
          ? { kind: 'replayed', delivery: existing.rows[0] }
          : { kind: 'idempotency-conflict' };
      }
      const active = await client.query(
        `SELECT 1 FROM invoice_email_deliveries
         WHERE organization_id = $1 AND invoice_id = $2
           AND status IN ('queued', 'processing', 'retry', 'reconciliation_required')
         LIMIT 1`,
        [organizationId, invoiceId],
      );
      if (active.rows[0]) return { kind: 'delivery-in-progress' };
      const allowed = options.resend
        ? ['draft', 'sent', 'viewed', 'partial', 'overdue']
        : ['draft'];
      if (!allowed.includes(locked.rows[0].status)) return { kind: 'invalid-state' };
      const aggregate = await this.load(client, organizationId, invoiceId);
      if (!aggregate) return { kind: 'not-found' };
      const recipient = aggregate.invoice.customer_email?.trim();
      if (!recipient) return { kind: 'missing-email' };
      const settingsResult = await client.query<Record<string, unknown>>(
        'SELECT * FROM payment_settings WHERE organization_id = $1',
        [organizationId],
      );
      const row = aggregate.invoice;
      const payload: InvoiceEmailPayload = {
        ...options,
        invoice: {
          ...row,
          items: aggregate.items,
          business: row.business_id === null ? null : {
            id: row.business_id,
            name: row.business_name,
            email: row.business_email,
            phone: row.business_phone,
            address: row.business_address,
            tax_id: row.business_tax_id,
            logo_url: row.business_logo_url,
          },
        },
        settings: settingsResult.rows[0] ?? {},
      };
      const inserted = await client.query<InvoiceEmailDeliveryRow>(
        `INSERT INTO invoice_email_deliveries (
           organization_id, invoice_id, requested_by_user_id,
           idempotency_key, recipient_email, subject, payload
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING *`,
        [organizationId, invoiceId, userId, idempotencyKey, recipient,
          options.subject, JSON.stringify(payload)],
      );
      return { kind: 'created', delivery: inserted.rows[0] };
    });
  }

  async findEmailDelivery(
    organizationId: number,
    deliveryId: number,
  ): Promise<InvoiceEmailDeliveryRow | null> {
    const result = await this.pool.query<InvoiceEmailDeliveryRow>(
      `SELECT * FROM invoice_email_deliveries
       WHERE id = $1 AND organization_id = $2`,
      [deliveryId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  async dueEmailDeliveryIds(
    limit: number,
  ): Promise<Array<{ id: number; organizationId: number }>> {
    const result = await this.pool.query<{ id: number; organization_id: number }>(
      `SELECT id, organization_id FROM invoice_email_deliveries
       WHERE (status IN ('queued', 'retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
          OR (status = 'processing' AND lease_expires_at <= CURRENT_TIMESTAMP)
       ORDER BY next_attempt_at, id LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      id: Number(row.id), organizationId: Number(row.organization_id),
    }));
  }

  async claimEmailDelivery(
    organizationId: number,
    deliveryId: number,
  ): Promise<InvoiceEmailDeliveryRow | null> {
    const result = await this.pool.query<InvoiceEmailDeliveryRow>(
      `UPDATE invoice_email_deliveries
       SET status = 'processing', attempt_count = attempt_count + 1,
           lease_expires_at = CURRENT_TIMESTAMP + INTERVAL '60 seconds',
           claimed_by = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2
         AND ((status IN ('queued', 'retry') AND next_attempt_at <= CURRENT_TIMESTAMP)
           OR (status = 'processing' AND lease_expires_at <= CURRENT_TIMESTAMP))
       RETURNING *`,
      [deliveryId, organizationId, `nest:${process.pid}`],
    );
    return result.rows[0] ?? null;
  }

  async recordPaymentLink(
    organizationId: number,
    deliveryId: number,
    sessionId: string,
    paymentUrl: string,
  ): Promise<InvoiceEmailDeliveryRow> {
    return this.transaction(async (client) => {
      const delivery = await client.query<InvoiceEmailDeliveryRow>(
        `UPDATE invoice_email_deliveries
         SET payment_session_id = $3, payment_url = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2 AND status = 'processing'
         RETURNING *`,
        [deliveryId, organizationId, sessionId, paymentUrl],
      );
      if (!delivery.rows[0]) throw new Error('Invoice email delivery not found');
      await client.query(
        `UPDATE invoices
         SET stripe_payment_intent_id = $3, stripe_hosted_invoice_url = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [delivery.rows[0].invoice_id, organizationId, sessionId, paymentUrl],
      );
      return delivery.rows[0];
    });
  }

  async completeEmailDelivery(
    organizationId: number,
    deliveryId: number,
    providerId: string | null,
  ): Promise<InvoiceEmailDeliveryRow> {
    return this.transaction(async (client) => {
      const locked = await client.query<InvoiceEmailDeliveryRow>(
        `SELECT * FROM invoice_email_deliveries
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [deliveryId, organizationId],
      );
      const delivery = locked.rows[0];
      if (!delivery) throw new Error('Invoice email delivery not found');
      if (delivery.status === 'sent') return delivery;
      const invoice = await client.query<{ status: string }>(
        `SELECT status FROM invoices
         WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [delivery.invoice_id, organizationId],
      );
      const allowed = delivery.payload.resend
        ? ['draft', 'sent', 'viewed', 'partial', 'overdue']
        : ['draft'];
      if (!invoice.rows[0] || !allowed.includes(invoice.rows[0].status)) {
        const reconciled = await client.query<InvoiceEmailDeliveryRow>(
          `UPDATE invoice_email_deliveries
           SET status = 'reconciliation_required', provider_id = $3,
               last_error = 'Invoice changed state after provider delivery',
               lease_expires_at = NULL, claimed_by = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND organization_id = $2 RETURNING *`,
          [deliveryId, organizationId, providerId],
        );
        return reconciled.rows[0];
      }
      await client.query(
        `UPDATE invoices
         SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
             sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2`,
        [delivery.invoice_id, organizationId],
      );
      const completed = await client.query<InvoiceEmailDeliveryRow>(
        `UPDATE invoice_email_deliveries
         SET status = 'sent', provider_id = $3, sent_at = CURRENT_TIMESTAMP,
             lease_expires_at = NULL, claimed_by = NULL, last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2 RETURNING *`,
        [deliveryId, organizationId, providerId],
      );
      return completed.rows[0];
    });
  }

  async failEmailDelivery(
    organizationId: number,
    deliveryId: number,
    error: string,
    ambiguous: boolean,
  ): Promise<InvoiceEmailDeliveryRow> {
    const result = await this.pool.query<InvoiceEmailDeliveryRow>(
      `UPDATE invoice_email_deliveries
       SET status = CASE
             WHEN $3::boolean THEN 'reconciliation_required'
             WHEN attempt_count >= 5 THEN 'dead_letter' ELSE 'retry' END,
           next_attempt_at = CURRENT_TIMESTAMP +
             (LEAST(300, POWER(2, GREATEST(attempt_count - 1))) * INTERVAL '1 second'),
           last_error = LEFT($4, 2000), lease_expires_at = NULL,
           claimed_by = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [deliveryId, organizationId, ambiguous, error],
    );
    if (!result.rows[0]) throw new Error('Invoice email delivery not found');
    return result.rows[0];
  }

  private async references(
    client: PoolClient,
    organizationId: number,
    values: Partial<InvoiceValues>,
  ): Promise<InvoiceWriteOutcome | null> {
    if (values.contactId !== undefined && values.contactId !== null) {
      const contact = await client.query(
        'SELECT 1 FROM contacts WHERE id = $1 AND organization_id = $2',
        [values.contactId, organizationId],
      );
      if (!contact.rows[0]) return { kind: 'contact-not-found' };
    }
    if (values.businessId !== undefined && values.businessId !== null) {
      const business = await client.query(
        `SELECT 1 FROM businesses
         WHERE id = $1 AND organization_id = $2 AND is_active = true`,
        [values.businessId, organizationId],
      );
      if (!business.rows[0]) return { kind: 'business-not-found' };
    }
    const productIds = [
      ...new Set(
        (values.items ?? [])
          .map((item) => item.productId)
          .filter((id): id is number => id !== null),
      ),
    ];
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
    items: InvoiceItemValues[],
    taxRate: string,
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
         SELECT COALESCE(SUM(
           (item->>'quantity')::numeric * (item->>'unitPrice')::numeric
         ), 0)::numeric AS subtotal
         FROM jsonb_array_elements($1::jsonb) item
       ), amounts AS (
         SELECT
           ROUND(subtotal, 2) AS subtotal,
           ROUND(subtotal * $2::numeric / 100, 2) AS tax_amount,
           ROUND(CASE
             WHEN $3::text = 'percent'
               THEN subtotal * $4::numeric / 100
             WHEN $3::text = 'fixed' THEN $4::numeric
             ELSE 0
           END, 2) AS discount_amount
         FROM lines
       )
       SELECT subtotal::text, tax_amount::text, discount_amount::text,
              ROUND(subtotal + tax_amount - discount_amount, 2)::text AS total
       FROM amounts`,
      [JSON.stringify(items), taxRate, discountType, discountValue],
    );
    return {
      subtotal: result.rows[0].subtotal,
      taxAmount: result.rows[0].tax_amount,
      discountAmount: result.rows[0].discount_amount,
      total: result.rows[0].total,
    };
  }

  private async amountDue(
    client: PoolClient,
    total: string,
    amountPaid: string,
  ): Promise<string> {
    const result = await client.query<{ amount_due: string }>(
      `SELECT GREATEST($1::numeric - $2::numeric, 0)::text AS amount_due`,
      [total, amountPaid],
    );
    return result.rows[0].amount_due;
  }

  private async replaceItems(
    client: PoolClient,
    organizationId: number,
    invoiceId: number,
    items: InvoiceItemValues[],
  ): Promise<void> {
    await client.query(
      `DELETE FROM invoice_items
       WHERE invoice_id = $1 AND organization_id = $2`,
      [invoiceId, organizationId],
    );
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
          item.description, item.quantity, item.unitPrice, item.taxRate, index,
        ],
      );
    }
  }

  private async touchBusiness(
    client: PoolClient,
    organizationId: number,
    businessId: number | null | undefined,
  ): Promise<void> {
    if (businessId === undefined || businessId === null) return;
    await client.query(
      `UPDATE businesses SET last_used_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2`,
      [businessId, organizationId],
    );
  }

  private async load(
    client: PoolClient,
    organizationId: number,
    invoiceId: number,
  ): Promise<InvoiceAggregate | null> {
    const invoice = await client.query<InvoiceRow>(
      `SELECT ${selection}
       FROM invoices i
       LEFT JOIN contacts c
         ON c.id = i.contact_id AND c.organization_id = i.organization_id
       LEFT JOIN businesses b
         ON b.id = i.business_id AND b.organization_id = i.organization_id
       WHERE i.id = $1 AND i.organization_id = $2`,
      [invoiceId, organizationId],
    );
    if (!invoice.rows[0]) return null;
    const items = await client.query<InvoiceItemRow>(
      `SELECT ii.id, ii.invoice_id, ii.organization_id, ii.product_id,
              ii.name, ii.description, ii.quantity, ii.unit_price,
              ii.tax_rate, ii.tax_amount, ii.discount_amount, ii.total,
              ii.sort_order, p.name AS product_name, ii.created_at
       FROM invoice_items ii
       LEFT JOIN products p
         ON p.id = ii.product_id AND p.organization_id = ii.organization_id
       WHERE ii.invoice_id = $1 AND ii.organization_id = $2
       ORDER BY ii.sort_order, ii.id`,
      [invoiceId, organizationId],
    );
    const payments = await client.query<InvoicePaymentRow>(
      `SELECT id, amount, currency, payment_method, status, notes,
              paid_at, created_at
       FROM payments
       WHERE invoice_id = $1 AND organization_id = $2
       ORDER BY created_at DESC, id DESC`,
      [invoiceId, organizationId],
    );
    return {
      invoice: invoice.rows[0],
      items: items.rows,
      payments: payments.rows,
    };
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
