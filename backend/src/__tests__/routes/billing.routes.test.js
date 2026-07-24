const express = require('express');
const request = require('supertest');

jest.mock('../../services/stripe.service', () => {
    return jest.fn().mockImplementation(() => ({ stripe: {} }));
});

const billingRoutes = require('../../routes/billing.routes');

function createApp({ processWebhookEvent, verifyWebhook }) {
    const app = express();
    app.use('/api/billing', billingRoutes(
        { connect: jest.fn() },
        (_req, _res, next) => next(),
        { processWebhookEvent, verifyWebhook }
    ));
    return app;
}

describe('billing retained HTTP boundary', () => {
    it('exposes only the signed webhook route', async () => {
        const event = { id: 'evt_test', type: 'customer.subscription.updated' };
        const verifyWebhook = jest.fn(() => event);
        const processWebhookEvent = jest.fn(async (_client, value) => ({
            eventId: value.id,
        }));
        const pool = {
            query: jest.fn(),
            connect: jest.fn(async () => ({
                query: jest.fn(),
                release: jest.fn(),
            })),
        };
        const app = express();
        app.use('/api/billing', billingRoutes(
            pool,
            (_req, _res, next) => next(),
            { processWebhookEvent, verifyWebhook }
        ));

        const webhook = await request(app)
            .post('/api/billing/webhook')
            .set('stripe-signature', 'signed')
            .set('content-type', 'application/json')
            .send(JSON.stringify(event));
        expect(webhook.status).toBe(200);
        expect(webhook.body).toMatchObject({ received: true, eventId: 'evt_test' });
        expect(verifyWebhook).toHaveBeenCalledWith(expect.objectContaining({
            signature: 'signed',
        }));
        expect(processWebhookEvent).toHaveBeenCalledWith(
            expect.anything(),
            event
        );

        for (const [method, path] of [
            ['get', '/api/billing'],
            ['get', '/api/billing/plans'],
            ['get', '/api/billing/usage'],
            ['post', '/api/billing/checkout'],
            ['post', '/api/billing/portal'],
            ['post', '/api/billing/acknowledge-trial-end'],
        ]) {
            expect((await request(app)[method](path).send({})).status).toBe(404);
        }
    });

    it('fails closed when the Stripe signature is absent', async () => {
        const app = createApp({
            verifyWebhook: jest.fn(),
            processWebhookEvent: jest.fn(),
        });
        expect((await request(app).post('/api/billing/webhook').send('{}')).status)
            .toBe(400);
    });
});
