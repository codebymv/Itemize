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

describe('Authenticated reputation Express retirement contract', () => {
    let dbHelper;
    let app;
    let user;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        user = await dbHelper.seedUser(
            `reputation-retirement-${Date.now()}@test.itemize`,
            'Reputation Retirement User',
        );
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    test.each([
        ['get', '/api/reputation/platforms'],
        ['post', '/api/reputation/platforms'],
        ['delete', '/api/reputation/platforms/1'],
        ['get', '/api/reputation/reviews'],
        ['post', '/api/reputation/reviews'],
        ['get', '/api/reputation/reviews/1'],
        ['put', '/api/reputation/reviews/1'],
        ['delete', '/api/reputation/reviews/1'],
        ['get', '/api/reputation/requests'],
        ['post', '/api/reputation/requests'],
        ['delete', '/api/reputation/requests/1'],
        ['post', '/api/reputation/requests/1/resend'],
        ['post', '/api/reputation/requests/bulk'],
        ['get', '/api/reputation/widgets'],
        ['post', '/api/reputation/widgets'],
        ['put', '/api/reputation/widgets/1'],
        ['delete', '/api/reputation/widgets/1'],
        ['get', '/api/reputation/widgets/1/embed-code'],
        ['get', '/api/reputation/settings'],
        ['put', '/api/reputation/settings'],
        ['get', '/api/reputation/analytics'],
    ])('%s %s stays retired after full route composition', async (method, path) => {
        const response = request(app)[method](path)
            .set('Cookie', [`itemize_auth=${user.token}`])
            .set('x-organization-id', String(user.org.id));
        if (method === 'post' || method === 'put') response.send({});
        await response.expect(404);
    });
});
