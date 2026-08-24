import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PaymentMethod, PaymentStatus } from './payment.types';

export type PaymentRow = {
  id: number;
  organization_id: number;
  invoice_id: number | null;
  invoice_number: string | null;
  contact_id: number | null;
  contact_name: string | null;
  amount: string;
  currency: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  stripe_payment_intent_id: string | null;
  card_last4: string | null;
  card_brand: string | null;
  description: string | null;
  notes: string | null;
  receipt_url: string | null;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type RecordPaymentValues = {
  invoiceId: number | null;
  contactId: number | null;
  amount: string;
  currency: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  paymentDate: string | null;
  notes: string | null;
};

export type InvoiceBalanceRow = {
  amount_paid: string;
  amount_due: string;
  status: string;
};

type LockedInvoiceRow = {
  id: number;
  contact_id: number | null;
  total: string;
  amount_paid: string;
  status: string;
  currency: string;
};

export type RecordPaymentOutcome =
  | {
      kind: 'recorded';
      payment: PaymentRow;
      invoice: InvoiceBalanceRow | null;
    }
  | { kind: 'invoice-not-found' }
  | { kind: 'contact-not-found' };

@Injectable()
export class PaymentsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findPage(
    organizationId: number,
    pageSize: number,
    offset: number,
    status?: PaymentStatus,
    paymentMethod?: PaymentMethod,
  ): Promise<{ rows: PaymentRow[]; total: number }> {
    const values: unknown[] = [organizationId];
    const predicates = ['p.organization_id = $1'];
    if (status !== undefined) {
      values.push(status);
      predicates.push(`p.status = $${values.length}`);
    }
    if (paymentMethod !== undefined) {
      values.push(paymentMethod);
      predicates.push(`p.payment_method = $${values.length}`);
    }
    const where = predicates.join(' AND ');
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM payments p WHERE ${where}`,
      values,
    );
    values.push(pageSize, offset);
    const rows = await this.pool.query<PaymentRow>(
      `SELECT
         p.id, p.organization_id, p.invoice_id, i.invoice_number,
         p.contact_id,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), i.customer_name)
           AS contact_name,
         p.amount, p.currency, p.payment_method, p.status,
         p.stripe_payment_intent_id, p.card_last4, p.card_brand,
         p.description, p.notes, p.receipt_url, p.paid_at,
         p.created_at, p.updated_at
       FROM payments p
       LEFT JOIN invoices i
         ON i.id = p.invoice_id AND i.organization_id = p.organization_id
       LEFT JOIN contacts c
         ON c.id = p.contact_id AND c.organization_id = p.organization_id
       WHERE ${where}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { rows: rows.rows, total: Number(count.rows[0].total) };
  }

  async record(
    organizationId: number,
    values: RecordPaymentValues,
  ): Promise<RecordPaymentOutcome> {
    return this.transaction(async (client) => {
      let invoice: LockedInvoiceRow | null = null;
      if (values.invoiceId !== null) {
        const result = await client.query<LockedInvoiceRow>(
          `SELECT id, contact_id, total, amount_paid, status, currency
           FROM invoices
           WHERE id = $1 AND organization_id = $2
           FOR UPDATE`,
          [values.invoiceId, organizationId],
        );
        invoice = result.rows[0] ?? null;
        if (!invoice) return { kind: 'invoice-not-found' };
      }

      const contactId = values.contactId ?? invoice?.contact_id ?? null;
      if (contactId !== null) {
        const contact = await client.query(
          `SELECT id FROM contacts
           WHERE id = $1 AND organization_id = $2`,
          [contactId, organizationId],
        );
        if (contact.rows.length === 0) return { kind: 'contact-not-found' };
      }

      const inserted = await client.query<{ id: number }>(
        `INSERT INTO payments (
           organization_id, invoice_id, contact_id, amount, currency,
           payment_method, status, paid_at, notes
         ) VALUES (
           $1, $2, $3, $4::numeric, $5, $6, $7::varchar,
           CASE
             WHEN $7::varchar = 'succeeded'
             THEN COALESCE($8::timestamptz, CURRENT_TIMESTAMP)
             ELSE NULL
           END,
           $9
         )
         RETURNING id`,
        [
          organizationId,
          invoice?.id ?? null,
          contactId,
          values.amount,
          invoice?.currency ?? values.currency,
          values.paymentMethod,
          values.status,
          values.paymentDate,
          values.notes,
        ],
      );

      let invoiceBalance: InvoiceBalanceRow | null = null;
      if (invoice && values.status === PaymentStatus.SUCCEEDED) {
        const updated = await client.query<InvoiceBalanceRow>(
          `UPDATE invoices
           SET amount_paid = COALESCE(amount_paid, 0) + $1::numeric,
               amount_due = GREATEST(
                 0,
                 total - (COALESCE(amount_paid, 0) + $1::numeric)
               ),
               status = CASE
                 WHEN total - (COALESCE(amount_paid, 0) + $1::numeric) <= 0
                 THEN 'paid'
                 ELSE 'partial'
               END,
               paid_at = CASE
                 WHEN total - (COALESCE(amount_paid, 0) + $1::numeric) <= 0
                 THEN COALESCE(paid_at, CURRENT_TIMESTAMP)
                 ELSE paid_at
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND organization_id = $3
           RETURNING amount_paid, amount_due, status`,
          [values.amount, invoice.id, organizationId],
        );
        invoiceBalance = updated.rows[0];
        if (invoiceBalance.status === 'paid' && invoice.status !== 'paid') {
          await client.query(
            `INSERT INTO workflow_triggers (
               workflow_id, organization_id, contact_id, trigger_type,
               entity_type, entity_id, payload, status, event_key,
               source, occurred_at, next_attempt_at
             ) VALUES (
               NULL, $1, $2, 'invoice_paid', 'invoice', $3, $4::jsonb,
               'queued', $5, 'domain', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
             )
             ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING`,
            [
              organizationId,
              contactId,
              invoice.id,
              JSON.stringify({
                amount_paid: Number(invoiceBalance.amount_paid),
                invoice_id: Number(invoice.id),
                payment_id: Number(inserted.rows[0].id),
                payment_method: values.paymentMethod,
                total: Number(invoice.total),
              }),
              `domain:invoice_paid:${invoice.id}`,
            ],
          );
        }
      }

      const payment = await this.findByIdWith(
        client,
        organizationId,
        Number(inserted.rows[0].id),
      );
      if (!payment) throw new Error('Payment disappeared inside transaction');
      return {
        kind: 'recorded',
        payment,
        invoice: invoiceBalance,
      };
    });
  }

  private async findByIdWith(
    client: PoolClient,
    organizationId: number,
    paymentId: number,
  ): Promise<PaymentRow | null> {
    const result = await client.query<PaymentRow>(
      `SELECT
         p.id, p.organization_id, p.invoice_id, i.invoice_number,
         p.contact_id,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), i.customer_name)
           AS contact_name,
         p.amount, p.currency, p.payment_method, p.status,
         p.stripe_payment_intent_id, p.card_last4, p.card_brand,
         p.description, p.notes, p.receipt_url, p.paid_at,
         p.created_at, p.updated_at
       FROM payments p
       LEFT JOIN invoices i
         ON i.id = p.invoice_id AND i.organization_id = p.organization_id
       LEFT JOIN contacts c
         ON c.id = p.contact_id AND c.organization_id = p.organization_id
       WHERE p.id = $1 AND p.organization_id = $2`,
      [paymentId, organizationId],
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
