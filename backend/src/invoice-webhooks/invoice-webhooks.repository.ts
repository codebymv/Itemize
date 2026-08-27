import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  StripeInvoiceEvent,
  StripeInvoiceWebhookRepositoryResult,
} from './invoice-webhooks.types';
import { NotificationsService } from '../notifications/notifications.service';

type InvoicePaymentRow = {
  id: number;
  organization_id: number;
  contact_id: number | null;
  total: string;
  amount_paid: string;
  amount_due: string;
  currency: string;
  status: string;
  invoice_number: string;
  created_by: number | null;
  customer_name: string | null;
};

@Injectable()
export class InvoiceWebhooksRepository {
  private readonly logger = new Logger(InvoiceWebhooksRepository.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly notifications: NotificationsService,
  ) {}

  async process(event: StripeInvoiceEvent): Promise<StripeInvoiceWebhookRepositoryResult> {
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
  ): Promise<StripeInvoiceWebhookRepositoryResult> {
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
      const session = event.session;
      if (!session) {
        throw new Error('Verified Stripe expiration is missing Checkout evidence');
      }
      const expired = await client.query<{
        organization_id: number;
        invoice_id: number;
      }>(
        `UPDATE invoice_payment_link_intents
         SET status = 'rejected',
             last_error = 'Stripe Checkout session expired before payment',
             updated_at = CURRENT_TIMESTAMP
         WHERE provider_session_id = $1
           AND status IN ('processing', 'ready', 'reconciliation_required')
         RETURNING organization_id, invoice_id`,
        [session.id],
      );
      const intent = expired.rows[0];
      if (!intent) {
        return {
          received: true,
          duplicateEvent: false,
          handled: false,
          reason: 'checkout_session_not_active',
        };
      }
      await client.query(
        `UPDATE invoices
         SET stripe_payment_intent_id = NULL,
             stripe_hosted_invoice_url = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND organization_id = $2
           AND stripe_payment_intent_id = $3`,
        [intent.invoice_id, intent.organization_id, session.id],
      );
      return { received: true, duplicateEvent: false, handled: true };
    }
    if (
      event.type === 'account.updated' ||
      event.type === 'account.application.deauthorized'
    ) {
      const account = event.connectedAccount;
      if (!account || account.connected === null) {
        throw new Error('Verified Stripe account event is missing readiness evidence');
      }
      const updated = await client.query(
        `UPDATE payment_settings
         SET stripe_connected = $2,
             stripe_connected_at = CASE
               WHEN $2 THEN COALESCE(stripe_connected_at, CURRENT_TIMESTAMP)
               ELSE NULL
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE stripe_account_id = $1`,
        [account.stripeAccountId, account.connected],
      );
      return {
        received: true,
        duplicateEvent: false,
        handled: updated.rowCount === 1,
        ...(updated.rowCount === 1 ? {} : { reason: 'connected_account_not_found' }),
      };
    }
    if (
      event.type === 'refund.created' ||
      event.type === 'refund.updated' ||
      event.type === 'refund.failed'
    ) {
      return this.processRefund(client, event);
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
              currency, status, invoice_number, created_by, customer_name
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
    await client.query(
      `UPDATE invoice_payment_link_intents
       SET status = 'paid', updated_at = CURRENT_TIMESTAMP
       WHERE provider_session_id = $1
         AND organization_id = $2
         AND invoice_id = $3`,
      [session.id, invoice.organization_id, session.invoiceId],
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
                 amount_due, currency, status, invoice_number, created_by,
                 customer_name`,
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
      const recipientUserId = await this.notificationRecipient(
        client,
        invoice.organization_id,
        invoice.created_by,
      );
      if (recipientUserId) {
        const formattedTotal = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: invoice.currency || 'USD',
        }).format(Number(invoice.total || 0));
        const customer = invoice.customer_name?.trim() || 'Your customer';
        await this.notifications.createWithClient(client, {
          organizationId: invoice.organization_id,
          recipientUserId,
          eventType: 'invoice.paid',
          entityType: 'invoice',
          entityId: session.invoiceId,
          dedupeKey: `invoice:${session.invoiceId}:paid`,
          payload: {
            invoiceNumber: invoice.invoice_number,
            customerName: customer,
            total: invoice.total,
            currency: invoice.currency,
            paymentId: Number(inserted.rows[0].id),
          },
          category: 'billing',
          priority: 'high',
          title: 'Invoice paid',
          body: `${customer} paid ${invoice.invoice_number} in full for ${formattedTotal}.`,
          href: `/invoices/${session.invoiceId}`,
        });
      }
    }
    return {
      received: true,
      duplicateEvent: false,
      handled: true,
      duplicatePayment: false,
      ...(balance.status === 'paid' && invoice.status !== 'paid' ? {
        activation: {
          organizationId: invoice.organization_id,
          invoiceId: session.invoiceId,
        },
      } : {}),
    };
  }

  private async notificationRecipient(
    client: PoolClient,
    organizationId: number,
    preferredUserId: number | null,
  ): Promise<number | null> {
    const result = await client.query<{ user_id: number }>(
      `SELECT member.user_id
       FROM organization_members member
       WHERE member.organization_id=$1
         AND (member.user_id=$2 OR member.role='owner')
       ORDER BY CASE WHEN member.user_id=$2 THEN 0 ELSE 1 END,
                member.joined_at,member.user_id
       LIMIT 1`,
      [organizationId, preferredUserId],
    );
    return result.rows[0] ? Number(result.rows[0].user_id) : null;
  }

  private async processRefund(
    client: PoolClient,
    event: StripeInvoiceEvent,
  ): Promise<StripeInvoiceWebhookRepositoryResult> {
    const refund = event.refund;
    if (!refund) throw new Error('Verified Stripe refund event is missing refund evidence');
    const paymentResult = await client.query<{
      id: number;
      organization_id: number;
      invoice_id: number | null;
      created_by: number | null;
      customer_name: string | null;
      invoice_number: string | null;
      amount: string;
      currency: string;
    }>(
      `SELECT payment.id,payment.organization_id,payment.invoice_id,
              invoice.created_by,invoice.customer_name,invoice.invoice_number,
              payment.amount,payment.currency
       FROM payments payment
       JOIN payment_settings settings
         ON settings.organization_id=payment.organization_id
        AND settings.stripe_account_id=$2
       LEFT JOIN invoices invoice
         ON invoice.id=payment.invoice_id
        AND invoice.organization_id=payment.organization_id
       WHERE payment.stripe_payment_intent_id=$1
       FOR UPDATE OF payment`,
      [refund.paymentReference, refund.stripeAccountId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      return {
        received: true,
        duplicateEvent: false,
        handled: false,
        reason: 'payment_not_found',
      };
    }
    if (payment.currency.toUpperCase() !== refund.currency) {
      throw new Error('Verified Stripe refund currency mismatched payment currency');
    }
    const existing = await client.query<{ status: string }>(
      `SELECT status FROM payment_refunds WHERE stripe_refund_id=$1 FOR UPDATE`,
      [refund.refundId],
    );
    await client.query(
      `INSERT INTO payment_refunds (
         organization_id,payment_id,idempotency_key,stripe_refund_id,
         amount,currency,status,reason,provider_failure_code,completed_at
       ) VALUES ($1,$2,$3,$4,$5::numeric,$6,$7::varchar,$8,$9,
                  CASE WHEN $7::varchar='succeeded' THEN CURRENT_TIMESTAMP ELSE NULL END)
       ON CONFLICT (stripe_refund_id) WHERE stripe_refund_id IS NOT NULL
       DO UPDATE SET status=EXCLUDED.status,reason=COALESCE(EXCLUDED.reason,payment_refunds.reason),
         provider_failure_code=EXCLUDED.provider_failure_code,
         completed_at=CASE WHEN EXCLUDED.status='succeeded'
           THEN COALESCE(payment_refunds.completed_at,CURRENT_TIMESTAMP)
           ELSE payment_refunds.completed_at END,
         updated_at=CURRENT_TIMESTAMP`,
      [
        payment.organization_id,
        payment.id,
        `stripe:${refund.refundId}`,
        refund.refundId,
        refund.amount,
        refund.currency,
        refund.status,
        refund.reason,
        refund.failureCode,
      ],
    );
    const paymentBalance = await client.query<{
      invoice_id: number | null;
      refund_amount: string;
      status: string;
    }>(
      `UPDATE payments target
       SET refund_amount=summary.refunded,
           stripe_refund_id=summary.latest_refund_id,
           refund_reason=summary.latest_reason,
           refunded_at=CASE WHEN summary.refunded > 0 THEN summary.latest_completed_at ELSE NULL END,
           status=CASE WHEN summary.refunded >= target.amount THEN 'refunded' ELSE 'succeeded' END,
           updated_at=CURRENT_TIMESTAMP
       FROM (
         SELECT COALESCE(SUM(amount) FILTER (WHERE status='succeeded'),0) AS refunded,
                (ARRAY_AGG(stripe_refund_id ORDER BY completed_at DESC NULLS LAST,id DESC)
                  FILTER (WHERE status='succeeded'))[1] AS latest_refund_id,
                (ARRAY_AGG(reason ORDER BY completed_at DESC NULLS LAST,id DESC)
                  FILTER (WHERE status='succeeded'))[1] AS latest_reason,
                MAX(completed_at) FILTER (WHERE status='succeeded') AS latest_completed_at
         FROM payment_refunds
         WHERE organization_id=$1 AND payment_id=$2
       ) summary
       WHERE target.id=$2 AND target.organization_id=$1
       RETURNING target.invoice_id,target.refund_amount,target.status`,
      [payment.organization_id, payment.id],
    );
    const invoiceId = paymentBalance.rows[0]?.invoice_id;
    if (invoiceId) {
      const invoiceBalance = await client.query<{ status: string }>(
        `WITH balance AS (
           SELECT COALESCE(SUM(GREATEST(0,p.amount-COALESCE(p.refund_amount,0)))
                     FILTER (WHERE p.status IN ('succeeded','refunded')),0) AS net_paid
           FROM payments p
           WHERE p.organization_id=$1 AND p.invoice_id=$2
         )
         UPDATE invoices invoice
         SET amount_paid=balance.net_paid,
             amount_due=CASE
               WHEN balance.net_paid <= 0 THEN 0
               ELSE GREATEST(0,invoice.total-balance.net_paid)
             END,
             status=CASE WHEN balance.net_paid <= 0 THEN 'refunded'
               WHEN invoice.total-balance.net_paid <= 0 THEN 'paid' ELSE 'partial' END,
             paid_at=CASE WHEN invoice.total-balance.net_paid <= 0 THEN invoice.paid_at ELSE NULL END,
             updated_at=CURRENT_TIMESTAMP
         FROM balance
         WHERE invoice.id=$2 AND invoice.organization_id=$1
         RETURNING invoice.status`,
        [payment.organization_id, invoiceId],
      );
      if (invoiceBalance.rows[0]?.status === 'refunded') {
        await client.query(
          `UPDATE invoice_payment_link_intents
           SET status='refunded',updated_at=CURRENT_TIMESTAMP
           WHERE organization_id=$1 AND invoice_id=$2 AND status='paid'`,
          [payment.organization_id, invoiceId],
        );
      }
    }
    if (refund.status === 'succeeded' && existing.rows[0]?.status !== 'succeeded') {
      const recipientUserId = await this.notificationRecipient(
        client,
        payment.organization_id,
        payment.created_by,
      );
      if (recipientUserId) {
        const formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: payment.currency,
        }).format(Number(refund.amount));
        await this.notifications.createWithClient(client, {
          organizationId: payment.organization_id,
          recipientUserId,
          eventType: 'payment.refunded',
          entityType: 'invoice',
          entityId: payment.invoice_id,
          dedupeKey: `stripe-refund:${refund.refundId}:succeeded`,
          payload: {
            refundId: refund.refundId,
            paymentId: payment.id,
            invoiceNumber: payment.invoice_number,
            amount: refund.amount,
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
    return { received: true, duplicateEvent: false, handled: true };
  }
}
