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

describe('Lists Integration Tests', () => {
    let dbHelper;
    let app;
    let userA, userB;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);

        [userA, userB] = await Promise.all([
            dbHelper.seedUser(`list-a-${Date.now()}@test.itemize`, 'List User A'),
            dbHelper.seedUser(`list-b-${Date.now()}@test.itemize`, 'List User B'),
        ]);
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    describe('CRUD & user-scope isolation', () => {
        let listIdA;
        const testItems = [
            { id: 'item1', text: 'Buy Milk', completed: false },
            { id: 'item2', text: 'Review Code', completed: true },
        ];

        it('allows User A to create a list', async () => {
            const res = await request(app)
                .post('/api/lists')
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({
                    title: 'Tasks',
                    category: 'Personal',
                    items: testItems,
                    position_x: 100,
                    position_y: 200,
                });

            expect(res.status).toBe(201);
            expect(res.body.title).toBe('Tasks');
            expect(res.body.items.length).toBe(2);
            expect(Number(res.body.position_x)).toBe(100);
            expect(res.body.user_id).toBe(userA.user.id);
            listIdA = res.body.id;
        });

        it('allows User A to get their lists', async () => {
            const res = await request(app)
                .get('/api/lists')
                .set('Cookie', [`itemize_auth=${userA.token}`]);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.lists)).toBe(true);
            expect(res.body.lists.some(l => l.title === 'Tasks')).toBe(true);
        });

        it('User B sees only their own lists (not User A\'s)', async () => {
            const res = await request(app)
                .get('/api/lists')
                .set('Cookie', [`itemize_auth=${userB.token}`]);

            expect(res.status).toBe(200);
            // Every list in the response must belong to User B
            expect(res.body.lists.every(l => l.user_id === userB.user.id)).toBe(true);
        });

        it('allows User A to update list position', async () => {
            const res = await request(app)
                .put(`/api/lists/${listIdA}/position`)
                .set('Cookie', [`itemize_auth=${userA.token}`])
                .send({ x: 150, y: 250 });

            expect(res.status).toBe(200);
            expect(Number(res.body.position_x)).toBe(150);
            expect(Number(res.body.position_y)).toBe(250);
        });

        it('prevents User B from updating User A\'s list position', async () => {
            const res = await request(app)
                .put(`/api/lists/${listIdA}/position`)
                .set('Cookie', [`itemize_auth=${userB.token}`])
                .send({ x: 999, y: 999 });

            expect(res.status).toBe(404);
        });

        it('allows User A to toggle an item', async () => {
            const res = await request(app)
                .put(`/api/lists/${listIdA}/items/item1/toggle`)
                .set('Cookie', [`itemize_auth=${userA.token}`]);

            expect(res.status).toBe(200);
            // item1 started as completed:false → should now be true
            const toggled = res.body.items.find(i => i.id === 'item1');
            expect(toggled.completed).toBe(true);
        });

        it('prevents User B from toggling User A\'s list items', async () => {
            const res = await request(app)
                .put(`/api/lists/${listIdA}/items/item1/toggle`)
                .set('Cookie', [`itemize_auth=${userB.token}`]);

            expect(res.status).toBe(404);
        });

        it('prevents User B from deleting User A\'s list', async () => {
            const res = await request(app)
                .delete(`/api/lists/${listIdA}`)
                .set('Cookie', [`itemize_auth=${userB.token}`]);

            expect(res.status).toBe(404);
        });

        it('allows User A to delete their list', async () => {
            const res = await request(app)
                .delete(`/api/lists/${listIdA}`)
                .set('Cookie', [`itemize_auth=${userA.token}`]);

            expect(res.status).toBe(200);
            expect(res.body.message).toBe('List deleted successfully');
        });
    });
});
