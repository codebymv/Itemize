const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const webhooksRouter = require('../../routes/webhooks.routes');

function sign(secret, timestamp, body) {
    return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

describe('workflow webhooks', () => {
    const secret = 'webhook-secret';
    const body = JSON.stringify({ eventType: 'contact_created', entityData: {} });
    let pool;
    let app;

    beforeEach(() => {
        pool = {
            query: jest.fn()
                .mockResolvedValueOnce({
                    rows: [{
                        id: 1,
                        organization_id: 10,
                        name: 'Webhook Workflow',
                        trigger_type: 'contact_added',
                        is_active: true,
                        webhook_secret: secret,
                    }]
                })
                .mockResolvedValueOnce({ rows: [{ id: 1, inserted: true }] }),
        };
        app = express();
        app.use(express.json({
            verify: (req, res, buf) => {
                req.rawBody = Buffer.from(buf);
            }
        }));
        app.use((req, res, next) => {
            req.dbPool = pool;
            next();
        });
        app.use('/api/webhooks', webhooksRouter);
    });

    it('rejects unsigned requests', async () => {
        const res = await request(app)
            .post('/api/webhooks/1')
            .set('Content-Type', 'application/json')
            .send(body);

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/Missing webhook signature/);
    });

    it('rejects invalid signatures', async () => {
        const timestamp = Date.now().toString();
        const res = await request(app)
            .post('/api/webhooks/1')
            .set('Content-Type', 'application/json')
            .set('x-itemize-timestamp', timestamp)
            .set('x-itemize-signature', '0'.repeat(64))
            .send(body);

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/Invalid webhook signature/);
    });

    it('rejects expired timestamps', async () => {
        const timestamp = (Date.now() - 10 * 60 * 1000).toString();
        const res = await request(app)
            .post('/api/webhooks/1')
            .set('Content-Type', 'application/json')
            .set('x-itemize-timestamp', timestamp)
            .set('x-itemize-signature', sign(secret, timestamp, body))
            .send(body);

        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/expired/);
    });

    it('records a matching canonical event for asynchronous enrollment', async () => {
        const timestamp = Date.now().toString();
        const res = await request(app)
            .post('/api/webhooks/1')
            .set('Content-Type', 'application/json')
            .set('x-itemize-timestamp', timestamp)
            .set('x-itemize-signature', sign(secret, timestamp, body))
            .send(body);

        expect(res.status).toBe(202);
        expect(res.body).toMatchObject({
            success: true,
            accepted: true,
            eventType: 'contact_added',
            execution: 'durably_queued',
        });
        expect(pool.query).toHaveBeenCalledTimes(2);
        expect(pool.query.mock.calls[1][1][3]).toBe('contact_added');
    });

    it('rejects a validly signed event that does not match the saved workflow trigger', async () => {
        const mismatchBody = JSON.stringify({ eventType: 'invoice_paid', entityData: {} });
        const timestamp = Date.now().toString();
        const res = await request(app)
            .post('/api/webhooks/1')
            .set('Content-Type', 'application/json')
            .set('x-itemize-timestamp', timestamp)
            .set('x-itemize-signature', sign(secret, timestamp, mismatchBody))
            .send(mismatchBody);

        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({
            expectedEventType: 'contact_added',
            receivedEventType: 'invoice_paid',
        });
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('acknowledges a duplicate delivery without loading or executing steps', async () => {
        const timestamp = Date.now().toString();
        pool.query = jest.fn()
            .mockResolvedValueOnce({
                rows: [{
                    id: 1,
                    organization_id: 10,
                    name: 'Webhook Workflow',
                    trigger_type: 'contact_added',
                    is_active: true,
                    webhook_secret: secret,
                }]
            })
            .mockResolvedValueOnce({ rows: [{ id: 1, inserted: false }] });

        const res = await request(app)
            .post('/api/webhooks/1')
            .set('Content-Type', 'application/json')
            .set('x-itemize-timestamp', timestamp)
            .set('x-itemize-signature', sign(secret, timestamp, body))
            .set('x-itemize-delivery-id', 'delivery-123')
            .send(body);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(expect.objectContaining({
            success: true,
            duplicate: true,
        }));
        expect(pool.query).toHaveBeenCalledTimes(2);
    });
});
