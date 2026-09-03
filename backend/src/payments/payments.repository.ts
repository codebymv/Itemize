import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PaymentMethod, PaymentPeriod, PaymentStatus } from './payment.types';
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
      replayed: boolean;
    }
  | { kind: 'invoice-not-found' }
  | { kind: 'contact-not-found' }
  | { kind: 'idempotency-conflict' }
  | { kind: 'result-unavailable' };

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

export type PaymentRange = {
  period: PaymentPeriod;
  startAt: Date | null;
  endAt: Date;
  timeZone: string;
};

export type PaymentOverviewRow = {
  currency: string;
  failed_amount: string;
  failed_count: string;
  gross_amount: string;
  gross_count: string;
  in_progress_amount: string;
  in_progress_count: string;
  refunded_amount: string;
  refunded_count: string;
  net_amount: string;
};

export type RevenueFlowSummaryRow = {
  currency: string;
  booked_sales: string;
  booked_deals: string;
  failed_amount: string;
  failed_count: string;
  gross_received: string;
  settled_payments: string;
  in_progress_amount: string;
  in_progress_count: string;
  refunds: string;
  refunded_payments: string;
  net_received: string;
};

export type RevenueFlowBucketRow = {
  currency: string;
  start_at: Date;
  booked_sales: string;
  booked_deals: string;
  gross_received: string;
  settled_payments: string;
  refunds: string;
  refunded_payments: string;
  net_received: string;
};

export type RevenueFlowMethodRow = {
  currency: string;
  payment_method: PaymentMethod;
  gross_received: string;
  settled_payments: string;
  refunds: string;
  refunded_payments: string;
  net_received: string;
};

export type RevenueFlowSnapshot = {
  startAt: Date | null;
  bucketUnit: 'day' | 'week' | 'month' | 'quarter' | 'year';
  boundaries: Date[];
  summaries: RevenueFlowSummaryRow[];
  buckets: RevenueFlowBucketRow[];
  methods: RevenueFlowMethodRow[];
};

type FindPaymentPageOptions = {
  pageSize: number;
  offset: number;
  range: PaymentRange;
  status?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  search?: string;
};

@Injectable()
export class PaymentsRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly notifications: NotificationsService,
  ) {}

  async periodRange(
    organizationId: number,
    period: PaymentPeriod,
  ): Promise<PaymentRange> {
    const result = await this.pool.query<{
      start_at: Date | null;
      end_at: Date;
      time_zone: string;
    }>(
      `WITH organization_zone AS (
         SELECT COALESCE(zone.name, 'UTC') AS time_zone
         FROM organizations organization
         LEFT JOIN pg_timezone_names zone
           ON zone.name = organization.settings->>'timezone'
         WHERE organization.id = $1
       )
       SELECT
         CASE $2::varchar
           WHEN 'all' THEN NULL
           WHEN '7days' THEN
             (((CURRENT_TIMESTAMP AT TIME ZONE time_zone)::date - 6)::timestamp
               AT TIME ZONE time_zone)
           WHEN '30days' THEN
             (((CURRENT_TIMESTAMP AT TIME ZONE time_zone)::date - 29)::timestamp
               AT TIME ZONE time_zone)
           WHEN '90days' THEN
             (((CURRENT_TIMESTAMP AT TIME ZONE time_zone)::date - 89)::timestamp
               AT TIME ZONE time_zone)
           WHEN '6months' THEN
             (((CURRENT_TIMESTAMP AT TIME ZONE time_zone)::date - INTERVAL '6 months')
               AT TIME ZONE time_zone)
           WHEN '12months' THEN
             (((CURRENT_TIMESTAMP AT TIME ZONE time_zone)::date - INTERVAL '12 months')
               AT TIME ZONE time_zone)
           ELSE NULL
         END AS start_at,
         CURRENT_TIMESTAMP AS end_at,
         time_zone
       FROM organization_zone`,
      [organizationId, period],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Payment period organization was not found');
    return {
      period,
      startAt: row.start_at,
      endAt: row.end_at,
      timeZone: row.time_zone,
    };
  }

  async overview(
    organizationId: number,
    range: PaymentRange,
  ): Promise<PaymentOverviewRow[]> {
    const result = await this.pool.query<PaymentOverviewRow>(
      `WITH payment_metrics AS (
         SELECT
           p.currency,
           COALESCE(SUM(p.amount) FILTER (
             WHERE p.status = 'failed'
               AND ($2::timestamptz IS NULL OR p.created_at >= $2)
               AND p.created_at < $3
           ), 0) AS failed_amount,
           COUNT(*) FILTER (
             WHERE p.status = 'failed'
               AND ($2::timestamptz IS NULL OR p.created_at >= $2)
               AND p.created_at < $3
           ) AS failed_count,
           COALESCE(SUM(p.amount) FILTER (
             WHERE p.status IN ('succeeded', 'refunded')
               AND p.paid_at IS NOT NULL
               AND ($2::timestamptz IS NULL OR p.paid_at >= $2)
               AND p.paid_at < $3
           ), 0) AS gross_amount,
           COUNT(*) FILTER (
             WHERE p.status IN ('succeeded', 'refunded')
               AND p.paid_at IS NOT NULL
               AND ($2::timestamptz IS NULL OR p.paid_at >= $2)
               AND p.paid_at < $3
           ) AS gross_count,
           COALESCE(SUM(p.amount) FILTER (
             WHERE p.status IN ('pending', 'processing')
               AND ($2::timestamptz IS NULL OR p.created_at >= $2)
               AND p.created_at < $3
           ), 0) AS in_progress_amount,
           COUNT(*) FILTER (
             WHERE p.status IN ('pending', 'processing')
               AND ($2::timestamptz IS NULL OR p.created_at >= $2)
               AND p.created_at < $3
           ) AS in_progress_count
         FROM payments p
         WHERE p.organization_id = $1
         GROUP BY p.currency
       ),
       refund_metrics AS (
         SELECT
           refund.currency,
           COALESCE(SUM(refund.amount), 0) AS refunded_amount,
           COUNT(DISTINCT refund.payment_id) AS refunded_count
         FROM payment_refunds refund
         WHERE refund.organization_id = $1
           AND refund.status = 'succeeded'
           AND refund.completed_at IS NOT NULL
           AND ($2::timestamptz IS NULL OR refund.completed_at >= $2)
           AND refund.completed_at < $3
         GROUP BY refund.currency
       ),
       currencies AS (
         SELECT currency FROM payment_metrics
         UNION
         SELECT currency FROM refund_metrics
       )
       SELECT
         currencies.currency,
         COALESCE(payment.failed_amount, 0)::numeric(14,2) AS failed_amount,
         COALESCE(payment.failed_count, 0)::text AS failed_count,
         COALESCE(payment.gross_amount, 0)::numeric(14,2) AS gross_amount,
         COALESCE(payment.gross_count, 0)::text AS gross_count,
         COALESCE(payment.in_progress_amount, 0)::numeric(14,2) AS in_progress_amount,
         COALESCE(payment.in_progress_count, 0)::text AS in_progress_count,
         COALESCE(refund.refunded_amount, 0)::numeric(14,2) AS refunded_amount,
         COALESCE(refund.refunded_count, 0)::text AS refunded_count,
         (COALESCE(payment.gross_amount, 0) - COALESCE(refund.refunded_amount, 0))::numeric(14,2)
           AS net_amount
       FROM currencies
       LEFT JOIN payment_metrics payment USING (currency)
       LEFT JOIN refund_metrics refund USING (currency)
       ORDER BY currencies.currency`,
      [organizationId, range.startAt, range.endAt],
    );
    return result.rows;
  }

  async revenueFlow(
    organizationId: number,
    range: PaymentRange,
  ): Promise<RevenueFlowSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      let startAt = range.startAt;
      if (startAt === null) {
        const earliest = await client.query<{ start_at: Date | null }>(
          `SELECT MIN(event_at) AS start_at
           FROM (
             SELECT won_at AS event_at
             FROM deals
             WHERE organization_id = $1 AND won_at IS NOT NULL AND won_at < $2
             UNION ALL
             SELECT paid_at
             FROM payments
             WHERE organization_id = $1
               AND status IN ('succeeded', 'refunded')
               AND paid_at IS NOT NULL AND paid_at < $2
             UNION ALL
             SELECT created_at
             FROM payments
             WHERE organization_id = $1
               AND status IN ('pending', 'processing', 'failed')
               AND created_at < $2
             UNION ALL
             SELECT completed_at
             FROM payment_refunds
             WHERE organization_id = $1
               AND status = 'succeeded'
               AND completed_at IS NOT NULL AND completed_at < $2
           ) activity`,
          [organizationId, range.endAt],
        );
        startAt = earliest.rows[0]?.start_at ?? null;
      }

      const bucketUnit = this.revenueBucketUnit(range.period, startAt, range.endAt);
      const effectiveStart = startAt ?? range.endAt;
      const parameters = [
        organizationId,
        effectiveStart,
        range.endAt,
        range.timeZone,
        bucketUnit,
      ];
      const summaries = await client.query<RevenueFlowSummaryRow>(
        `WITH booked AS (
           SELECT
             COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD') AS currency,
             COALESCE(SUM(value), 0) AS booked_sales,
             COUNT(*) AS booked_deals
           FROM deals
           WHERE organization_id = $1
             AND won_at >= $2 AND won_at < $3
           GROUP BY COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD')
         ),
         payment AS (
           SELECT
             COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD') AS currency,
             COALESCE(SUM(amount) FILTER (
               WHERE status = 'failed' AND created_at >= $2 AND created_at < $3
             ), 0) AS failed_amount,
             COUNT(*) FILTER (
               WHERE status = 'failed' AND created_at >= $2 AND created_at < $3
             ) AS failed_count,
             COALESCE(SUM(amount) FILTER (
               WHERE status IN ('succeeded', 'refunded')
                 AND paid_at >= $2 AND paid_at < $3
             ), 0) AS gross_received,
             COUNT(*) FILTER (
               WHERE status IN ('succeeded', 'refunded')
                 AND paid_at >= $2 AND paid_at < $3
             ) AS settled_payments,
             COALESCE(SUM(amount) FILTER (
               WHERE status IN ('pending', 'processing')
                 AND created_at >= $2 AND created_at < $3
             ), 0) AS in_progress_amount,
             COUNT(*) FILTER (
               WHERE status IN ('pending', 'processing')
                 AND created_at >= $2 AND created_at < $3
             ) AS in_progress_count
           FROM payments
           WHERE organization_id = $1
             AND (
               (status IN ('succeeded', 'refunded') AND paid_at >= $2 AND paid_at < $3)
               OR (status IN ('pending', 'processing', 'failed') AND created_at >= $2 AND created_at < $3)
             )
           GROUP BY COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD')
         ),
         refund AS (
           SELECT
             COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD') AS currency,
             COALESCE(SUM(amount), 0) AS refunds,
             COUNT(DISTINCT payment_id) AS refunded_payments
           FROM payment_refunds
           WHERE organization_id = $1
             AND status = 'succeeded'
             AND completed_at >= $2 AND completed_at < $3
           GROUP BY COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD')
         ),
         currencies AS (
           SELECT currency FROM booked
           UNION SELECT currency FROM payment
           UNION SELECT currency FROM refund
         )
         SELECT
           currencies.currency,
           COALESCE(booked.booked_sales, 0)::numeric(14,2) AS booked_sales,
           COALESCE(booked.booked_deals, 0)::text AS booked_deals,
           COALESCE(payment.failed_amount, 0)::numeric(14,2) AS failed_amount,
           COALESCE(payment.failed_count, 0)::text AS failed_count,
           COALESCE(payment.gross_received, 0)::numeric(14,2) AS gross_received,
           COALESCE(payment.settled_payments, 0)::text AS settled_payments,
           COALESCE(payment.in_progress_amount, 0)::numeric(14,2) AS in_progress_amount,
           COALESCE(payment.in_progress_count, 0)::text AS in_progress_count,
           COALESCE(refund.refunds, 0)::numeric(14,2) AS refunds,
           COALESCE(refund.refunded_payments, 0)::text AS refunded_payments,
           (COALESCE(payment.gross_received, 0) - COALESCE(refund.refunds, 0))::numeric(14,2)
             AS net_received
         FROM currencies
         LEFT JOIN booked USING (currency)
         LEFT JOIN payment USING (currency)
         LEFT JOIN refund USING (currency)
         ORDER BY currencies.currency`,
        parameters.slice(0, 3),
      );
      const buckets = await client.query<RevenueFlowBucketRow>(
        `WITH events AS (
           SELECT
             COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD') AS currency,
             DATE_TRUNC($5::text, won_at AT TIME ZONE $4::text) AT TIME ZONE $4::text
               AS start_at,
             value::numeric AS booked_sales,
             1::bigint AS booked_deals,
             0::numeric AS gross_received,
             0::bigint AS settled_payments,
             0::numeric AS refunds,
             0::bigint AS refunded_payments
           FROM deals
           WHERE organization_id = $1 AND won_at >= $2 AND won_at < $3
           UNION ALL
           SELECT
             COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD'),
             DATE_TRUNC($5::text, paid_at AT TIME ZONE $4::text) AT TIME ZONE $4::text,
             0, 0, amount, 1, 0, 0
           FROM payments
           WHERE organization_id = $1
             AND status IN ('succeeded', 'refunded')
             AND paid_at >= $2 AND paid_at < $3
           UNION ALL
           SELECT
             COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD'),
             DATE_TRUNC($5::text, completed_at AT TIME ZONE $4::text) AT TIME ZONE $4::text,
             0, 0, 0, 0, amount, 1
           FROM payment_refunds
           WHERE organization_id = $1
             AND status = 'succeeded'
             AND completed_at >= $2 AND completed_at < $3
         )
         SELECT
           currency, start_at,
           COALESCE(SUM(booked_sales), 0)::numeric(14,2) AS booked_sales,
           COALESCE(SUM(booked_deals), 0)::text AS booked_deals,
           COALESCE(SUM(gross_received), 0)::numeric(14,2) AS gross_received,
           COALESCE(SUM(settled_payments), 0)::text AS settled_payments,
           COALESCE(SUM(refunds), 0)::numeric(14,2) AS refunds,
           COALESCE(SUM(refunded_payments), 0)::text AS refunded_payments,
           (COALESCE(SUM(gross_received), 0) - COALESCE(SUM(refunds), 0))::numeric(14,2)
             AS net_received
         FROM events
         GROUP BY currency, start_at
         ORDER BY currency, start_at`,
        parameters,
      );
      const methods = await client.query<RevenueFlowMethodRow>(
        `WITH gross AS (
           SELECT
             COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD') AS currency,
             payment_method,
             COALESCE(SUM(amount), 0) AS gross_received,
             COUNT(*) AS settled_payments
           FROM payments
           WHERE organization_id = $1
             AND status IN ('succeeded', 'refunded')
             AND paid_at >= $2 AND paid_at < $3
           GROUP BY COALESCE(NULLIF(UPPER(TRIM(currency)), ''), 'USD'), payment_method
         ),
         refund AS (
           SELECT
             COALESCE(NULLIF(UPPER(TRIM(payment.currency)), ''), 'USD') AS currency,
             payment.payment_method,
             COALESCE(SUM(refund.amount), 0) AS refunds,
             COUNT(DISTINCT refund.payment_id) AS refunded_payments
           FROM payment_refunds refund
           JOIN payments payment
             ON payment.id = refund.payment_id
            AND payment.organization_id = refund.organization_id
           WHERE refund.organization_id = $1
             AND refund.status = 'succeeded'
             AND refund.completed_at >= $2 AND refund.completed_at < $3
           GROUP BY
             COALESCE(NULLIF(UPPER(TRIM(payment.currency)), ''), 'USD'),
             payment.payment_method
         ),
         methods AS (
           SELECT currency, payment_method FROM gross
           UNION SELECT currency, payment_method FROM refund
         )
         SELECT
           methods.currency,
           methods.payment_method,
           COALESCE(gross.gross_received, 0)::numeric(14,2) AS gross_received,
           COALESCE(gross.settled_payments, 0)::text AS settled_payments,
           COALESCE(refund.refunds, 0)::numeric(14,2) AS refunds,
           COALESCE(refund.refunded_payments, 0)::text AS refunded_payments,
           (COALESCE(gross.gross_received, 0) - COALESCE(refund.refunds, 0))::numeric(14,2)
             AS net_received
         FROM methods
         LEFT JOIN gross USING (currency, payment_method)
         LEFT JOIN refund USING (currency, payment_method)
         ORDER BY methods.currency, net_received DESC, methods.payment_method`,
        parameters.slice(0, 3),
      );
      const boundaries = startAt === null
        ? { rows: [] as Array<{ start_at: Date }> }
        : await client.query<{ start_at: Date }>(
          `SELECT local_bucket AT TIME ZONE $3::text AS start_at
           FROM GENERATE_SERIES(
             DATE_TRUNC($4::text, $1::timestamptz AT TIME ZONE $3::text),
             DATE_TRUNC($4::text, ($2::timestamptz - INTERVAL '1 microsecond') AT TIME ZONE $3::text),
             $5::interval
           ) AS local_bucket
           ORDER BY local_bucket`,
          [
            startAt,
            range.endAt,
            range.timeZone,
            bucketUnit,
            this.revenueBucketInterval(bucketUnit),
          ],
        );
      await client.query('COMMIT');
      return {
        startAt,
        bucketUnit,
        boundaries: boundaries.rows.map((row) => row.start_at),
        summaries: summaries.rows,
        buckets: buckets.rows,
        methods: methods.rows,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findPage(
    organizationId: number,
    options: FindPaymentPageOptions,
  ): Promise<{ rows: PaymentRow[]; total: number }> {
    const { pageSize, offset, range, status, paymentMethod, search } = options;
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
    if (range.startAt !== null) {
      values.push(range.startAt, range.endAt);
      const start = `$${values.length - 1}`;
      const end = `$${values.length}`;
      predicates.push(`(
        (p.status IN ('succeeded', 'refunded') AND p.paid_at >= ${start} AND p.paid_at < ${end})
        OR (p.status NOT IN ('succeeded', 'refunded') AND p.created_at >= ${start} AND p.created_at < ${end})
        OR (p.refunded_at >= ${start} AND p.refunded_at < ${end})
      )`);
    } else {
      values.push(range.endAt);
      const end = `$${values.length}`;
      predicates.push(`(
        (p.status IN ('succeeded', 'refunded') AND p.paid_at < ${end})
        OR (p.status NOT IN ('succeeded', 'refunded') AND p.created_at < ${end})
        OR p.refunded_at < ${end}
      )`);
    }
    if (search) {
      values.push(`%${search}%`);
      const query = `$${values.length}`;
      predicates.push(`(
        p.id::text ILIKE ${query}
        OR COALESCE(i.invoice_number, '') ILIKE ${query}
        OR COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), i.customer_name, '') ILIKE ${query}
        OR COALESCE(p.description, '') ILIKE ${query}
        OR COALESCE(p.stripe_payment_intent_id, '') ILIKE ${query}
      )`);
    }
    const where = predicates.join(' AND ');
    const from = `FROM payments p
       LEFT JOIN invoices i
         ON i.id = p.invoice_id AND i.organization_id = p.organization_id
       LEFT JOIN contacts c
         ON c.id = p.contact_id AND c.organization_id = p.organization_id`;
    const count = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total ${from} WHERE ${where}`,
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
       ${from}
       WHERE ${where}
       ORDER BY COALESCE(p.refunded_at, p.paid_at, p.created_at) DESC, p.id DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { rows: rows.rows, total: Number(count.rows[0].total) };
  }

  async record(
    organizationId: number,
    userId: number,
    values: RecordPaymentValues,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<RecordPaymentOutcome> {
    return this.transaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock($1::int, hashtext($2))',
        [organizationId, `payment-record:${idempotencyKey}`],
      );
      const receipt = await client.query<{
        request_fingerprint: string;
        result_payment_id: number | null;
      }>(
        `SELECT request_fingerprint,result_payment_id
         FROM payment_recording_receipts
         WHERE organization_id=$1 AND idempotency_key=$2
         FOR UPDATE`,
        [organizationId, idempotencyKey],
      );
      const replay = receipt.rows[0];
      if (replay) {
        if (replay.request_fingerprint !== requestFingerprint) {
          return { kind: 'idempotency-conflict' };
        }
        if (replay.result_payment_id === null) {
          return { kind: 'result-unavailable' };
        }
        const payment = await this.findByIdWith(
          client,
          organizationId,
          replay.result_payment_id,
        );
        if (!payment) return { kind: 'result-unavailable' };
        let invoiceBalance: InvoiceBalanceRow | null = null;
        if (payment.invoice_id !== null && payment.status === PaymentStatus.SUCCEEDED) {
          const currentInvoice = await client.query<InvoiceBalanceRow>(
            `SELECT amount_paid,amount_due,status
             FROM invoices
             WHERE id=$1 AND organization_id=$2`,
            [payment.invoice_id, organizationId],
          );
          if (!currentInvoice.rows[0]) return { kind: 'result-unavailable' };
          invoiceBalance = currentInvoice.rows[0];
        }
        return { kind: 'recorded', payment, invoice: invoiceBalance, replayed: true };
      }

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
      await client.query(
        `INSERT INTO payment_recording_receipts (
           organization_id,requested_by_user_id,idempotency_key,
           request_fingerprint,result_payment_id
         ) VALUES ($1,$2,$3,$4,$5)`,
        [organizationId, userId, idempotencyKey, requestFingerprint, payment.id],
      );
      return {
        kind: 'recorded',
        payment,
        invoice: invoiceBalance,
        replayed: false,
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
         SET stripe_refund_id=$3,status=$4::varchar,provider_failure_code=$5,
              provider_failure_message=$6,
              completed_at=CASE WHEN $4::varchar='succeeded' THEN CURRENT_TIMESTAMP ELSE completed_at END,
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
           amount_due=CASE
             WHEN balance.net_paid <= 0 THEN 0
             ELSE GREATEST(0,invoice.total-balance.net_paid)
           END,
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

  private revenueBucketUnit(
    period: PaymentPeriod,
    startAt: Date | null,
    endAt: Date,
  ): RevenueFlowSnapshot['bucketUnit'] {
    switch (period) {
      case PaymentPeriod.LAST_7_DAYS:
      case PaymentPeriod.LAST_30_DAYS:
        return 'day';
      case PaymentPeriod.LAST_90_DAYS:
        return 'week';
      case PaymentPeriod.LAST_6_MONTHS:
      case PaymentPeriod.LAST_12_MONTHS:
        return 'month';
      case PaymentPeriod.ALL_TIME: {
        if (startAt === null) return 'month';
        const days = Math.max(0, (endAt.getTime() - startAt.getTime()) / 86_400_000);
        if (days <= 45) return 'day';
        if (days <= 180) return 'week';
        if (days <= 730) return 'month';
        if (days <= 1_825) return 'quarter';
        return 'year';
      }
    }
  }

  private revenueBucketInterval(
    unit: RevenueFlowSnapshot['bucketUnit'],
  ): string {
    return unit === 'quarter' ? '3 months' : `1 ${unit}`;
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
