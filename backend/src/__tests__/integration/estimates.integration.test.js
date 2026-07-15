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

function estimatePayload(overrides = {}) {
    return {
        customer_name: 'Prospect Corp',
        customer_email: 'prospect@example.com',
        items: [
            { name: 'Discovery Call', quantity: 1, unit_price: 500 },
            { name: 'Design Sprint', quantity: 3, unit_price: 200 },
        ],
        ...overrides,
    };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('Estimates Integration Tests', () => {
    let dbHelper, app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`est-a-${Date.now()}@test.itemize`, 'Estimate User A'),
            dbHelper.seedUser(`est-b-${Date.now()}@test.itemize`, 'Estimate User B'),
        ]);
    }, 30000);

    afterAll(async () => { await dbHelper.teardown(); }, 30000);

    // ── CRUD & multi-tenant isolation ─────────────────────────────────────────

    describe('Estimate CRUD', () => {
        let estimateId;

        it('creates an estimate with line items and calculates totals', async () => {
            const res = await request(app)
                .post('/api/invoices/estimates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(estimatePayload());

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            const est = res.body.data;
            expect(est.customer_name).toBe('Prospect Corp');
            expect(est.organization_id).toBe(userA.org.id);
            expect(est.status).toBe('draft');
            // 1×500 + 3×200 = 1100
            expect(Number(est.subtotal)).toBe(1100);
            expect(Number(est.total)).toBe(1100);
            // Auto-generated estimate number
            expect(typeof est.estimate_number).toBe('string');
            expect(est.estimate_number).toMatch(/^EST-/);
            // Line items returned
            expect(Array.isArray(est.items)).toBe(true);
            expect(est.items).toHaveLength(2);
            // valid_until defaults to 30 days out
            expect(est.valid_until).toBeTruthy();
            estimateId = est.id;
        });

        it('rejects creation without line items', async () => {
            const res = await request(app)
                .post('/api/invoices/estimates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ customer_name: 'No Items' });

            expect(res.status).toBe(400);
        });

        it('rejects creation with empty items array', async () => {
            const res = await request(app)
                .post('/api/invoices/estimates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(estimatePayload({ items: [] }));

            expect(res.status).toBe(400);
        });

        it('lists estimates for User A org', async () => {
            const res = await request(app)
                .get('/api/invoices/estimates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data.estimates)).toBe(true);
            expect(res.body.data.estimates.some(e => e.id === estimateId)).toBe(true);
        });

        it('User B org cannot see User A estimates', async () => {
            const res = await request(app)
                .get('/api/invoices/estimates')
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.estimates.every(e => e.organization_id === userB.org.id)).toBe(true);
            expect(res.body.data.estimates.some(e => e.id === estimateId)).toBe(false);
        });

        it('fetches a single estimate with items', async () => {
            const res = await request(app)
                .get(`/api/invoices/estimates/${estimateId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            const est = res.body.data;
            expect(est.id).toBe(estimateId);
            expect(Array.isArray(est.items)).toBe(true);
            expect(est.items).toHaveLength(2);
        });

        it('User B cannot fetch User A estimate', async () => {
            const res = await request(app)
                .get(`/api/invoices/estimates/${estimateId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect(res.status).toBe(404);
        });

        it('updates an estimate and recalculates totals', async () => {
            const res = await request(app)
                .put(`/api/invoices/estimates/${estimateId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({
                    customer_name: 'Updated Corp',
                    items: [{ name: 'Revised Scope', quantity: 10, unit_price: 150 }],
                });

            expect(res.status).toBe(200);
            expect(res.body.data.customer_name).toBe('Updated Corp');
            // 10 × 150 = 1500
            expect(Number(res.body.data.subtotal)).toBe(1500);
            expect(Number(res.body.data.total)).toBe(1500);
            expect(res.body.data.items).toHaveLength(1);
        });

        it('User B cannot update User A estimate', async () => {
            const res = await request(app)
                .put(`/api/invoices/estimates/${estimateId}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ customer_name: 'Hacked' });

            expect([404]).toContain(res.status);
        });

        it('deletes an estimate', async () => {
            const res = await request(app)
                .delete(`/api/invoices/estimates/${estimateId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
        });

        it('returns 404 on second delete attempt', async () => {
            const res = await request(app)
                .delete(`/api/invoices/estimates/${estimateId}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(404);
        });
    });

    // ── Tax and discount calculations ─────────────────────────────────────────

    describe('Tax and discount calculations', () => {
        async function makeEstimate(overrides = {}) {
            const res = await request(app)
                .post('/api/invoices/estimates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(estimatePayload(overrides));
            return res.body.data;
        }

        async function cleanup(id) {
            await dbHelper.pool.query('DELETE FROM estimate_items WHERE estimate_id = $1', [id]);
            await dbHelper.pool.query('DELETE FROM estimates WHERE id = $1', [id]);
        }

        it('applies per-item tax rates', async () => {
            // 1 item: qty=2, price=100, tax=10% → itemTotal=200, itemTax=20
            const est = await makeEstimate({
                items: [{ name: 'Taxed Service', quantity: 2, unit_price: 100, tax_rate: 10 }],
            });
            expect(Number(est.tax_amount)).toBeCloseTo(20, 1);
            expect(Number(est.total)).toBeCloseTo(220, 1);
            await cleanup(est.id);
        });

        it('applies a percentage discount', async () => {
            // subtotal = 1100, 10% discount = 110, total = 990
            const est = await makeEstimate({ discount_type: 'percent', discount_value: 10 });
            expect(Number(est.discount_amount)).toBeCloseTo(110, 1);
            expect(Number(est.total)).toBeCloseTo(990, 1);
            await cleanup(est.id);
        });

        it('applies a fixed discount', async () => {
            // subtotal = 1100, fixed 100 off = 1000
            const est = await makeEstimate({ discount_type: 'fixed', discount_value: 100 });
            expect(Number(est.discount_amount)).toBeCloseTo(100, 1);
            expect(Number(est.total)).toBeCloseTo(1000, 1);
            await cleanup(est.id);
        });

        it('defaults valid_until to 30 days when not provided', async () => {
            const est = await makeEstimate();
            const validUntil = new Date(est.valid_until);
            const diffDays = Math.round((validUntil - Date.now()) / (1000 * 60 * 60 * 24));
            // Should be approximately 30 days from now (allow ±1 for timing)
            expect(diffDays).toBeGreaterThanOrEqual(28);
            expect(diffDays).toBeLessThanOrEqual(31);
            await cleanup(est.id);
        });
    });

    // ── Estimate number sequencing ────────────────────────────────────────────

    describe('Estimate number sequencing', () => {
        it('generates sequential EST- numbers for the same org', async () => {
            const [r1, r2] = await Promise.all([
                request(app)
                    .post('/api/invoices/estimates')
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .set('x-organization-id', String(userA.org.id))
                    .send(estimatePayload()),
                request(app)
                    .post('/api/invoices/estimates')
                    .set('Cookie', [`itemize_auth=${userA.token}`])
                    .set('x-organization-id', String(userA.org.id))
                    .send(estimatePayload()),
            ]);

            const num1 = parseInt(r1.body.data.estimate_number.replace(/\D/g, ''));
            const num2 = parseInt(r2.body.data.estimate_number.replace(/\D/g, ''));
            // Numbers must be unique and both EST- prefixed
            expect(r1.body.data.estimate_number).toMatch(/^EST-/);
            expect(r2.body.data.estimate_number).toMatch(/^EST-/);
            expect(num1).not.toBe(num2);

            // Cleanup
            for (const id of [r1.body.data.id, r2.body.data.id]) {
                await dbHelper.pool.query('DELETE FROM estimate_items WHERE estimate_id = $1', [id]);
                await dbHelper.pool.query('DELETE FROM estimates WHERE id = $1', [id]);
            }
        });
    });

    describe('Estimate conversion concurrency', () => {
        it('creates exactly one invoice when conversion requests race', async () => {
            const createRes = await request(app)
                .post('/api/invoices/estimates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(estimatePayload());
            const estimateId = createRes.body.data.id;

            const convert = () => request(app)
                .post(`/api/invoices/estimates/${estimateId}/convert-to-invoice`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({});

            const responses = await Promise.all([convert(), convert()]);
            expect(responses.map(response => response.status).sort()).toEqual([200, 400]);

            const source = await dbHelper.pool.query(
                'SELECT converted_invoice_id FROM estimates WHERE id = $1 AND organization_id = $2',
                [estimateId, userA.org.id]
            );
            const invoiceId = source.rows[0].converted_invoice_id;
            const invoiceCount = await dbHelper.pool.query(
                'SELECT COUNT(*)::int AS count FROM invoices WHERE id = $1 AND organization_id = $2',
                [invoiceId, userA.org.id]
            );
            expect(invoiceCount.rows[0].count).toBe(1);

            await dbHelper.pool.query('DELETE FROM estimates WHERE id = $1', [estimateId]);
            await dbHelper.pool.query('DELETE FROM invoices WHERE id = $1', [invoiceId]);
        });
    });

    // ── Update blocked on non-editable status ─────────────────────────────────

    describe('Edit restriction on accepted/declined estimates', () => {
        it('cannot update an accepted estimate', async () => {
            const createRes = await request(app)
                .post('/api/invoices/estimates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(estimatePayload());
            const id = createRes.body.data.id;

            await dbHelper.pool.query(
                "UPDATE estimates SET status = 'accepted' WHERE id = $1",
                [id]
            );

            const res = await request(app)
                .put(`/api/invoices/estimates/${id}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ customer_name: 'Should Fail' });

            expect(res.status).toBe(400);

            // Cleanup
            await dbHelper.pool.query('DELETE FROM estimate_items WHERE estimate_id = $1', [id]);
            await dbHelper.pool.query('DELETE FROM estimates WHERE id = $1', [id]);
        });
    });

    // ── Filtering ─────────────────────────────────────────────────────────────

    describe('List filtering', () => {
        let draftId;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/invoices/estimates')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send(estimatePayload({ customer_name: 'Filter Test Co' }));
            draftId = res.body.data.id;
        });

        afterAll(async () => {
            if (draftId) {
                await dbHelper.pool.query('DELETE FROM estimate_items WHERE estimate_id = $1', [draftId]);
                await dbHelper.pool.query('DELETE FROM estimates WHERE id = $1', [draftId]);
            }
        });

        it('filters estimates by status=draft', async () => {
            const res = await request(app)
                .get('/api/invoices/estimates?status=draft')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.estimates.every(e => e.status === 'draft')).toBe(true);
            expect(res.body.data.estimates.some(e => e.id === draftId)).toBe(true);
        });

        it('filters estimates by customer name search', async () => {
            const res = await request(app)
                .get('/api/invoices/estimates?search=Filter+Test')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.estimates.some(e => e.id === draftId)).toBe(true);
        });

        it('returns pagination metadata', async () => {
            const res = await request(app)
                .get('/api/invoices/estimates?page=1&limit=5')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.data.pagination).toBeTruthy();
            expect(res.body.data.pagination.page).toBe(1);
            expect(res.body.data.pagination.limit).toBe(5);
        });
    });

    // ── Auth guard ────────────────────────────────────────────────────────────

    describe('Authentication guard', () => {
        it('returns 401 on unauthenticated list', async () => {
            const res = await request(app).get('/api/invoices/estimates');
            expect(res.status).toBe(401);
        });
    });
});
