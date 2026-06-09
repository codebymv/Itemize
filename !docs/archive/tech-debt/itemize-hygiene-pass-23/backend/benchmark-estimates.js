const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/listify'
});

async function runBenchmark() {
    const client = await pool.connect();
    try {
        // Setup a dummy organization, contact, etc.
        const orgRes = await client.query(`INSERT INTO organizations (name) VALUES ('Test Org') RETURNING id`);
        const orgId = orgRes.rows[0].id;

        const estRes = await client.query(`
            INSERT INTO estimates (organization_id, estimate_number, total, subtotal, status)
            VALUES ($1, 'EST-TEST', 100, 100, 'draft') RETURNING id
        `, [orgId]);
        const estId = estRes.rows[0].id;

        const numItems = 1000;
        const items = Array.from({ length: numItems }).map((_, i) => ({
            product_id: null,
            name: 'Item ' + i,
            description: 'Desc ' + i,
            quantity: 1,
            unit_price: 10,
            tax_rate: 0,
            tax_amount: 0,
            total: 10,
            sort_order: i
        }));

        // Method 1: VALUES
        console.log('Testing VALUES for ' + numItems + ' items...');
        let startTime = process.hrtime();

        const values = [];
        const params = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const offset = i * 11;
            values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`);
            params.push(
                estId, orgId, item.product_id, item.name, item.description,
                item.quantity, item.unit_price, item.tax_rate, item.tax_amount, item.total, item.sort_order
            );
        }

        await client.query(`
            INSERT INTO estimate_items (
                estimate_id, organization_id, product_id, name, description,
                quantity, unit_price, tax_rate, tax_amount, total, sort_order
            ) VALUES ${values.join(', ')}
        `, params);

        let diff = process.hrtime(startTime);
        const valuesTime = (diff[0] * 1e9 + diff[1]) / 1e6; // ms
        console.log('VALUES method took ' + valuesTime.toFixed(2) + ' ms');

        // Clean up
        await client.query(`DELETE FROM estimate_items WHERE estimate_id = $1`, [estId]);

        // Method 2: UNNEST
        console.log('Testing UNNEST for ' + numItems + ' items...');
        startTime = process.hrtime();

        const u_estimate_ids = [];
        const u_organization_ids = [];
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
            u_estimate_ids.push(estId);
            u_organization_ids.push(orgId);
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

        await client.query(`
            INSERT INTO estimate_items (
                estimate_id, organization_id, product_id, name, description,
                quantity, unit_price, tax_rate, tax_amount, total, sort_order
            ) SELECT * FROM UNNEST(
                $1::int[], $2::int[], $3::int[], $4::text[], $5::text[],
                $6::numeric[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::int[]
            )
        `, [
            u_estimate_ids, u_organization_ids, u_product_ids, u_names, u_descriptions,
            u_quantities, u_unit_prices, u_tax_rates, u_tax_amounts, u_totals, u_sort_orders
        ]);

        diff = process.hrtime(startTime);
        const unnestTime = (diff[0] * 1e9 + diff[1]) / 1e6; // ms
        console.log('UNNEST method took ' + unnestTime.toFixed(2) + ' ms');

        console.log('Improvement: ' + ((valuesTime - unnestTime) / valuesTime * 100).toFixed(2) + '%');

        // Cleanup
        await client.query(`DELETE FROM estimate_items WHERE estimate_id = $1`, [estId]);
        await client.query(`DELETE FROM estimates WHERE id = $1`, [estId]);
        await client.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);

    } finally {
        client.release();
        await pool.end();
    }
}

runBenchmark().catch(console.error);
