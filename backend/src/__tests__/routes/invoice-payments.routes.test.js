const express = require('express');
const request = require('supertest');
const createPaymentsRoutes = require('../../routes/invoices/payments.routes');

const pass = (_req, _res, next) => next();

function createApp(client) {
    const app = express();
    const pool = { connect: jest.fn().mockResolvedValue(client) };
    app.use(express.json());
    app.use((req, _res, next) => {
        req.organizationId = 7;
        next();
    });
    app.use('/api/invoices', createPaymentsRoutes({ pool, authenticateJWT: pass, requireOrganization: pass }));
    return { app, pool };
}

function createClient() {
    return {
        release: jest.fn(),
        query: jest.fn(async sql => {
            if (sql.includes('INSERT INTO payments')) {
                return {
                    rows: [{
                        id: 10,
                        organization_id: 7,
                        amount: '25.00',
                        currency: 'USD',
                        payment_method: 'cash',
                        status: 'succeeded',
                    }],
                };
            }
            return { rows: [], rowCount: 1 };
        }),
    };
}

describe('invoice payments routes', () => {
    test('records a standalone manual organization payment', async () => {
        const client = createClient();
        const { app } = createApp(client);

        const response = await request(app).post('/api/invoices/payments').send({
            amount: 25,
            payment_method: 'cash',
            payment_date: '2026-07-15',
            notes: 'Front desk receipt',
            status: 'succeeded',
        });

        expect(response.status).toBe(201);
        expect(response.body.data.payment).toMatchObject({ id: 10, payment_method: 'cash' });
        const insert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO payments'));
        expect(insert[1]).toEqual([
            7, null, null, 25, 'USD', 'cash', 'succeeded', '2026-07-15', 'Front desk receipt',
        ]);
        expect(client.query).toHaveBeenCalledWith('BEGIN');
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('rejects invalid amounts before opening a transaction', async () => {
        const client = createClient();
        const { app, pool } = createApp(client);

        const response = await request(app).post('/api/invoices/payments').send({
            amount: 0,
            payment_method: 'cash',
        });

        expect(response.status).toBe(400);
        expect(response.body.error.field).toBe('amount');
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('updates an organization-owned invoice in the same transaction', async () => {
        const client = createClient();
        client.query.mockImplementation(async sql => {
            if (sql.includes('FROM invoices')) {
                return { rows: [{ id: 42, contact_id: null, total: '100.00', amount_paid: '20.00' }] };
            }
            if (sql.includes('INSERT INTO payments')) return { rows: [{ id: 11 }] };
            return { rows: [], rowCount: 1 };
        });
        const { app } = createApp(client);

        const response = await request(app).post('/api/invoices/payments').send({
            invoice_id: 42,
            amount: 30,
            payment_method: 'check',
        });

        expect(response.status).toBe(201);
        expect(response.body.data.invoice).toEqual({
            amount_paid: 50,
            amount_due: 50,
            status: 'partial',
        });
        const update = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE invoices SET'));
        expect(update[1]).toEqual([50, 50, 'partial', 42]);
    });
});
