const express = require('express');
const request = require('supertest');
const createInvoicesRoutes = require('../../routes/invoices.routes');

describe('retired invoice business-profile HTTP routes', () => {
    const authenticateJWT = jest.fn((_req, _res, next) => next());
    const app = express();

    app.use(express.json());
    app.use('/api/invoices', createInvoicesRoutes({}, authenticateJWT));

    beforeEach(() => {
        authenticateJWT.mockClear();
    });

    it.each([
        ['get', '/api/invoices/businesses'],
        ['post', '/api/invoices/businesses'],
        ['get', '/api/invoices/businesses/1'],
        ['put', '/api/invoices/businesses/1'],
        ['delete', '/api/invoices/businesses/1'],
        ['delete', '/api/invoices/businesses/1/logo'],
    ])('returns 404 for retired %s %s', async (method, path) => {
        const response = await request(app)[method](path).send({});
        expect(response.status).toBe(404);
        expect(authenticateJWT).not.toHaveBeenCalled();
    });
});
