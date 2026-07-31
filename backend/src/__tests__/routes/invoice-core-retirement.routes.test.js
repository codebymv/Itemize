const express = require('express');
const request = require('supertest');
const createInvoicesRoutes = require('../../routes/invoices.routes');

describe('retired invoice state and JSON-action HTTP routes', () => {
    const authenticateJWT = jest.fn((_req, res) => res.status(401).end());
    const app = express();

    app.use(express.json());
    app.use('/api/invoices', createInvoicesRoutes({}, authenticateJWT));

    beforeEach(() => {
        authenticateJWT.mockClear();
    });

    it.each([
        ['get', '/api/invoices'],
        ['post', '/api/invoices'],
        ['get', '/api/invoices/1'],
        ['put', '/api/invoices/1'],
        ['delete', '/api/invoices/1'],
        ['post', '/api/invoices/1/send'],
        ['post', '/api/invoices/1/create-payment-link'],
        ['post', '/api/invoices/1/record-payment'],
        ['get', '/api/invoices/payments'],
        ['post', '/api/invoices/payments'],
    ])('returns 404 for retired %s %s', async (method, path) => {
        const response = await request(app)[method](path).send({});
        expect(response.status).toBe(404);
        expect(authenticateJWT).not.toHaveBeenCalled();
    });

    it('preserves the authenticated PDF fallback', async () => {
        const response = await request(app).get('/api/invoices/1/pdf');
        expect(response.status).toBe(401);
        expect(authenticateJWT).toHaveBeenCalledTimes(1);
    });
});
