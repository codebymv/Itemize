const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/organization', () => () => ({
    requireOrganization: (_req, _res, next) => next(),
}));

const createEstimateRoutes = require('../../routes/estimates.routes');

const pass = (_req, _res, next) => next();

function createClient() {
    return {
        release: jest.fn(),
        query: jest.fn(async sql => {
            if (sql.includes('FROM estimates WHERE')) {
                return {
                    rows: [{
                        id: 15,
                        organization_id: 7,
                        converted_invoice_id: null,
                        contact_id: null,
                        customer_name: 'Example Co',
                        customer_email: 'billing@example.com',
                        customer_phone: null,
                        customer_address: null,
                        subtotal: '100.00',
                        tax_amount: '10.00',
                        discount_amount: '0.00',
                        discount_type: null,
                        discount_value: '0.00',
                        total: '110.00',
                        notes: null,
                        terms_and_conditions: null,
                    }],
                };
            }
            if (sql.includes('FROM estimate_items')) {
                return {
                    rows: [{
                        product_id: null,
                        name: 'Consulting',
                        description: null,
                        quantity: '1.00',
                        unit_price: '100.00',
                        tax_rate: '10.00',
                        tax_amount: '10.00',
                        total: '110.00',
                        sort_order: 0,
                    }],
                };
            }
            if (sql.includes('INSERT INTO payment_settings')) {
                return { rows: [{ invoice_prefix: 'INV-', allocated_number: 21 }] };
            }
            if (sql.includes('INSERT INTO invoices')) return { rows: [{ id: 90 }] };
            return { rows: [], rowCount: 1 };
        }),
    };
}

describe('estimate conversion transaction', () => {
    test('locks the estimate and allocates exactly one tenant-scoped invoice number', async () => {
        const client = createClient();
        const pool = { connect: jest.fn().mockResolvedValue(client) };
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.organizationId = 7;
            req.user = { id: 3 };
            next();
        });
        app.use('/api/invoices/estimates', createEstimateRoutes(pool, pass));

        const response = await request(app)
            .post('/api/invoices/estimates/15/convert-to-invoice')
            .send({});

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            invoice_id: 90,
            invoice_number: 'INV-00021',
        });

        const estimateLock = client.query.mock.calls.find(([sql]) => sql.includes('FROM estimates WHERE'));
        expect(estimateLock[0]).toContain('FOR UPDATE');
        expect(estimateLock[1]).toEqual(['15', 7]);

        const itemRead = client.query.mock.calls.find(([sql]) => sql.includes('FROM estimate_items'));
        expect(itemRead[0]).toContain('organization_id = $2');
        expect(itemRead[1]).toEqual(['15', 7]);

        const sourceUpdate = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE estimates SET'));
        expect(sourceUpdate[0]).toContain('organization_id = $3');
        expect(sourceUpdate[1]).toEqual([90, '15', 7]);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.release).toHaveBeenCalledTimes(1);
    });
});
