const express = require('express');
const request = require('supertest');
const TestDbHelper = require('./test-db-helper');
const createStripeWebhookRoutes = require('../../routes/invoices/stripe-webhook.routes');

describe('Stripe webhook PostgreSQL idempotency', () => {
    let dbHelper;
    let app;
    let user;
    let invoiceId;
    const eventId = `evt_integration_${Date.now()}`;
    const originalSkipVerify = process.env.STRIPE_WEBHOOK_SKIP_VERIFY;

    beforeAll(async () => {
        process.env.STRIPE_WEBHOOK_SKIP_VERIFY = 'true';
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        user = await dbHelper.seedUser(
            `stripe-webhook-${Date.now()}@test.itemize`,
            'Stripe Webhook Test User'
        );

        const invoiceResult = await dbHelper.pool.query(`
            INSERT INTO invoices (
                organization_id, invoice_number, due_date, total, amount_due, created_by
            ) VALUES ($1, $2, CURRENT_DATE + 30, 100, 100, $3)
            RETURNING id
        `, [user.org.id, `STRIPE-${Date.now()}`, user.user.id]);
        invoiceId = invoiceResult.rows[0].id;

        app = express();
        const stripe = { webhooks: { constructEvent: jest.fn() } };
        app.use('/api/invoices', createStripeWebhookRoutes({ pool: dbHelper.pool, stripe }));
    }, 30000);

    afterAll(async () => {
        if (dbHelper?.pool) {
            await dbHelper.pool.query('DELETE FROM stripe_webhook_events WHERE event_id = $1', [eventId]);
        }
        await dbHelper?.teardown();
        if (originalSkipVerify === undefined) delete process.env.STRIPE_WEBHOOK_SKIP_VERIFY;
        else process.env.STRIPE_WEBHOOK_SKIP_VERIFY = originalSkipVerify;
    }, 30000);

    test('concurrent duplicate delivery creates one payment and one invoice mutation', async () => {
        const payload = JSON.stringify({
            id: eventId,
            type: 'checkout.session.completed',
            data: {
                object: {
                    id: `cs_${eventId}`,
                    payment_intent: `pi_${eventId}`,
                    payment_status: 'paid',
                    amount_total: 10000,
                    currency: 'usd',
                    metadata: {
                        invoice_id: String(invoiceId),
                        organization_id: String(user.org.id),
                    },
                },
            },
        });

        const send = () => request(app)
            .post('/api/invoices/webhook/stripe')
            .set('Content-Type', 'application/json')
            .send(payload);
        const responses = await Promise.all([send(), send()]);

        expect(responses.map(response => response.status)).toEqual([200, 200]);
        expect(responses.filter(response => response.body.data.duplicateEvent)).toHaveLength(1);

        const payments = await dbHelper.pool.query(
            'SELECT amount FROM payments WHERE invoice_id = $1',
            [invoiceId]
        );
        expect(payments.rows).toHaveLength(1);
        expect(Number(payments.rows[0].amount)).toBe(100);

        const invoice = await dbHelper.pool.query(
            'SELECT amount_paid, amount_due, status FROM invoices WHERE id = $1',
            [invoiceId]
        );
        expect(Number(invoice.rows[0].amount_paid)).toBe(100);
        expect(Number(invoice.rows[0].amount_due)).toBe(0);
        expect(invoice.rows[0].status).toBe('paid');
    });
});
