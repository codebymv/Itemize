import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PaymentMethod, PaymentStatus } from './payment.types';
import { NotificationsService } from '../notifications/notifications.service';

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
  refund_amount: string;
  refunded_at: Date | null;
  refund_reason: string | null;
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

export type RefundPreparation =
  | {
      kind: 'prepared';
      refundId: number;
      paymentId: number;
      paymentIntentId: string;
      stripeAccountId: string;
      amount: string;
      currency: string;
      reason: string | null;
      idempotencyKey: string;
    }
  | { kind: 'payment-not-found' }
  | { kind: 'not-refundable'; reason: string };

export type RefundCompletion = {
  payment: PaymentRow;
  invoice: InvoiceBalanceRow | null;
  refundStatus: string;
};

@Injectable()
export class PaymentsRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly notifications: NotificationsService,
  ) {}

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
         p.description, p.notes, p.receipt_url, p.refund_amount,
         p.refunded_at, p.refund_reason, p.paid_at,
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

  async prepareRefund(
    organizationId: number,
    paymentId: number,
    requestedAmount: string | null,
    reason: string | null,
    idempotencyKey: string,
  ): Promise<RefundPreparation> {
    return this.transaction(async (client) => {
      const existing = await client.query<{
        id: number;
        amount: string;
        reason: string | null;
      }>(
        `SELECT id, amount, reason
         FROM payment_refunds
         WHERE organization_id=$1 AND payment_id=$2 AND idempotency_key=$3
         FOR UPDATE`,
        [organizationId, paymentId, idempotencyKey],
      );
      const payment = await client.query<{
        id: number;
        amount: string;
        currency: string;
        status: string;
        stripe_payment_intent_id: string | null;
        refund_amount: string;
        reserved_refund_amount: string;
        stripe_account_id: string | null;
      }>(
        `SELECT p.id,p.amount,p.currency,p.status,p.stripe_payment_intent_id,
                COALESCE(p.refund_amount,0) AS refund_amount,
                COALESCE((
                  SELECT SUM(refund.amount)
                  FROM payment_refunds refund
                  WHERE refund.organization_id=p.organization_id
                    AND refund.payment_id=p.id
                    AND refund.status IN ('processing','pending','requires_action')
                ),0) AS reserved_refund_amount,
                settings.stripe_account_id
         FROM payments p
         LEFT JOIN payment_settings settings
           ON settings.organization_id=p.organization_id
         WHERE p.id=$1 AND p.organization_id=$2
         FOR UPDATE OF p`,
        [paymentId, organizationId],
      );
      const row = payment.rows[0];
      if (!row) return { kind: 'payment-not-found' };
      if (!row.stripe_payment_intent_id || !row.stripe_account_id) {
        return { kind: 'not-refundable', reason: 'Only connected Stripe payments can be refunded here' };
      }
      if (!['succeeded', 'refunded'].includes(row.status)) {
        return { kind: 'not-refundable', reason: 'This payment is not settled' };
      }
      if (existing.rows[0]) {
        const replayAmount = requestedAmount === null
          ? Number(existing.rows[0].amount).toFixed(2)
          : Number(requestedAmount).toFixed(2);
        if (
          Number(existing.rows[0].amount) !== Number(replayAmount) ||
          (existing.rows[0].reason || null) !== reason
        ) {
          return { kind: 'not-refundable', reason: 'This refund request key was already used' };
        }
        return {
          kind: 'prepared', refundId: Number(existing.rows[0].id), paymentId,
          paymentIntentId: row.stripe_payment_intent_id,
          stripeAccountId: row.stripe_account_id, amount: replayAmount,
          currency: row.currency, reason, idempotencyKey,
        };
      }
      const refundable = Number(row.amount) - Number(row.refund_amount || 0) -
        Number(row.reserved_refund_amount || 0);
      const amount = requestedAmount === null ? refundable : Number(requestedAmount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > refundable + 0.0001) {
        return { kind: 'not-refundable', reason: 'Refund amount exceeds the remaining payment balance' };
      }
      const normalizedAmount = amount.toFixed(2);
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO payment_refunds (
           organization_id,payment_id,idempotency_key,amount,currency,status,reason
         ) VALUES ($1,$2,$3,$4::numeric,$5,'processing',$6)
         RETURNING id`,
        [organizationId, paymentId, idempotencyKey, normalizedAmount, row.currency, reason],
      );
      return {
        kind: 'prepared', refundId: Number(inserted.rows[0].id), paymentId,
        paymentIntentId: row.stripe_payment_intent_id,
        stripeAccountId: row.stripe_account_id, amount: normalizedAmount,
        currency: row.currency, reason, idempotencyKey,
      };
    });
  }

  async completeRefund(
    organizationId: number,
    refundId: number,
    provider: {
      refundId: string;
      status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled';
      failureCode: string | null;
      failureMessage: string | null;
    },
  ): Promise<RefundCompletion> {
    return this.transaction(async (client) => {
      const updated = await client.query<{ payment_id: number; amount: string }>(
        `UPDATE payment_refunds
         SET stripe_refund_id=$3,status=$4,provider_failure_code=$5,
             provider_failure_message=$6,
             completed_at=CASE WHEN $4='succeeded' THEN CURRENT_TIMESTAMP ELSE completed_at END,
             updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 AND organization_id=$2
         RETURNING payment_id,amount`,
        [refundId, organizationId, provider.refundId, provider.status,
          provider.failureCode, provider.failureMessage],
      );
      const paymentId = Number(updated.rows[0]?.payment_id);
      if (!paymentId) throw new Error('Refund request disappeared before completion');
      const invoice = await this.recalculateRefundBalances(client, organizationId, paymentId);
      const payment = await this.findByIdWith(client, organizationId, paymentId);
      if (!payment) throw new Error('Payment disappeared after refund completion');
      if (provider.status === 'succeeded') {
        const recipient = await client.query<{ user_id: number }>(
          `SELECT member.user_id
           FROM organization_members member
           WHERE member.organization_id=$1 AND member.role IN ('owner','admin')
           ORDER BY CASE WHEN member.role='owner' THEN 0 ELSE 1 END,
                    member.joined_at,member.user_id
           LIMIT 1`,
          [organizationId],
        );
        if (recipient.rows[0]) {
          const formatted = new Intl.NumberFormat('en-US', {
            style: 'currency', currency: payment.currency,
          }).format(Number(updated.rows[0].amount));
          await this.notifications.createWithClient(client, {
            organizationId,
            recipientUserId: Number(recipient.rows[0].user_id),
            eventType: 'payment.refunded',
            entityType: 'invoice',
            entityId: payment.invoice_id,
            dedupeKey: `stripe-refund:${provider.refundId}:succeeded`,
            payload: {
              refundId: provider.refundId,
              paymentId,
              invoiceNumber: payment.invoice_number,
              amount: updated.rows[0].amount,
              currency: payment.currency,
            },
            category: 'billing',
            priority: 'normal',
            title: 'Payment refunded',
            body: `${formatted} was refunded${payment.invoice_number ? ` for ${payment.invoice_number}` : ''}.`,
            href: payment.invoice_id ? `/invoices/${payment.invoice_id}` : '/invoices/payments',
          });
        }
      }
      return { payment, invoice, refundStatus: provider.status };
    });
  }

  async failRefund(
    organizationId: number,
    refundId: number,
    message: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE payment_refunds
       SET status='failed',provider_failure_message=$3,updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND organization_id=$2 AND status='processing'`,
      [refundId, organizationId, message.slice(0, 2000)],
    );
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
         p.description, p.notes, p.receipt_url, p.refund_amount,
         p.refunded_at, p.refund_reason, p.paid_at,
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

  private async recalculateRefundBalances(
    client: PoolClient,
    organizationId: number,
    paymentId: number,
  ): Promise<InvoiceBalanceRow | null> {
    const payment = await client.query<{ invoice_id: number | null }>(
      `UPDATE payments payment
       SET refund_amount=summary.refunded,
           stripe_refund_id=summary.latest_refund_id,
           refund_reason=summary.latest_reason,
           refunded_at=CASE WHEN summary.refunded > 0 THEN summary.latest_completed_at ELSE NULL END,
           status=CASE
             WHEN summary.refunded >= payment.amount THEN 'refunded'
             ELSE 'succeeded'
           END,
           updated_at=CURRENT_TIMESTAMP
       FROM (
         SELECT COALESCE(SUM(amount) FILTER (WHERE status='succeeded'),0) AS refunded,
                (ARRAY_AGG(stripe_refund_id ORDER BY completed_at DESC NULLS LAST, id DESC)
                  FILTER (WHERE status='succeeded'))[1] AS latest_refund_id,
                (ARRAY_AGG(reason ORDER BY completed_at DESC NULLS LAST, id DESC)
                  FILTER (WHERE status='succeeded'))[1] AS latest_reason,
                MAX(completed_at) FILTER (WHERE status='succeeded') AS latest_completed_at
         FROM payment_refunds
         WHERE organization_id=$1 AND payment_id=$2
       ) summary
       WHERE payment.id=$2 AND payment.organization_id=$1
       RETURNING payment.invoice_id`,
      [organizationId, paymentId],
    );
    const invoiceId = payment.rows[0]?.invoice_id;
    if (!invoiceId) return null;
    const invoice = await client.query<InvoiceBalanceRow>(
      `WITH balance AS (
         SELECT COALESCE(SUM(GREATEST(0,p.amount-COALESCE(p.refund_amount,0)))
                   FILTER (WHERE p.status IN ('succeeded','refunded')),0) AS net_paid
         FROM payments p
         WHERE p.organization_id=$1 AND p.invoice_id=$2
       )
       UPDATE invoices invoice
       SET amount_paid=balance.net_paid,
           amount_due=GREATEST(0,invoice.total-balance.net_paid),
           status=CASE
             WHEN balance.net_paid <= 0 THEN 'refunded'
             WHEN invoice.total-balance.net_paid <= 0 THEN 'paid'
             ELSE 'partial'
           END,
           paid_at=CASE WHEN invoice.total-balance.net_paid <= 0 THEN invoice.paid_at ELSE NULL END,
           updated_at=CURRENT_TIMESTAMP
       FROM balance
       WHERE invoice.id=$2 AND invoice.organization_id=$1
       RETURNING invoice.amount_paid,invoice.amount_due,invoice.status`,
      [organizationId, invoiceId],
    );
    if (invoice.rows[0]?.status === 'refunded') {
      await client.query(
        `UPDATE invoice_payment_link_intents
         SET status='refunded',updated_at=CURRENT_TIMESTAMP
         WHERE organization_id=$1 AND invoice_id=$2 AND status='paid'`,
        [organizationId, invoiceId],
      );
    }
    return invoice.rows[0] ?? null;
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
