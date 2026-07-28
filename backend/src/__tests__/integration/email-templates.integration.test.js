const cookieParser = require('cookie-parser');
const express = require('express');
const request = require('supertest');

const { authenticateJWT, requireAdmin } = require('../../auth');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const TestDbHelper = require('./test-db-helper');

function createApp(pool) {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use((req, _res, next) => { req.dbPool = pool; next(); });
    app.use('/api/auth', require('../../auth').router);

    const noop = (_req, _res, next) => next();
    const mockBroadcast = {
        listUpdate: jest.fn(),
        noteUpdate: jest.fn(),
        whiteboardUpdate: jest.fn(),
        wireframeUpdate: jest.fn(),
        userListUpdate: jest.fn(),
        userWireframeUpdate: jest.fn(),
        userListDeleted: jest.fn(),
    };
    const mockIo = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

    registerApiRoutes({
        app,
        pool,
        authenticateJWT,
        requireAdmin,
        publicRateLimit: noop,
        positionLimiter: noop,
        broadcast: mockBroadcast,
        io: mockIo,
        port: 3001,
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    return app;
}

describe('Retired email-template REST surfaces', () => {
    let dbHelper;
    let app;
    let user;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        user = await dbHelper.seedUser(
            `email-template-retirement-${Date.now()}@test.itemize`,
            'Email Template Retirement',
        );
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    test.each([
        ['get', '/api/email-templates'],
        ['post', '/api/email-templates'],
        ['get', '/api/email-templates/1'],
        ['put', '/api/email-templates/1'],
        ['delete', '/api/email-templates/1'],
        ['post', '/api/email-templates/1/duplicate'],
        ['get', '/api/email-templates/categories/list'],
        ['post', '/api/email-templates/send-to-contact'],
        ['post', '/api/email-templates/1/send-test'],
    ])('%s %s returns 404', async (method, path) => {
        const response = await request(app)[method](path)
            .set('Cookie', [`itemize_auth=${user.token}`])
            .set('x-organization-id', String(user.org.id))
            .send({});

        expect(response.status).toBe(404);
    });
});
