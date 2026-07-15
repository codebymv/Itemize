// Mock out the db client and measure just the insertion building time

const items = Array.from({ length: 500 }).map((_, i) => ({
  name: `Item ${i}`,
  quantity: 1,
  unit_price: 10,
  tax_rate: 0
}));

class MockClient {
    async query(sql, params) {
        // Just simulate some delay for DB
        await new Promise(r => setTimeout(r, 1));
        return { rows: [{ id: 1 }] };
    }
}

async function runBenchmark() {
    console.log(`Starting benchmark with ${items.length} items...`);
    const start = Date.now();
    const client = new MockClient();

    // Simulate estimate creation
    const estimateResult = await client.query(`INSERT ... RETURNING *`, []);
    const estimateId = estimateResult.rows[0].id;

    // Current N+1 implementation
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
            1,
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
    const end = Date.now();
    console.log(`Current approach: ${end - start} ms`);

    // Optimized approach (batch insert)
    const start2 = Date.now();

    if (items.length > 0) {
        const values = [];
        const params = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
            const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

            const offset = i * 11;
            values.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10}, $${offset+11})`);

            params.push(
                estimateId,
                1,
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

        const query = `
            INSERT INTO estimate_items (
                estimate_id, organization_id, product_id, name, description,
                quantity, unit_price, tax_rate, tax_amount, total, sort_order
            ) VALUES ${values.join(', ')}
        `;

        await client.query(query, params);
    }

    const end2 = Date.now();
    console.log(`Optimized approach: ${end2 - start2} ms`);
}

runBenchmark();
