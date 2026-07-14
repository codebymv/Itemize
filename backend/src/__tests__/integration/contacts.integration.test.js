const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');

/**
 * Build a minimal Express app wired to the provided pool.
 */
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

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Contacts Integration Tests', () => {
    let dbHelper;
    let app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`contact-a-${Date.now()}@test.itemize`, 'Contact User A'),
            dbHelper.seedUser(`contact-b-${Date.now()}@test.itemize`, 'Contact User B'),
        ]);
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    describe('CRUD & multi-tenant isolation', () => {
        let contactIdA;

        it('allows User A to create a contact in Org A', async () => {
            const res = await request(app)
                .post('/api/contacts')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id))
                .send({ first_name: 'John', last_name: 'Doe', email: 'johndoe@example.com', company: 'Acme' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.first_name).toBe('John');
            expect(res.body.data.organization_id).toBe(userA.org.id);
            contactIdA = res.body.data.id;
        });

        it('allows User A to list contacts in Org A', async () => {
            const res = await request(app)
                .get('/api/contacts')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const contact = res.body.data.find(c => c.first_name === 'John');
            expect(contact).toBeTruthy();
        });

        it('prevents User B from reading Org A contact by ID', async () => {
            const res = await request(app)
                .get(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect([403, 404]).toContain(res.status);
        });

        it('prevents User B from updating Org A contact', async () => {
            const res = await request(app)
                .put(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id))
                .send({ first_name: 'Hacked' });

            expect([403, 404]).toContain(res.status);
        });

        it('prevents User B from deleting Org A contact', async () => {
            const res = await request(app)
                .delete(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .set('x-organization-id', String(userB.org.id));

            expect([403, 404]).toContain(res.status);
        });

        it('allows User A to delete their own contact', async () => {
            const res = await request(app)
                .delete(`/api/contacts/${contactIdA}`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .set('x-organization-id', String(userA.org.id));

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('Subscription plan gating', () => {
        it('enforces contact limit per org plan', async () => {
            const limitUser = await dbHelper.seedUser(
                `contact-limit-${Date.now()}@test.itemize`, 'Limit User'
            );

            // Cap the org at 1 contact
            await dbHelper.pool.query(
                'UPDATE organizations SET contacts_limit = 1 WHERE id = $1',
                [limitUser.org.id]
            );

            const r1 = await request(app)
                .post('/api/contacts')
                .set('Cookie', [`itemize_auth=${limitUser.token}`])
                .set('x-organization-id', String(limitUser.org.id))
                .send({ first_name: 'First', email: `first-${Date.now()}@example.com` });
            expect(r1.status).toBe(201);

            const r2 = await request(app)
                .post('/api/contacts')
                .set('Cookie', [`itemize_auth=${limitUser.token}`])
                .set('x-organization-id', String(limitUser.org.id))
                .send({ first_name: 'Second', email: `second-${Date.now()}@example.com` });
            expect(r2.status).toBe(403);
            expect(JSON.stringify(r2.body)).toMatch(/limit/i);
        });
    });
});
