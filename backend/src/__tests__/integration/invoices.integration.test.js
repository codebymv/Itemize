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

    const { router: authRouter } = require('../../auth');
    app.use('/api/auth', authRouter);

    const noop = (_req, _res, next) => next();
    const mockBroadcast = {
        listUpdate: jest.fn(), noteUpdate: jest.fn(),
        whiteboardUpdate: jest.fn(), wireframeUpdate: jest.fn(),
        userListUpdate: jest.fn(), userWireframeUpdate: jest.fn(),
        userListDeleted: jest.fn(),
    };
    const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

    registerApiRoutes({
        app, pool,
        authenticateJWT, requireAdmin,
        publicRateLimit: noop, positionLimiter: noop,
        broadcast: mockBroadcast, io: mockIo,
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return app;
}

/** Minimal valid invoice payload */
function invoicePayload(overrides = {}) {
    return {
        customer_name: 'ACME Corp',
        customer_email: 'billing@acme.com',
        items: [
            { name: 'Consulting', quantity: 2, unit_price: 100 },
        ],
        ...overrides,
    };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Invoices Integration Tests', () => {
    let dbHelper;
    let app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`inv-a-${Date.now()}@test.itemize`, 'Invoice User A'),
            dbHelper.seedUser(`inv-b-${Date.now()}@test.itemize`, 'Invoice User B'),
        ]);
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    // ── CRUD ──────────────────────────────────────────────────────────────────

    describe('CRUD & multi-tenant isolation', () => {
        let invoiceId;

        it('creates an invoice for User A org', async () => {
            const res = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload());

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            const inv = res.body.data;
            expect(inv.customer_name).toBe('ACME Corp');
            expect(inv.organization_id).toBe(userA.org.id);
            // Auto-generated invoice number
            expect(typeof inv.invoice_number).toBe('string');
            expect(inv.invoice_number.length).toBeGreaterThan(0);
            // Line items included
            expect(Array.isArray(inv.items)).toBe(true);
            expect(inv.items).toHaveLength(1);
            expect(inv.items[0].name).toBe('Consulting');
            // Totals calculated correctly: 2 × 100 = 200
            expect(Number(inv.subtotal)).toBe(200);
            expect(Number(inv.total)).toBe(200);

            invoiceId = inv.id;
        });

        it('rejects invoice creation without line items', async () => {
            const res = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ customer_name: 'No Items' });

            expect(res.status).toBe(400);
        });

        it('rejects invoice creation with empty items array', async () => {
            const res = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload({ items: [] }));

            expect(res.status).toBe(400);
        });

        it('lists invoices for User A org', async () => {
            const res = await request(app)
                .get('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data.some(i => i.id === invoiceId)).toBe(true);
        });

        it('User B org cannot see User A invoices in list', async () => {
            const res = await request(app)
                .get('/api/invoices')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.every(i => i.organization_id === userB.org.id)).toBe(true);
            expect(res.body.data.some(i => i.id === invoiceId)).toBe(false);
        });

        it('fetches a single invoice by ID with items and payments', async () => {
            const res = await request(app)
                .get(`/api/invoices/${invoiceId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            const inv = res.body.data;
            expect(inv.id).toBe(invoiceId);
            expect(Array.isArray(inv.items)).toBe(true);
            expect(Array.isArray(inv.payments)).toBe(true);
        });

        it('User B cannot fetch User A invoice by ID', async () => {
            const res = await request(app)
                .get(`/api/invoices/${invoiceId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('updates the invoice customer name and recalculates with new items', async () => {
            const res = await request(app)
                .put(`/api/invoices/${invoiceId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    customer_name: 'Updated Corp',
                    items: [
                        { name: 'Design Work', quantity: 5, unit_price: 50 },
                    ],
                });

            expect(res.status).toBe(200);
            const inv = res.body.data;
            expect(inv.customer_name).toBe('Updated Corp');
            // 5 × 50 = 250
            expect(Number(inv.subtotal)).toBe(250);
            expect(Number(inv.total)).toBe(250);
            expect(inv.items[0].name).toBe('Design Work');
        });

        it('User B cannot update User A invoice', async () => {
            const res = await request(app)
                .put(`/api/invoices/${invoiceId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ customer_name: 'Hacked' });

            expect([404]).toContain(res.status);
        });

        it('deletes User A invoice', async () => {
            const res = await request(app)
                .delete(`/api/invoices/${invoiceId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('returns 404 on second delete attempt', async () => {
            const res = await request(app)
                .delete(`/api/invoices/${invoiceId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });

        it('User B cannot delete User A invoice', async () => {
            // Create a fresh invoice for this check
            const createRes = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload());

            const freshId = createRes.body.data.id;

            const delRes = await request(app)
                .delete(`/api/invoices/${freshId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(delRes.status).toBe(404);

            // Cleanup
            await request(app)
                .delete(`/api/invoices/${freshId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });
    });

    // ── Tax & discount calculations ───────────────────────────────────────────

    describe('Tax and discount calculations', () => {
        it('applies percentage discount correctly', async () => {
            const res = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload({
                    // 2 × 100 = 200 subtotal, 10% discount = 20, total = 180
                    discount_type: 'percent',
                    discount_value: 10,
                }));

            expect(res.status).toBe(201);
            const inv = res.body.data;
            expect(Number(inv.subtotal)).toBe(200);
            expect(Number(inv.discount_amount)).toBeCloseTo(20, 1);
            expect(Number(inv.total)).toBeCloseTo(180, 1);

            // Cleanup
            await request(app)
                .delete(`/api/invoices/${inv.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });

        it('applies fixed discount correctly', async () => {
            const res = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload({
                    // subtotal 200, fixed discount 25, total 175
                    discount_type: 'fixed',
                    discount_value: 25,
                }));

            expect(res.status).toBe(201);
            const inv = res.body.data;
            expect(Number(inv.discount_amount)).toBeCloseTo(25, 1);
            expect(Number(inv.total)).toBeCloseTo(175, 1);

            // Cleanup
            await request(app)
                .delete(`/api/invoices/${inv.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });

        it('applies invoice-level tax rate correctly', async () => {
            const res = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload({
                    // subtotal 200, 10% tax = 20, total 220
                    tax_rate: 10,
                }));

            expect(res.status).toBe(201);
            const inv = res.body.data;
            expect(Number(inv.tax_amount)).toBeCloseTo(20, 1);
            expect(Number(inv.total)).toBeCloseTo(220, 1);

            // Cleanup
            await request(app)
                .delete(`/api/invoices/${inv.id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));
        });
    });

    // ── Invoice number sequencing ─────────────────────────────────────────────

    describe('Invoice number auto-increment', () => {
        it('generates sequential invoice numbers for the same org', async () => {
            const r1 = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload());

            const r2 = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload());

            expect(r1.status).toBe(201);
            expect(r2.status).toBe(201);

            const num1 = parseInt(r1.body.data.invoice_number.replace(/\D/g, ''));
            const num2 = parseInt(r2.body.data.invoice_number.replace(/\D/g, ''));
            expect(num2).toBe(num1 + 1);

            // Cleanup
            await Promise.all([r1.body.data.id, r2.body.data.id].map(id =>
                request(app)
                    .delete(`/api/invoices/${id}`)
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .set('x-organization-id', String(userA.org.id))
            ));
        });

        it('allocates distinct invoice numbers for concurrent creates', async () => {
            const createInvoice = () => request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload());

            const [r1, r2] = await Promise.all([createInvoice(), createInvoice()]);

            expect(r1.status).toBe(201);
            expect(r2.status).toBe(201);
            expect(r1.body.data.invoice_number).not.toBe(r2.body.data.invoice_number);

            await Promise.all([r1.body.data.id, r2.body.data.id].map(id =>
                request(app)
                    .delete(`/api/invoices/${id}`)
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .set('x-organization-id', String(userA.org.id))
            ));
        });
    });

    // ── Update restrictions ───────────────────────────────────────────────────

    describe('Update blocked on non-editable statuses', () => {
        it('cannot update a paid invoice', async () => {
            // Create and then force status to 'paid' directly in DB
            const createRes = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload());

            const paidId = createRes.body.data.id;

            await dbHelper.pool.query(
                "UPDATE invoices SET status = 'paid' WHERE id = $1",
                [paidId]
            );

            const updateRes = await request(app)
                .put(`/api/invoices/${paidId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ customer_name: 'Should Fail' });

            expect(updateRes.status).toBe(400);

            // Cleanup
            await dbHelper.pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [paidId]);
            await dbHelper.pool.query('DELETE FROM invoices WHERE id = $1', [paidId]);
        });
    });

    // ── Status filter ─────────────────────────────────────────────────────────

    describe('Invoice list filtering', () => {
        let draftId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/invoices')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(invoicePayload({ customer_name: 'Filter Test' }));
            draftId = res.body.data.id;
        });

        afterAll(async () => {
            if (draftId) {
                await dbHelper.pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [draftId]);
                await dbHelper.pool.query('DELETE FROM invoices WHERE id = $1', [draftId]);
            }
        });

        it('filters invoices by status=draft', async () => {
            const res = await request(app)
                .get('/api/invoices?status=draft')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.every(i => i.status === 'draft')).toBe(true);
            expect(res.body.data.some(i => i.id === draftId)).toBe(true);
        });

        it('filters by customer name search', async () => {
            const res = await request(app)
                .get('/api/invoices?search=Filter+Test')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.some(i => i.customer_name === 'Filter Test')).toBe(true);
        });
    });

    // ── Auth guard ────────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated invoice list', async () => {
            const res = await request(app)
                .get('/api/invoices')
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(401);
        });
    });
});
