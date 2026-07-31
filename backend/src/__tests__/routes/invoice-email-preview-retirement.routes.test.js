const express = require('express');
const request = require('supertest');
const createInvoicesRoutes = require('../../routes/invoices.routes');

describe('retired invoice email-preview HTTP route', () => {
    const authenticateJWT = jest.fn((_req, _res, next) => next());
    const app = express();

    app.use(express.json());
    app.use('/api/invoices', createInvoicesRoutes({}, authenticateJWT));

    beforeEach(() => {
        authenticateJWT.mockClear();
    });

    it('returns 404 before authentication', async () => {
        const response = await request(app)
            .post('/api/invoices/email/preview')
            .send({ message: 'Invoice attached' });

        expect(response.status).toBe(404);
        expect(authenticateJWT).not.toHaveBeenCalled();
    });
});
