const express = require('express');
const request = require('supertest');
const createInvoicesRoutes = require('../../routes/invoices.routes');

describe('retired invoice settings HTTP routes', () => {
    const authenticateJWT = jest.fn((_req, _res, next) => next());
    const app = express();

    app.use(express.json());
    app.use('/api/invoices', createInvoicesRoutes({}, authenticateJWT));

    beforeEach(() => {
        authenticateJWT.mockClear();
    });

    it.each([
        ['get', '/api/invoices/settings'],
        ['put', '/api/invoices/settings'],
        ['delete', '/api/invoices/settings/logo'],
    ])('returns 404 for retired %s %s', async (method, path) => {
        const response = await request(app)[method](path).send({});
        expect(response.status).toBe(404);
        expect(authenticateJWT).not.toHaveBeenCalled();
    });
});
