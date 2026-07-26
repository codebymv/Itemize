const express = require('express');
const request = require('supertest');

const createActionsRouter = require('../../routes/campaigns/actions.routes');
const createInsightsRouter = require('../../routes/campaigns/insights.routes');

describe('retired campaign execution HTTP routes', () => {
    const pool = {};
    const pass = (_req, _res, next) => next();
    const app = express();

    beforeAll(() => {
        app.use(express.json());
        app.use('/api/campaigns', createActionsRouter(pool, pass, pass));
        app.use('/api/campaigns', createInsightsRouter(pool, pass, pass));
    });

    test.each([
        '/api/campaigns/12/send',
        '/api/campaigns/12/pause',
        '/api/campaigns/12/resume',
        '/api/campaigns/12/send-test',
    ])('%s is no longer registered', async (path) => {
        const response = await request(app).post(path).send({});

        expect(response.status).toBe(404);
    });
});
