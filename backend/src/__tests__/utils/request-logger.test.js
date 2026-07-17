const express = require('express');
const request = require('supertest');
const correlationIdMiddleware = require('../../middleware/correlation-id');
const { requestLogger } = require('../../utils/logger');

describe('request logger correlation IDs', () => {
    const app = express();
    app.use(correlationIdMiddleware);
    app.use(requestLogger);
    app.get('/probe', (req, res) => res.json({
        requestId: req.requestId,
        correlationId: req.id,
    }));

    it('preserves a safe caller request ID in the request, response, and logger context', async () => {
        const response = await request(app)
            .get('/probe')
            .set('x-request-id', 'browser-request:123')
            .expect(200);

        expect(response.body.requestId).toBe('browser-request:123');
        expect(response.body.correlationId).toBe('browser-request:123');
        expect(response.headers['x-request-id']).toBe('browser-request:123');
        expect(response.headers['x-correlation-id']).toBe('browser-request:123');
    });

    it('uses a safe correlation header when x-request-id is absent', async () => {
        const response = await request(app)
            .get('/probe')
            .set('x-correlation-id', 'external-correlation')
            .expect(200);

        expect(response.body).toEqual({
            requestId: 'external-correlation',
            correlationId: 'external-correlation',
        });
        expect(response.headers['x-request-id']).toBe('external-correlation');
        expect(response.headers['x-correlation-id']).toBe('external-correlation');
    });

    it('replaces an unsafe caller request ID', async () => {
        const response = await request(app)
            .get('/probe')
            .set('x-request-id', 'request id with spaces')
            .expect(200);

        expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(response.headers['x-request-id']).toBe(response.body.requestId);
    });
});
