import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  StripeInvoiceEvent,
  StripeInvoiceWebhookResult,
} from './invoice-webhooks.types';

type InvoicePaymentRow = {
  id: number;
  organization_id: number;
  contact_id: number | null;
  total: string;
  amount_paid: string;
  amount_due: string;
  currency: string;
  status: string;
};

@Injectable()
export class InvoiceWebhooksRepository {
  private readonly logger = new Logger(InvoiceWebhooksRepository.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async process(event: StripeInvoiceEvent): Promise<StripeInvoiceWebhookResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.processWith(client, event);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async processWith(
    client: PoolClient,
    event: StripeInvoiceEvent,
  ): Promise<StripeInvoiceWebhookResult> {
    const claim = await client.query(
      `INSERT INTO stripe_webhook_events (event_id, event_type)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [event.id, event.type],
    );
    if (claim.rowCount !== 1) {
      return { received: true, duplicateEvent: true, handled: false };
    }

    if (event.type === 'checkout.session.expired') {
      return { received: true, duplicateEvent: false, handled: true };
    }
    if (event.type !== 'checkout.session.completed') {
      return {
        received: true,
        duplicateEvent: false,
        handled: false,
        reason: 'unhandled_event',
      };
    }

    const session = event.session;
    if (!session?.invoiceId || session.paymentStatus !== 'paid') {
      return {
        received: true,
        duplicateEvent: false,
        handled: false,
        reason: 'checkout_not_payable',
      };
    }
    if (!session.amount || !session.currency || !session.paymentReference) {
      throw new Error('Verified Stripe checkout is missing payment evidence');
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      session.paymentReference,
    ]);
    const existing = await client.query(
      'SELECT id FROM payments WHERE stripe_payment_intent_id = $1 LIMIT 1',
      [session.paymentReference],
    );
    if (existing.rows.length > 0) {
      return {
        received: true,
        duplicateEvent: false,
        handled: true,
        duplicatePayment: true,
      };
    }

    const invoiceResult = await client.query<InvoicePaymentRow>(
      `SELECT id, organization_id, contact_id, total, amount_paid, amount_due,
              currency, status
       FROM invoices
       WHERE id = $1
       FOR UPDATE`,
      [session.invoiceId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) {
      this.logger.warn('Stripe checkout references a missing invoice', {
        eventId: event.id,
        sessionId: session.id,
        invoiceId: session.invoiceId,
      });
      return {
        received: true,
        duplicateEvent: false,
        handled: false,
        reason: 'invoice_not_found',
      };
    }
    if (
      session.metadataOrganizationId &&
      session.metadataOrganizationId !== String(invoice.organization_id)
    ) {
      this.logger.warn('Stripe checkout organization metadata mismatched invoice ownership', {
        eventId: event.id,
        sessionId: session.id,
        invoiceId: session.invoiceId,
        invoiceOrganizationId: invoice.organization_id,
      });
    }

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO payments (
         organization_id, invoice_id, contact_id, amount, currency,
         payment_method, status, stripe_payment_intent_id, paid_at
       ) VALUES ($1, $2, $3, $4::numeric, $5, 'stripe', 'succeeded', $6,
                 CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        invoice.organization_id,
        session.invoiceId,
        invoice.contact_id,
        session.amount,
        session.currency,
        session.paymentReference,
      ],
    );
    const updated = await client.query<InvoicePaymentRow>(
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
       WHERE id = $2
       RETURNING id, organization_id, contact_id, total, amount_paid,
                 amount_due, currency, status`,
      [session.amount, session.invoiceId],
    );
    const balance = updated.rows[0];
    if (!balance) throw new Error('Invoice disappeared inside webhook transaction');
    if (balance.status === 'paid' && invoice.status !== 'paid') {
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
          invoice.organization_id,
          invoice.contact_id,
          session.invoiceId,
          JSON.stringify({
            amount_paid: Number(balance.amount_paid),
            invoice_id: session.invoiceId,
            payment_id: Number(inserted.rows[0].id),
            payment_method: 'stripe',
            payment_reference: session.paymentReference,
            stripe_event_id: event.id,
            total: Number(invoice.total),
          }),
          `domain:invoice_paid:${session.invoiceId}`,
        ],
      );
    }
    return {
      received: true,
      duplicateEvent: false,
      handled: true,
      duplicatePayment: false,
    };
  }
}
