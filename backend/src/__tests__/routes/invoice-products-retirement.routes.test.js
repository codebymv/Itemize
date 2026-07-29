const express = require('express');
const request = require('supertest');
const createInvoicesRoutes = require('../../routes/invoices.routes');

describe('retired invoice product HTTP routes', () => {
    const authenticateJWT = jest.fn((_req, _res, next) => next());
    const pool = {};
    const app = express();

    app.use(express.json());
    app.use('/api/invoices', createInvoicesRoutes(pool, authenticateJWT));

    beforeEach(() => {
        authenticateJWT.mockClear();
    });

    it.each([
        ['get', '/api/invoices/products'],
        ['post', '/api/invoices/products'],
        ['put', '/api/invoices/products/1'],
        ['delete', '/api/invoices/products/1'],
    ])('returns 404 for retired %s %s', async (method, path) => {
        const response = await request(app)[method](path).send({});
        expect(response.status).toBe(404);
        expect(authenticateJWT).not.toHaveBeenCalled();
    });
});
