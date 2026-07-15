const express = require('express');
const request = require('supertest');
const createStripeWebhookRoutes = require('../../routes/invoices/stripe-webhook.routes');

function stripeEvent(id = 'evt_1') {
    return {
        id,
        type: 'checkout.session.completed',
        data: {
            object: {
                id: 'cs_1',
                payment_intent: 'pi_1',
                payment_status: 'paid',
                amount_total: 2500,
                currency: 'usd',
                metadata: { invoice_id: '42', organization_id: '7' },
            },
        },
    };
}

function createClient({ failPayment = false } = {}) {
    const claimedEvents = new Set();
    let paymentRecorded = false;
    const client = {
        release: jest.fn(),
        query: jest.fn(async (sql, params) => {
            if (sql.includes('INSERT INTO stripe_webhook_events')) {
                if (claimedEvents.has(params[0])) return { rowCount: 0, rows: [] };
                claimedEvents.add(params[0]);
                return { rowCount: 1, rows: [{ event_id: params[0] }] };
            }
            if (sql.includes('SELECT id FROM payments')) {
                return { rows: paymentRecorded ? [{ id: 1 }] : [] };
            }
            if (sql.includes('SELECT organization_id')) {
                return { rows: [{ organization_id: 7, total: '25.00', amount_paid: '0.00' }] };
            }
            if (sql.includes('INSERT INTO payments')) {
                if (failPayment) throw new Error('simulated payment write failure');
                paymentRecorded = true;
                return { rowCount: 1, rows: [] };
            }
            return { rowCount: 1, rows: [] };
        }),
    };
    return client;
}

function createApp(client) {
    const app = express();
    const pool = { connect: jest.fn().mockResolvedValue(client) };
    const stripe = { webhooks: { constructEvent: jest.fn() } };
    app.use('/api/invoices', createStripeWebhookRoutes({ pool, stripe }));
    return app;
}

describe('Stripe invoice webhook transaction', () => {
    const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

    beforeEach(() => {
        delete process.env.STRIPE_WEBHOOK_SECRET;
    });

    afterAll(() => {
        if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
        else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    });

    test('commits once and acknowledges duplicate event delivery', async () => {
        const client = createClient();
        const app = createApp(client);

        const first = await request(app)
            .post('/api/invoices/webhook/stripe')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify(stripeEvent()));
        const second = await request(app)
            .post('/api/invoices/webhook/stripe')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify(stripeEvent()));

        expect(first.status).toBe(200);
        expect(first.body.data).toMatchObject({ duplicateEvent: false, handled: true });
        expect(second.status).toBe(200);
        expect(second.body.data).toMatchObject({ duplicateEvent: true, handled: false });
        expect(client.query.mock.calls.filter(([sql]) => sql === 'BEGIN')).toHaveLength(2);
        expect(client.query.mock.calls.filter(([sql]) => sql === 'COMMIT')).toHaveLength(2);
        expect(client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO payments'))).toHaveLength(1);
        expect(client.release).toHaveBeenCalledTimes(2);
    });

    test('rolls back the event claim and payment mutation together on failure', async () => {
        const client = createClient({ failPayment: true });
        const app = createApp(client);

        const response = await request(app)
            .post('/api/invoices/webhook/stripe')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify(stripeEvent('evt_failure')));

        expect(response.status).toBe(500);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
        expect(client.release).toHaveBeenCalledTimes(1);
    });
});
