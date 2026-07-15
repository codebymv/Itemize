const express = require('express');
const request = require('supertest');

jest.mock('../../middleware/organization', () => () => ({
    requireOrganization: (_req, _res, next) => next(),
}));

const createRecurringRoutes = require('../../routes/recurring.routes');

const pass = (_req, _res, next) => next();

function createApp(client) {
    const app = express();
    const pool = { connect: jest.fn().mockResolvedValue(client) };
    app.use(express.json());
    app.use((req, _res, next) => {
        req.organizationId = 7;
        req.user = { id: 3 };
        next();
    });
    app.use('/api/invoices/recurring', createRecurringRoutes(pool, pass));
    return { app, pool };
}

function createClient({ template = true } = {}) {
    return {
        release: jest.fn(),
        query: jest.fn(async sql => {
            if (sql.includes('FROM recurring_invoice_templates r') && sql.includes('FOR UPDATE OF r')) {
                return {
                    rows: template ? [{
                        id: 12,
                        organization_id: 7,
                        template_name: 'Monthly support',
                        contact_id: null,
                        customer_name: 'Example Co',
                        customer_email: 'billing@example.com',
                        payment_terms: '30',
                        items: [{ name: 'Support', quantity: 1, unit_price: 50, tax_rate: 0 }],
                        subtotal: '50.00',
                        tax_amount: '0.00',
                        discount_amount: '0.00',
                        discount_type: null,
                        discount_value: '0.00',
                        total: '50.00',
                        notes: null,
                        next_run_date: '2026-07-15',
                        frequency: 'monthly',
                        end_date: null,
                        status: 'active',
                    }] : [],
                };
            }
            if (sql.includes('INSERT INTO payment_settings')) {
                return { rows: [{ invoice_prefix: 'INV-', allocated_number: 8 }] };
            }
            if (sql.includes('INSERT INTO invoices')) return { rows: [{ id: 88 }] };
            return { rows: [], rowCount: 1 };
        }),
    };
}

describe('manual recurring invoice generation', () => {
    test('locks the tenant-owned template and allocates its number atomically', async () => {
        const client = createClient();
        const { app } = createApp(client);

        const response = await request(app)
            .post('/api/invoices/recurring/12/generate-now')
            .send({});

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            invoice_id: 88,
            invoice_number: 'INV-00008',
            template_status: 'active',
        });

        const claim = client.query.mock.calls.find(([sql]) => sql.includes('FOR UPDATE OF r'));
        expect(claim[0]).toContain('r.organization_id = $2');
        expect(claim[1]).toEqual(['12', 7]);

        const allocation = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO payment_settings'));
        expect(allocation[0]).toContain('ON CONFLICT (organization_id) DO UPDATE');
        expect(allocation[1]).toEqual([7]);

        const templateUpdate = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE recurring_invoice_templates'));
        expect(templateUpdate[0]).toContain('organization_id = $4');
        expect(templateUpdate[1][3]).toBe(7);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('rolls back without allocating when the template is outside the tenant', async () => {
        const client = createClient({ template: false });
        const { app } = createApp(client);

        const response = await request(app)
            .post('/api/invoices/recurring/12/generate-now')
            .send({});

        expect(response.status).toBe(404);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO payment_settings'))).toBe(false);
        expect(client.release).toHaveBeenCalledTimes(1);
    });
});
