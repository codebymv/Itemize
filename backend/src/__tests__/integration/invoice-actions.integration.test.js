const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');

function createApp(pool) {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use((req, _res, next) => { req.dbPool = pool; next(); });
    app.use('/api/auth', require('../../auth').router);

    const noop = (_req, _res, next) => next();
    const mockBroadcast = {
        listUpdate: jest.fn(), noteUpdate: jest.fn(),
        whiteboardUpdate: jest.fn(), wireframeUpdate: jest.fn(),
        userListUpdate: jest.fn(), userWireframeUpdate: jest.fn(),
        userListDeleted: jest.fn(),
    };
    const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

    registerApiRoutes({
        app, pool, authenticateJWT, requireAdmin,
        publicRateLimit: noop, positionLimiter: noop,
        broadcast: mockBroadcast, io: mockIo,
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return app;
}

/** Create and return a draft invoice id */
async function createInvoice(app, user, overrides = {}) {
    const res = await request(app)
        .post('/api/invoices')
        .set('Cookie', [`itemize_auth=${user.token}`])
        .set('x-organization-id', String(user.org.id))
        .send({
            customer_name: 'Test Customer',
            customer_email: 'customer@test.com',
            items: [{ name: 'Service', quantity: 1, unit_price: 500 }],
            ...overrides,
        });
    return res.body.data;
}

async function cleanupInvoice(dbHelper, invoiceId) {
    await dbHelper.pool.query('DELETE FROM payments WHERE invoice_id = $1', [invoiceId]);
    await dbHelper.pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
    await dbHelper.pool.query('DELETE FROM invoices WHERE id = $1', [invoiceId]);
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Invoice Actions Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`inv-act-a-${Date.now()}@test.itemize`, 'Invoice Action User A'),
            dbHelper.seedUser(`inv-act-b-${Date.now()}@test.itemize`, 'Invoice Action User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── Record payment ────────────────────────────────────────────────────────

    describe('POST /api/invoices/:id/record-payment', () => {
        it('records a partial payment and sets status to partial', async () => {
            const inv = await createInvoice(app, userA);
            expect(Number(inv.total)).toBe(500);

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ amount: 200, payment_method: 'bank_transfer', notes: 'Deposit' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Number(res.body.data.invoice.amount_paid)).toBe(200);
            expect(Number(res.body.data.invoice.amount_due)).toBe(300);
            expect(res.body.data.invoice.status).toBe('partial');
            expect(res.body.data.payment).toBeTruthy();
            expect(res.body.data.payment.status).toBe('succeeded');

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('records full payment and sets status to paid', async () => {
            const inv = await createInvoice(app, userA);

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ amount: 500, payment_method: 'card' });

            expect(res.status).toBe(200);
            expect(res.body.data.invoice.status).toBe('paid');
            expect(Number(res.body.data.invoice.amount_due)).toBe(0);

            const triggers = await dbHelper.pool.query(`
                SELECT trigger_type, entity_type, entity_id, payload
                FROM workflow_triggers
                WHERE organization_id = $1
                  AND trigger_type = 'invoice_paid'
                  AND entity_type = 'invoice'
                  AND entity_id = $2
            `, [userA.org.id, inv.id]);
            expect(triggers.rows).toHaveLength(1);
            expect(triggers.rows[0]).toMatchObject({
                trigger_type: 'invoice_paid',
                entity_type: 'invoice',
                payload: expect.objectContaining({
                    invoice_id: inv.id,
                    payment_method: 'card',
                }),
            });

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('rejects payment with invalid amount (0)', async () => {
            const inv = await createInvoice(app, userA);

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ amount: 0 });

            expect(res.status).toBe(400);

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('rejects payment with missing amount', async () => {
            const inv = await createInvoice(app, userA);

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ payment_method: 'cash' });

            expect(res.status).toBe(400);

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('rejects an unsupported payment method as a client error', async () => {
            const inv = await createInvoice(app, userA);

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ amount: 500, payment_method: 'credit_card' });

            expect(res.status).toBe(400);
            expect(res.body.error.message).toBe('Invalid payment method');

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('returns 404 when invoice does not belong to org', async () => {
            const inv = await createInvoice(app, userA);

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ amount: 100, payment_method: 'cash' });

            expect(res.status).toBe(404);

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('accumulates multiple payments correctly', async () => {
            const inv = await createInvoice(app, userA, {
                items: [{ name: 'Project', quantity: 1, unit_price: 1000 }],
            });

            await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ amount: 400 });

            const res2 = await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ amount: 600 });

            expect(res2.status).toBe(200);
            expect(Number(res2.body.data.invoice.amount_paid)).toBe(1000);
            expect(res2.body.data.invoice.status).toBe('paid');

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('accumulates simultaneous payments without losing an update', async () => {
            const inv = await createInvoice(app, userA, {
                items: [{ name: 'Project', quantity: 1, unit_price: 1000 }],
            });

            const payment = amount => request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ amount, payment_method: 'card' });

            const [first, second] = await Promise.all([payment(400), payment(600)]);
            expect(first.status).toBe(200);
            expect(second.status).toBe(200);

            const fetchRes = await request(app)
                .get(`/api/invoices/${inv.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(fetchRes.status).toBe(200);
            expect(Number(fetchRes.body.data.amount_paid)).toBe(1000);
            expect(Number(fetchRes.body.data.amount_due)).toBe(0);
            expect(fetchRes.body.data.status).toBe('paid');

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('payments appear on subsequent invoice fetch', async () => {
            const inv = await createInvoice(app, userA);

            await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ amount: 250, payment_method: 'check' });

            const fetchRes = await request(app)
                .get(`/api/invoices/${inv.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(fetchRes.status).toBe(200);
            expect(fetchRes.body.data.payments).toHaveLength(1);
            expect(Number(fetchRes.body.data.payments[0].amount)).toBe(250);
            expect(fetchRes.body.data.payments[0].payment_method).toBe('check');

            await cleanupInvoice(dbHelper, inv.id);
        });
    });

    // ── Send invoice action ───────────────────────────────────────────────────

    describe('POST /api/invoices/:id/send', () => {
        it('marks a draft invoice as sent when customer_email is set', async () => {
            const inv = await createInvoice(app, userA, {
                customer_email: 'to-send@example.com',
            });
            expect(inv.status).toBe('draft');

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/send`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({});

            // Even without email configured, the route should update status to 'sent'
            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('sent');

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('rejects send when customer_email is missing', async () => {
            const inv = await createInvoice(app, userA, {
                customer_name: 'No Email',
                customer_email: null,
            });

            // Update to remove email
            await dbHelper.pool.query(
                'UPDATE invoices SET customer_email = NULL WHERE id = $1',
                [inv.id]
            );

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/send`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({});

            expect(res.status).toBe(400);
            expect(JSON.stringify(res.body)).toMatch(/email/i);

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('returns 404 when invoice does not belong to org', async () => {
            const inv = await createInvoice(app, userA, { customer_email: 'x@y.com' });

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/send`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({});

            expect(res.status).toBe(404);

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('allows resending an already-sent invoice', async () => {
            const inv = await createInvoice(app, userA, { customer_email: 'resend@example.com' });

            // First send
            await request(app)
                .post(`/api/invoices/${inv.id}/send`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({});

            // Resend with flag
            const res = await request(app)
                .post(`/api/invoices/${inv.id}/send`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ resend: true });

            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('sent');

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('blocks sending a paid invoice (without resend flag)', async () => {
            const inv = await createInvoice(app, userA, { customer_email: 'paid@example.com' });

            // Force paid status
            await dbHelper.pool.query(
                "UPDATE invoices SET status = 'paid' WHERE id = $1",
                [inv.id]
            );

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/send`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({});

            expect(res.status).toBe(400);

            await cleanupInvoice(dbHelper, inv.id);
        });
    });

    // ── Auth guard ────────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated record-payment', async () => {
            const res = await request(app)
                .post('/api/invoices/1/record-payment')
                .send({ amount: 100 });
            expect(res.status).toBe(401);
        });
    });
});
