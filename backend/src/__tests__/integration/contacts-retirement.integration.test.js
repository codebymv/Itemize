const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');

describe('Retired contact REST surfaces', () => {
    let dbHelper;
    let app;

    beforeAll(async () => {
        dbHelper = new TestDbHelper();
        await dbHelper.setup();
        app = express();
        app.use(cookieParser());
        app.use(express.json());
        app.use((req, _res, next) => {
            req.dbPool = dbHelper.pool;
            next();
        });

        const noop = (_req, _res, next) => next();
        registerApiRoutes({
            app,
            pool: dbHelper.pool,
            authenticateJWT,
            requireAdmin,
            publicRateLimit: noop,
            positionLimiter: noop,
            broadcast: {},
            io: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
            port: 3001,
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            },
        });
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    it.each([
        ['get', '/api/contacts'],
        ['get', '/api/contacts/1'],
        ['post', '/api/contacts'],
        ['put', '/api/contacts/1'],
        ['delete', '/api/contacts/1'],
        ['post', '/api/contacts/bulk-update'],
        ['post', '/api/contacts/bulk-delete'],
        ['get', '/api/contacts/1/activities'],
        ['post', '/api/contacts/1/activities'],
        ['get', '/api/contacts/1/content'],
    ])('returns 404 for retired %s %s', async (method, path) => {
        const response = await request(app)[method](path).send({});
        expect(response.status).toBe(404);
    });
});
