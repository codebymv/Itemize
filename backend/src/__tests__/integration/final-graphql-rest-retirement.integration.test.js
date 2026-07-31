const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');

describe('Final authenticated GraphQL-owned REST retirement', () => {
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
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        });
    }, 30000);

    afterAll(async () => {
        await dbHelper.teardown();
    }, 30000);

    it.each([
        ['put', '/api/canvas/positions'],
        ['post', '/api/lists/1/share'],
        ['delete', '/api/lists/1/share'],
        ['post', '/api/notes/1/share'],
        ['delete', '/api/notes/1/share'],
        ['post', '/api/whiteboards/1/share'],
        ['delete', '/api/whiteboards/1/share'],
        ['get', '/api/wireframes'],
        ['post', '/api/wireframes'],
        ['put', '/api/wireframes/1'],
        ['delete', '/api/wireframes/1'],
        ['put', '/api/wireframes/1/position'],
        ['post', '/api/wireframes/1/share'],
        ['delete', '/api/wireframes/1/share'],
        ['put', '/api/vaults/1/position'],
        ['get', '/api/pages'],
        ['post', '/api/pages'],
        ['get', '/api/pages/1'],
        ['put', '/api/pages/1'],
        ['delete', '/api/pages/1'],
        ['get', '/api/pages/1/analytics'],
        ['post', '/api/pages/1/duplicate'],
        ['post', '/api/pages/1/password'],
        ['delete', '/api/pages/1/password'],
        ['put', '/api/pages/1/sections'],
        ['post', '/api/pages/1/sections'],
        ['put', '/api/pages/1/sections/1'],
        ['delete', '/api/pages/1/sections/1'],
        ['post', '/api/pages/1/sections/reorder'],
        ['get', '/api/pages/1/versions'],
        ['post', '/api/pages/1/versions'],
        ['get', '/api/pages/1/versions/1'],
        ['delete', '/api/pages/1/versions/1'],
        ['post', '/api/pages/1/versions/1/publish'],
        ['post', '/api/pages/1/versions/1/restore'],
    ])('returns 404 for retired %s %s', async (method, path) => {
        const response = await request(app)[method](path).send({});
        expect(response.status).toBe(404);
    });
});
