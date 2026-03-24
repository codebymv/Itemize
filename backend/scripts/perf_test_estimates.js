const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/itemize',
});

async function runTest() {
    try {
        console.time('DB Connect');
        const client = await pool.connect();
        console.timeEnd('DB Connect');

        // Create a fake organization and estimate for testing
        const orgId = 1;
        const estimateId = 9999;

        await client.query('BEGIN');

        // Clean up
        await client.query('DELETE FROM estimate_items WHERE estimate_id = $1', [estimateId]);
        await client.query('DELETE FROM estimates WHERE id = $1', [estimateId]);

        // Insert fake estimate
        await client.query(`
            INSERT INTO estimates (id, organization_id, estimate_number, status, subtotal, total)
            VALUES ($1, $2, 'EST-TEST-001', 'draft', 0, 0)
            ON CONFLICT (id) DO NOTHING
        `, [estimateId, orgId]);

        await client.query('COMMIT');

        // Generate 100 fake items
        const items = [];
        for (let i = 0; i < 100; i++) {
            items.push({
                product_id: null,
                name: `Test Product ${i}`,
                description: `Description ${i}`,
                quantity: i + 1,
                unit_price: 10.00 + i,
                tax_rate: 5.0,
            });
        }

        console.time('Loop Insert');
        await client.query('BEGIN');
        await client.query('DELETE FROM estimate_items WHERE estimate_id = $1', [estimateId]);
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
            const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

            await client.query(`
                INSERT INTO estimate_items (
                    estimate_id, organization_id, product_id, name, description,
                    quantity, unit_price, tax_rate, tax_amount, total, sort_order
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
                estimateId,
                orgId,
                item.product_id || null,
                item.name,
                item.description || null,
                item.quantity || 1,
                item.unit_price || 0,
                item.tax_rate || 0,
                itemTax,
                itemTotal + itemTax,
                i
            ]);
        }
        await client.query('COMMIT');
        console.timeEnd('Loop Insert');


        console.time('Bulk Insert');
        await client.query('BEGIN');
        await client.query('DELETE FROM estimate_items WHERE estimate_id = $1', [estimateId]);

        if (items.length > 0) {
            let valuesClauses = [];
            let insertParams = [];
            let pIdx = 1;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

                valuesClauses.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
                insertParams.push(
                    estimateId,
                    orgId,
                    item.product_id || null,
                    item.name,
                    item.description || null,
                    item.quantity || 1,
                    item.unit_price || 0,
                    item.tax_rate || 0,
                    itemTax,
                    itemTotal + itemTax,
                    i
                );
            }

            const insertQuery = `
                INSERT INTO estimate_items (
                    estimate_id, organization_id, product_id, name, description,
                    quantity, unit_price, tax_rate, tax_amount, total, sort_order
                ) VALUES ${valuesClauses.join(', ')}
            `;
            await client.query(insertQuery, insertParams);
        }
        await client.query('COMMIT');
        console.timeEnd('Bulk Insert');


        // Clean up
        await client.query('BEGIN');
        await client.query('DELETE FROM estimate_items WHERE estimate_id = $1', [estimateId]);
        await client.query('DELETE FROM estimates WHERE id = $1', [estimateId]);
        await client.query('COMMIT');

        client.release();
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

runTest();
