const express = require('express');
const request = require('supertest');

const createBusinessRoutes = require('../../routes/invoices/businesses.routes');
const createSettingsRoutes = require('../../routes/invoices/settings.routes');

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
    app.use('/api/invoices', createSettingsRoutes({
        pool, authenticateJWT: pass, requireOrganization: pass,
    }));
    return { app, client, pool };
}

describe('invoice logo route boundary', () => {
    it('does not let business JSON choose a storage URL', async () => {
        const { app, client } = createHarness();
        const response = await request(app).post('/api/invoices/businesses').send({
            name: 'Safe business',
            logo_url: 'http://169.254.169.254/latest/meta-data',
        });

        expect(response.status).toBe(201);
        const [sql, params] = client.query.mock.calls[0];
        const insertColumns = sql.match(/INSERT INTO businesses\s*\(([^)]*)\)/i)?.[1];
        expect(insertColumns).not.toContain('logo_url');
        expect(params).not.toContain('http://169.254.169.254/latest/meta-data');
    });

    it('does not let settings JSON replace the managed logo URL', async () => {
        const { app, client } = createHarness();
        const response = await request(app).put('/api/invoices/settings').send({
            business_name: 'Safe settings',
            logo_url: '/uploads/logos/../../secrets.env',
        });

        expect(response.status).toBe(200);
        const [sql, params] = client.query.mock.calls[0];
        const insertColumns = sql.match(/INSERT INTO payment_settings\s*\(([^)]*)\)/i)?.[1];
        expect(insertColumns).not.toContain('logo_url');
        expect(sql).not.toMatch(/logo_url\s*=\s*EXCLUDED\.logo_url/i);
        expect(params).not.toContain('/uploads/logos/../../secrets.env');
    });

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
