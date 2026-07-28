const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');

describe('Retired category and workspace-content REST surfaces', () => {
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
        ['get', '/api/lists'],
        ['post', '/api/lists'],
        ['put', '/api/lists/1'],
        ['delete', '/api/lists/1'],
        ['get', '/api/canvas/lists'],
        ['get', '/api/notes'],
        ['post', '/api/notes'],
        ['put', '/api/notes/1'],
        ['delete', '/api/notes/1'],
        ['put', '/api/notes/1/content'],
        ['put', '/api/notes/1/title'],
        ['put', '/api/notes/1/category'],
        ['get', '/api/whiteboards'],
        ['post', '/api/whiteboards'],
        ['put', '/api/whiteboards/1'],
        ['delete', '/api/whiteboards/1'],
        ['get', '/api/categories'],
        ['post', '/api/categories'],
        ['put', '/api/categories/1'],
        ['delete', '/api/categories/1'],
    ])('returns 404 for retired %s %s', async (method, path) => {
        const response = await request(app)[method](path).send({});
        expect(response.status).toBe(404);
    });
});
