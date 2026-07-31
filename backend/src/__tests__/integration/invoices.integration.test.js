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

describe('Core invoice Express retirement contract', () => {
    let dbHelper;
    let app;
    let user;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        user = await dbHelper.seedUser(
            `invoice-retirement-${Date.now()}@test.itemize`,
            'Invoice Retirement User'
        );
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    test.each([
        ['get', '/api/invoices'],
        ['post', '/api/invoices'],
        ['get', '/api/invoices/1'],
        ['put', '/api/invoices/1'],
        ['delete', '/api/invoices/1'],
        ['post', '/api/invoices/1/send'],
        ['post', '/api/invoices/1/create-payment-link'],
        ['post', '/api/invoices/1/record-payment'],
    ])('%s %s stays retired after full route composition', async (method, path) => {
        const response = request(app)[method](path)
            .set('Cookie', [`itemize_auth=${user.token}`])
            .set('x-organization-id', String(user.org.id));

        if (method === 'post' || method === 'put') {
            response.send({});
        }

        await response.expect(404);
    });
});
