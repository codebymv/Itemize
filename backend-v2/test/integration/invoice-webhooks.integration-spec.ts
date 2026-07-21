import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import Stripe from 'stripe';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PG_POOL } from '../../src/database/database.module';

describe('Stripe invoice webhook retained HTTP contract', () => {
  let app: NestExpressApplication;
  let pool: Pool;
  let userId: number;
  let organizationId: number;
  let contactId: number;
  let invoiceId: number;
  let rollbackInvoiceId: number;
  const secret = 'whsec_invoice_webhook_integration';
  const stripe = new Stripe('sk_test_invoice_webhook_integration');
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

  beforeAll(async () => {
    const connectionString = process.env.TEST_DATABASE_URL;
    if (!connectionString) {
      throw new Error('TEST_DATABASE_URL is required for invoice webhook tests');
    }
    process.env.DATABASE_URL ||= 'postgresql://unused/test';
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    pool = new Pool({
      connectionString,
      ssl: process.env.TEST_DATABASE_SSL === 'true',
    });
    const suffix = `${Date.now()}-${process.pid}`;
    userId = Number((await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, provider, email_verified)
       VALUES ($1, 'Webhook Owner', 'email', true) RETURNING id`,
      [`invoice-webhook-${suffix}@test.itemize`],
    )).rows[0].id);
    organizationId = Number((await pool.query<{ id: number }>(
      `INSERT INTO organizations (name, slug)
       VALUES ('Invoice Webhook', $1) RETURNING id`,
      [`invoice-webhook-${suffix}`],
    )).rows[0].id);
    await pool.query(
      `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
       VALUES ($1, $2, 'owner', NOW())`,
      [organizationId, userId],
    );
    contactId = Number((await pool.query<{ id: number }>(
      `INSERT INTO contacts (
         organization_id, first_name, last_name, email, created_by
       ) VALUES ($1, 'Webhook', 'Customer', $2, $3) RETURNING id`,
      [organizationId, `webhook-customer-${suffix}@test.itemize`, userId],
    )).rows[0].id);
    const invoices = await pool.query<{ id: number }>(
      `INSERT INTO invoices (
         organization_id, invoice_number, contact_id, customer_name,
         customer_email, total, amount_paid, amount_due, currency,
         status, issue_date, due_date, created_by
       ) VALUES
         ($1, $2, $4, 'Webhook Customer', $5, 25.00, 0, 25.00,
          'USD', 'sent', CURRENT_DATE, CURRENT_DATE + 30, $6),
         ($1, $3, $4, 'Webhook Customer', $5, 10.00, 0, 10.00,
          'USD', 'sent', CURRENT_DATE, CURRENT_DATE + 30, $6)
       RETURNING id`,
      [
        organizationId,
        `WEBHOOK-${suffix}`,
        `WEBHOOK-ROLLBACK-${suffix}`,
        contactId,
        `webhook-customer-${suffix}@test.itemize`,
        userId,
      ],
    );
    [invoiceId, rollbackInvoiceId] = invoices.rows.map((row) => Number(row.id));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PG_POOL)
      .useValue(pool)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (pool && organizationId) {
      await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
    }
    if (pool && userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    if (app) await app.close();
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  });

  const signed = (payload: string): string =>
    stripe.webhooks.generateTestHeaderString({ payload, secret });

  const completed = (
    eventId: string,
    targetInvoiceId: number,
    paymentReference: string,
    amountTotal: number,
    metadataOrganizationId = String(organizationId),
  ): string => JSON.stringify({
    id: eventId,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${eventId}`,
        payment_intent: paymentReference,
        payment_status: 'paid',
        amount_total: amountTotal,
        currency: 'usd',
        metadata: {
          invoice_id: String(targetInvoiceId),
          organization_id: metadataOrganizationId,
        },
      },
    },
  });

  const deliver = (payload: string, signature = signed(payload)) =>
    request(app.getHttpServer())
      .post('/api/invoices/webhook/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature)
      .send(payload);

  it('verifies exact bytes and applies concurrent duplicate delivery once', async () => {
    const payload = completed(
      'evt_nest_invoice',
      invoiceId,
      'pi_nest_invoice',
      2500,
      '2147483647',
    );
    const responses = await Promise.all([deliver(payload), deliver(payload)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(responses.map((response) => response.body.data.duplicateEvent).sort())
      .toEqual([false, true]);

    const payments = await pool.query(
      `SELECT organization_id, invoice_id, contact_id, amount, currency,
              stripe_payment_intent_id
       FROM payments WHERE stripe_payment_intent_id = 'pi_nest_invoice'`,
    );
    expect(payments.rows).toEqual([expect.objectContaining({
      organization_id: organizationId,
      invoice_id: invoiceId,
      contact_id: contactId,
      amount: '25.00',
      currency: 'USD',
      stripe_payment_intent_id: 'pi_nest_invoice',
    })]);
    const invoice = await pool.query(
      'SELECT amount_paid, amount_due, status FROM invoices WHERE id = $1',
      [invoiceId],
    );
    expect(invoice.rows[0]).toMatchObject({
      amount_paid: '25.00',
      amount_due: '0.00',
      status: 'paid',
    });
    const triggers = await pool.query(
      `SELECT payload FROM workflow_triggers
       WHERE event_key = $1 AND organization_id = $2`,
      [`domain:invoice_paid:${invoiceId}`, organizationId],
    );
    expect(triggers.rows).toHaveLength(1);
    expect(triggers.rows[0].payload).toMatchObject({
      invoice_id: invoiceId,
      payment_method: 'stripe',
      payment_reference: 'pi_nest_invoice',
      stripe_event_id: 'evt_nest_invoice',
    });
  });

  it('rejects altered bytes and fails closed without verification configuration', async () => {
    const payload = completed('evt_exact_body', rollbackInvoiceId, 'pi_exact', 1000);
    await deliver(`${payload} `, signed(payload)).expect(400);
    expect((await pool.query(
      "SELECT 1 FROM stripe_webhook_events WHERE event_id = 'evt_exact_body'",
    )).rows).toHaveLength(0);

    delete process.env.STRIPE_WEBHOOK_SECRET;
    await deliver(payload, 't=1,v1=invalid').expect(503);
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    const oversized = JSON.stringify({
      id: 'evt_oversized',
      type: 'checkout.session.expired',
      data: { object: { padding: 'x'.repeat(1024 * 1024) } },
    });
    await deliver(oversized).expect(413);
  });

  it('rolls back the event claim and permits a corrected Stripe retry', async () => {
    const eventId = 'evt_nest_rollback';
    const oversized = completed(
      eventId,
      rollbackInvoiceId,
      'pi_nest_rollback',
      Number.MAX_SAFE_INTEGER,
    );
    await deliver(oversized).expect(500);
    expect((await pool.query(
      'SELECT 1 FROM stripe_webhook_events WHERE event_id = $1',
      [eventId],
    )).rows).toHaveLength(0);
    expect((await pool.query(
      "SELECT 1 FROM payments WHERE stripe_payment_intent_id = 'pi_nest_rollback'",
    )).rows).toHaveLength(0);

    const corrected = completed(eventId, rollbackInvoiceId, 'pi_nest_rollback', 1000);
    const retried = await deliver(corrected).expect(200);
    expect(retried.body.data).toMatchObject({
      received: true,
      duplicateEvent: false,
      handled: true,
      duplicatePayment: false,
    });
  });
});
