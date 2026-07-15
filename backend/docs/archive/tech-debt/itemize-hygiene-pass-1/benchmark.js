const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

dotenv.config({ path: path.resolve(__dirname, 'backend/.env') });

const pool = new Pool({
    user: process.env.DB_USER || 'listify',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'listify',
    password: process.env.DB_PASSWORD || 'listify',
    port: process.env.DB_PORT || 5432,
});

async function runBenchmark() {
    console.log('--- Starting Benchmark ---');
    const client = await pool.connect();

    try {
        // Setup mock data
        const organizationId = 1;

        // Ensure organization exists
        const orgRes = await client.query('INSERT INTO organizations (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', ['Benchmark Org']);
        const orgId = orgRes.rows[0]?.id || 1;

        // Ensure user exists
        const userRes = await client.query('INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id', ['benchmark@test.com', 'hash', 'Bench', 'Mark']);
        const userId = userRes.rows[0]?.id || 1;

        // Ensure contact exists
        const contactRes = await client.query('INSERT INTO contacts (organization_id, first_name, email) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id', [orgId, 'Contact', 'contact@test.com']);
        const contactId = contactRes.rows[0]?.id || 1;

        // Create a mock estimate
        const estimateRes = await client.query(`
            INSERT INTO estimates (
                organization_id, estimate_number, contact_id, created_by, subtotal, total
            ) VALUES ($1, $2, $3, $4, 0, 0)
            RETURNING id
        `, [orgId, `EST-BENCH-${Date.now()}`, contactId, userId]);
        const estimateId = estimateRes.rows[0].id;

        // Generate N items
        const numItems = 2000;
        const items = [];
        for (let i = 0; i < numItems; i++) {
            items.push({
                product_id: null,
                name: `Item ${i}`,
                description: `Description ${i}`,
                quantity: i % 10 + 1,
                unit_price: 10 + i % 100,
                tax_rate: 0,
                tax_amount: 0,
                total: (i % 10 + 1) * (10 + i % 100),
                sort_order: i
            });
        }

        console.log(`Prepared ${numItems} items.`);

        // Benchmark 1: Current approach (VALUES)
        let values = [];
        let params = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const offset = i * 11;
            values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`);

            params.push(
                estimateId,
                orgId,
                item.product_id,
                item.name,
                item.description,
                item.quantity,
                item.unit_price,
                item.tax_rate,
                item.tax_amount,
                item.total,
                item.sort_order
            );
        }

        const queryValues = `
            INSERT INTO estimate_items (
                estimate_id, organization_id, product_id, name, description,
                quantity, unit_price, tax_rate, tax_amount, total, sort_order
            ) VALUES ${values.join(', ')}
        `;

        let startTime = process.hrtime.bigint();
        try {
            await client.query(queryValues, params);
            let endTime = process.hrtime.bigint();
            console.log(`VALUES approach took: ${Number(endTime - startTime) / 1000000} ms`);
        } catch (err) {
            console.error(`VALUES approach failed: ${err.message}`);
        }

        // Clean up items
        await client.query('DELETE FROM estimate_items WHERE estimate_id = $1', [estimateId]);

        // Benchmark 2: UNNEST approach
        const u_estimate_ids = [];
        const u_org_ids = [];
        const u_product_ids = [];
        const u_names = [];
        const u_descriptions = [];
        const u_quantities = [];
        const u_unit_prices = [];
        const u_tax_rates = [];
        const u_tax_amounts = [];
        const u_totals = [];
        const u_sort_orders = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            u_estimate_ids.push(estimateId);
            u_org_ids.push(orgId);
            u_product_ids.push(item.product_id);
            u_names.push(item.name);
            u_descriptions.push(item.description);
            u_quantities.push(item.quantity);
            u_unit_prices.push(item.unit_price);
            u_tax_rates.push(item.tax_rate);
            u_tax_amounts.push(item.tax_amount);
            u_totals.push(item.total);
            u_sort_orders.push(item.sort_order);
        }

        const queryUnnest = `
            INSERT INTO estimate_items (
                estimate_id, organization_id, product_id, name, description,
                quantity, unit_price, tax_rate, tax_amount, total, sort_order
            ) SELECT * FROM UNNEST (
                $1::int[], $2::int[], $3::int[], $4::text[], $5::text[],
                $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::int[]
            )
        `;

        startTime = process.hrtime.bigint();
        try {
            await client.query(queryUnnest, [
                u_estimate_ids, u_org_ids, u_product_ids, u_names, u_descriptions,
                u_quantities, u_unit_prices, u_tax_rates, u_tax_amounts, u_totals, u_sort_orders
            ]);
            let endTime = process.hrtime.bigint();
            console.log(`UNNEST approach took: ${Number(endTime - startTime) / 1000000} ms`);
        } catch (err) {
            console.error(`UNNEST approach failed: ${err.message}`);
        }

        // Clean up
        await client.query('DELETE FROM estimate_items WHERE estimate_id = $1', [estimateId]);
        await client.query('DELETE FROM estimates WHERE id = $1', [estimateId]);

    } catch (error) {
        console.error('Benchmark error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

runBenchmark();
