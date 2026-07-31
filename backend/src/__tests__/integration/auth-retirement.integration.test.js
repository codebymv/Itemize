const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');
const { csrfProtection } = require('../../middleware/csrf');

function createApp(pool) {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use((req, _res, next) => {
        req.dbPool = pool;
        next();
    });
    app.use('/api', csrfProtection);

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

describe('Authentication Express retirement contract', () => {
    let dbHelper;
    let app;
    let user;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = createApp(dbHelper.pool);
        user = await dbHelper.seedUser(
            `auth-retirement-${Date.now()}@test.itemize`,
            'Auth Retirement User',
        );
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    test.each([
        ['get', '/api/auth/csrf'],
        ['post', '/api/auth/forgot-password'],
        ['post', '/api/auth/google-login'],
        ['post', '/api/auth/login'],
        ['post', '/api/auth/logout'],
        ['get', '/api/auth/me'],
        ['put', '/api/auth/me'],
        ['post', '/api/auth/refresh'],
        ['post', '/api/auth/register'],
        ['post', '/api/auth/resend-verification'],
        ['post', '/api/auth/reset-password'],
        ['post', '/api/auth/verify-email'],
        ['post', '/api/auth/change-password'],
        ['post', '/api/auth/google-credential'],
    ])('%s %s stays retired after full route composition', async (method, path) => {
        const csrf = 'auth-retirement-csrf';
        const response = request(app)[method](path)
            .set('Cookie', [
                `itemize_auth=${user.token}`,
                `csrf-token=${csrf}`,
            ])
            .set('x-csrf-token', csrf);
        if (method !== 'get') response.send({});
        await response.expect(404);
    });
});
