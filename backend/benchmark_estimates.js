const { Pool } = require('pg');
const { withTransaction } = require('./src/utils/db');

// Set dummy env variables for benchmark
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/itemize_test';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runBenchmark() {
  try {
    const itemCount = 500;
    const items = Array.from({ length: itemCount }).map((_, i) => ({
      name: `Item ${i}`,
      quantity: 1,
      unit_price: 10,
      tax_rate: 0
    }));

    const req = {
      organizationId: 1,
      user: { id: 1 }
    };

    console.log(`Starting benchmark with ${itemCount} items...`);
    const start = Date.now();

    await withTransaction(pool, async (client) => {
        // Mock estimateNumber
        const estimateNumber = 'EST-BENCHMARK';

        // Calculate totals
        let subtotal = 0;
        let taxAmount = 0;

        for (const item of items) {
            const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
            const itemTax = itemTotal * ((item.tax_rate || 0) / 100);
            subtotal += itemTotal;
            taxAmount += itemTax;
        }

        const total = subtotal + taxAmount;
        const validUntilDate = new Date().toISOString().split('T')[0];

        // Create estimate
        const estimateResult = await client.query(`
            INSERT INTO estimates (
                organization_id, estimate_number,
                valid_until, subtotal, tax_amount, discount_amount, discount_type, discount_value,
                total, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `, [
            req.organizationId,
            estimateNumber,
            validUntilDate,
            subtotal,
            taxAmount,
            0,
            null,
            0,
            total,
            req.user.id
        ]);

        const estimateId = estimateResult.rows[0].id;

        // Create line items
        if (items.length > 0) {
            const arrays = {
                estimate_ids: [],
                organization_ids: [],
                product_ids: [],
                names: [],
                descriptions: [],
                quantities: [],
                unit_prices: [],
                tax_rates: [],
                tax_amounts: [],
                totals: [],
                sort_orders: []
            };

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
                const itemTax = itemTotal * ((item.tax_rate || 0) / 100);

                arrays.estimate_ids.push(estimateId);
                arrays.organization_ids.push(req.organizationId);
                arrays.product_ids.push(item.product_id || null);
                arrays.names.push(item.name);
                arrays.descriptions.push(item.description || null);
                arrays.quantities.push(item.quantity || 1);
                arrays.unit_prices.push(item.unit_price || 0);
                arrays.tax_rates.push(item.tax_rate || 0);
                arrays.tax_amounts.push(itemTax);
                arrays.totals.push(itemTotal + itemTax);
                arrays.sort_orders.push(i);
            }

            await client.query(`
                INSERT INTO estimate_items (
                    estimate_id, organization_id, product_id, name, description,
                    quantity, unit_price, tax_rate, tax_amount, total, sort_order
                )
                SELECT * FROM UNNEST (
                    $1::int[], $2::int[], $3::int[], $4::text[], $5::text[],
                    $6::int[], $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::int[]
                )
            `, [
                arrays.estimate_ids,
                arrays.organization_ids,
                arrays.product_ids,
                arrays.names,
                arrays.descriptions,
                arrays.quantities,
                arrays.unit_prices,
                arrays.tax_rates,
                arrays.tax_amounts,
                arrays.totals,
                arrays.sort_orders
            ]);
        }
    });

    const end = Date.now();
    console.log(`Benchmark completed in ${end - start} ms`);

  } catch (error) {
    console.error('Benchmark error:', error);
  } finally {
    await pool.end();
  }
}

runBenchmark();
