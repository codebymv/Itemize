const express = require('express');
const request = require('supertest');

const createBusinessRoutes = require('../../routes/invoices/businesses.routes');

const pass = (_req, _res, next) => next();

function createHarness() {
    const client = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 4, logo_url: null }] }),
        release: jest.fn(),
    };
    const pool = { connect: jest.fn().mockResolvedValue(client) };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.organizationId = 7;
        req.user = { id: 3 };
        next();
    });
    app.use('/api/invoices', createBusinessRoutes({
        pool, authenticateJWT: pass, requireOrganization: pass,
    }));
    return { app, client, pool };
}

describe('invoice logo route boundary', () => {
    it('rejects a MIME-spoofed logo before opening a database connection', async () => {
        const { app, pool } = createHarness();
        const response = await request(app)
            .post('/api/invoices/businesses/4/logo')
            .attach('logo', Buffer.from('<svg onload="alert(1)"></svg>'), {
                filename: 'brand.png',
                contentType: 'image/png',
            });

        expect(response.status).toBe(400);
        expect(pool.connect).not.toHaveBeenCalled();
    });
});
