const { Pool } = require('pg');

const items = Array.from({ length: 50 }).map((_, i) => ({
  day_of_week: i % 7 + 1,
  start_time: '09:00',
  end_time: '17:00',
  is_active: true
}));

class MockClient {
    async query(sql, params) {
        // Just simulate some delay for DB
        await new Promise(r => setTimeout(r, 1));
        return { rows: [{ id: 1 }] };
    }
}

async function runBenchmark() {
    console.log(`Starting benchmark with ${items.length} availability windows...`);
    const client = new MockClient();
    const createdCalendarId = 1;

    // Current N+1 implementation
    const start = Date.now();
    for (const window of items) {
        await client.query(`
            INSERT INTO availability_windows (calendar_id, day_of_week, start_time, end_time, is_active)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            createdCalendarId,
            window.day_of_week,
            window.start_time,
            window.end_time,
            window.is_active !== false
        ]);
    }
    const end = Date.now();
    const currentMs = end - start;
    console.log(`Current approach (N+1 query): ${currentMs} ms`);

    // Optimized approach (batch insert)
    const start2 = Date.now();

    if (items.length > 0) {
        const valueStrings = [];
        const params = [];

        items.forEach((window, index) => {
            const offset = index * 5;
            valueStrings.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
            params.push(
                createdCalendarId,
                window.day_of_week,
                window.start_time,
                window.end_time,
                window.is_active !== false
            );
        });

        const query = `
            INSERT INTO availability_windows (calendar_id, day_of_week, start_time, end_time, is_active)
            VALUES ${valueStrings.join(', ')}
        `;

        await client.query(query, params);
    }
    const end2 = Date.now();
    const optMs = end2 - start2;
    console.log(`Optimized approach (Bulk Insert): ${optMs} ms`);
    console.log(`Improvement: ${(currentMs / optMs).toFixed(2)}x faster`);
}

runBenchmark();
