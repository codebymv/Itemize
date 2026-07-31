const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/organization', () => () => ({
    requireOrganization: (_req, _res, next) => next(),
}));

const createEstimateRoutes = require('../../routes/estimate-actions.routes');

describe('estimate action route boundary', () => {
    const authenticateJWT = jest.fn((_req, res) => res.status(401).end());
    const app = express();

    app.use(express.json());
    app.use(
        '/api/invoices/estimates',
        createEstimateRoutes({}, authenticateJWT),
    );

    beforeEach(() => {
        authenticateJWT.mockClear();
    });

    test.each([
        ['get', '/api/invoices/estimates'],
        ['post', '/api/invoices/estimates'],
        ['get', '/api/invoices/estimates/1'],
        ['put', '/api/invoices/estimates/1'],
        ['delete', '/api/invoices/estimates/1'],
        ['post', '/api/invoices/estimates/1/convert-to-invoice'],
    ])('returns 404 for retired %s %s', async (method, path) => {
        const response = await request(app)[method](path).send({});
        expect(response.status).toBe(404);
        expect(authenticateJWT).not.toHaveBeenCalled();
    });

    test('keeps estimate sending behind authentication', async () => {
        const response = await request(app)
            .post('/api/invoices/estimates/1/send')
            .send({});
        expect(response.status).toBe(401);
        expect(authenticateJWT).toHaveBeenCalledTimes(1);
    });
});
