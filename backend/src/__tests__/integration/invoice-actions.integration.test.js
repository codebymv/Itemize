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

/** Seed a draft invoice without depending on the retired Express CRUD routes. */
async function createInvoice(dbHelper, user, overrides = {}) {
    const item = overrides.items?.[0] || { name: 'Service', quantity: 1, unit_price: 500 };
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unit_price);
    const total = quantity * unitPrice;
    const customerName = overrides.customer_name === undefined
        ? 'Test Customer'
        : overrides.customer_name;
    const customerEmail = overrides.customer_email === undefined
        ? 'customer@test.com'
        : overrides.customer_email;
    const invoiceNumber = `ACTION-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const invoiceResult = await dbHelper.pool.query(`
        INSERT INTO invoices (
            organization_id, invoice_number, customer_name, customer_email,
            due_date, subtotal, total, amount_due, created_by
        ) VALUES ($1, $2, $3, $4, CURRENT_DATE + 30, $5, $5, $5, $6)
        RETURNING *
    `, [
        user.org.id,
        invoiceNumber,
        customerName,
        customerEmail,
        total,
        user.user.id,
    ]);
    const invoice = invoiceResult.rows[0];

    await dbHelper.pool.query(`
        INSERT INTO invoice_items (
            invoice_id, organization_id, name, quantity, unit_price, total
        ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [invoice.id, user.org.id, item.name, quantity, unitPrice, total]);

    return invoice;
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
            const inv = await createInvoice(dbHelper, userA);
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
            const inv = await createInvoice(dbHelper, userA);

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
            const inv = await createInvoice(dbHelper, userA);

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ amount: 0 });

            expect(res.status).toBe(400);

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('rejects payment with missing amount', async () => {
            const inv = await createInvoice(dbHelper, userA);

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ payment_method: 'cash' });

            expect(res.status).toBe(400);

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('rejects an unsupported payment method as a client error', async () => {
            const inv = await createInvoice(dbHelper, userA);

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
            const inv = await createInvoice(dbHelper, userA);

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ amount: 100, payment_method: 'cash' });

            expect(res.status).toBe(404);

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('accumulates multiple payments correctly', async () => {
            const inv = await createInvoice(dbHelper, userA, {
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
            const inv = await createInvoice(dbHelper, userA, {
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

            const invoiceResult = await dbHelper.pool.query(
                `SELECT amount_paid, amount_due, status
                 FROM invoices
                 WHERE id = $1 AND organization_id = $2`,
                [inv.id, userA.org.id]
            );

            expect(invoiceResult.rows).toHaveLength(1);
            expect(Number(invoiceResult.rows[0].amount_paid)).toBe(1000);
            expect(Number(invoiceResult.rows[0].amount_due)).toBe(0);
            expect(invoiceResult.rows[0].status).toBe('paid');

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('payments appear on subsequent invoice fetch', async () => {
            const inv = await createInvoice(dbHelper, userA);

            await request(app)
                .post(`/api/invoices/${inv.id}/record-payment`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ amount: 250, payment_method: 'check' });

            const paymentsResult = await dbHelper.pool.query(
                `SELECT amount, payment_method
                 FROM payments
                 WHERE invoice_id = $1 AND organization_id = $2`,
                [inv.id, userA.org.id]
            );

            expect(paymentsResult.rows).toHaveLength(1);
            expect(Number(paymentsResult.rows[0].amount)).toBe(250);
            expect(paymentsResult.rows[0].payment_method).toBe('check');

            await cleanupInvoice(dbHelper, inv.id);
        });
    });

    // ── Send invoice action ───────────────────────────────────────────────────

    describe('POST /api/invoices/:id/send', () => {
        it('marks a draft invoice as sent when customer_email is set', async () => {
            const inv = await createInvoice(dbHelper, userA, {
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
            const inv = await createInvoice(dbHelper, userA, {
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
            const inv = await createInvoice(dbHelper, userA, { customer_email: 'x@y.com' });

            const res = await request(app)
                .post(`/api/invoices/${inv.id}/send`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({});

            expect(res.status).toBe(404);

            await cleanupInvoice(dbHelper, inv.id);
        });

        it('allows resending an already-sent invoice', async () => {
            const inv = await createInvoice(dbHelper, userA, { customer_email: 'resend@example.com' });

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
            const inv = await createInvoice(dbHelper, userA, { customer_email: 'paid@example.com' });

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
