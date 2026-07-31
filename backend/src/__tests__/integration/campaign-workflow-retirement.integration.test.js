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
    app.use((req, _res, next) => {
        req.dbPool = pool;
        next();
    });
    app.use('/api/auth', require('../../auth').router);

    const noop = (_req, _res, next) => next();
    registerApiRoutes({
        app,
        pool,
        authenticateJWT,
        requireAdmin,
        publicRateLimit: noop,
        positionLimiter: noop,
        broadcast: {
            listUpdate: jest.fn(),
            noteUpdate: jest.fn(),
            whiteboardUpdate: jest.fn(),
            wireframeUpdate: jest.fn(),
            userListUpdate: jest.fn(),
            userWireframeUpdate: jest.fn(),
            userListDeleted: jest.fn(),
        },
        io: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    return app;
}

describe('Campaign and workflow Express retirement contract', () => {
    let dbHelper;
    let app;
    let user;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        user = await dbHelper.seedUser(
            `campaign-workflow-retirement-${Date.now()}@test.itemize`,
            'Campaign Workflow Retirement User',
        );
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    test.each([
        ['get', '/api/campaigns'],
        ['post', '/api/campaigns'],
        ['get', '/api/campaigns/1'],
        ['put', '/api/campaigns/1'],
        ['delete', '/api/campaigns/1'],
        ['post', '/api/campaigns/1/duplicate'],
        ['get', '/api/campaigns/1/preview'],
        ['get', '/api/campaigns/1/recipients'],
        ['post', '/api/campaigns/1/schedule'],
        ['post', '/api/campaigns/1/unschedule'],
        ['post', '/api/campaigns/1/send'],
        ['post', '/api/campaigns/1/pause'],
        ['post', '/api/campaigns/1/resume'],
        ['post', '/api/campaigns/1/send-test'],
        ['get', '/api/workflows'],
        ['post', '/api/workflows'],
        ['get', '/api/workflows/1'],
        ['put', '/api/workflows/1'],
        ['delete', '/api/workflows/1'],
        ['post', '/api/workflows/1/activate'],
        ['post', '/api/workflows/1/deactivate'],
        ['post', '/api/workflows/1/duplicate'],
        ['post', '/api/workflows/1/enroll'],
        ['get', '/api/workflows/1/enrollments'],
        ['delete', '/api/workflows/1/enrollments/1'],
        ['post', '/api/workflows/1/enrollments/1/pause'],
        ['post', '/api/workflows/1/enrollments/1/resume'],
        ['post', '/api/workflows/1/enrollments/1/retry'],
        ['get', '/api/workflows/1/execution-summary'],
        ['get', '/api/workflows/1/side-effects'],
        ['post', '/api/workflows/1/side-effects/1/retry'],
        ['post', '/api/workflows/1/side-effects/1/reconcile'],
    ])('%s %s stays retired after full route composition', async (method, path) => {
        const response = request(app)[method](path)
            .set('Cookie', [`itemize_auth=${user.token}`])
            .set('x-organization-id', String(user.org.id));
        if (method === 'post' || method === 'put') response.send({});
        await response.expect(404);
    });
});
