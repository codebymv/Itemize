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
                        is_active: true,
                        webhook_secret: secret,
                    }]
                })
                .mockResolvedValueOnce({ rows: [{ id: 1 }] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] }),
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

    it('accepts valid signatures', async () => {
        const timestamp = Date.now().toString();
        const res = await request(app)
            .post('/api/webhooks/1')
            .set('Content-Type', 'application/json')
            .set('x-itemize-timestamp', timestamp)
            .set('x-itemize-signature', sign(secret, timestamp, body))
            .send(body);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
