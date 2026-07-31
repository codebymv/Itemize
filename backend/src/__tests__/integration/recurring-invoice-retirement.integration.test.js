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

describe('Recurring invoice Express retirement contract', () => {
    let dbHelper;
    let app;
    let user;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        user = await dbHelper.seedUser(
            `recurring-retirement-${Date.now()}@test.itemize`,
            'Recurring Retirement User',
        );
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    test.each([
        ['get', '/api/invoices/recurring'],
        ['post', '/api/invoices/recurring'],
        ['get', '/api/invoices/recurring/1'],
        ['put', '/api/invoices/recurring/1'],
        ['delete', '/api/invoices/recurring/1'],
        ['post', '/api/invoices/recurring/1/generate-now'],
        ['get', '/api/invoices/recurring/1/history'],
        ['post', '/api/invoices/recurring/1/pause'],
        ['post', '/api/invoices/recurring/1/resume'],
        ['post', '/api/invoices/recurring/from-invoice/1'],
        ['get', '/api/invoices/recurring/preview-invoice-number'],
    ])('%s %s stays retired after full route composition', async (method, path) => {
        const response = request(app)[method](path)
            .set('Cookie', [`itemize_auth=${user.token}`])
            .set('x-organization-id', String(user.org.id));
        if (method === 'post' || method === 'put') response.send({});
        await response.expect(404);
    });
});
