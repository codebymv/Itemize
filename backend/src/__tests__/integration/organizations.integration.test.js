const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const TestDbHelper = require('./test-db-helper');
const registerApiRoutes = require('../../bootstrap/register-api-routes');
const { authenticateJWT, requireAdmin } = require('../../auth');

describe('Retired GraphQL-cutover REST surfaces', () => {
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
        ['get', '/api/organizations'],
        ['post', '/api/organizations'],
        ['get', '/api/organizations/1'],
        ['put', '/api/organizations/1'],
        ['delete', '/api/organizations/1'],
        ['post', '/api/organizations/ensure-default'],
        ['post', '/api/organizations/1/select'],
        ['get', '/api/organizations/1/members'],
        ['post', '/api/organizations/1/members'],
        ['put', '/api/organizations/1/members/1'],
        ['delete', '/api/organizations/1/members/1'],
        ['post', '/api/organizations/1/leave'],
        ['get', '/api/conversations'],
        ['post', '/api/conversations'],
        ['get', '/api/conversations/1'],
        ['patch', '/api/conversations/1'],
        ['post', '/api/conversations/1/assign'],
        ['post', '/api/conversations/1/messages'],
        ['patch', '/api/conversations/1/read'],
        ['get', '/api/forms'],
        ['post', '/api/forms'],
        ['get', '/api/forms/1'],
        ['put', '/api/forms/1'],
        ['delete', '/api/forms/1'],
        ['post', '/api/forms/1/duplicate'],
        ['put', '/api/forms/1/fields'],
        ['get', '/api/forms/1/submissions'],
        ['delete', '/api/forms/1/submissions/1'],
    ])('returns 404 for retired %s %s', async (method, path) => {
        const response = await request(app)[method](path).send({});
        expect(response.status).toBe(404);
    });
});
