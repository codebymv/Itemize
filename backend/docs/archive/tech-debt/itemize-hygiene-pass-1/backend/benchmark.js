const { performance } = require('perf_hooks');

// Mock out the client object to simulate the query taking ~1ms
const client = {
    query: async () => {
        // Simulating network/DB latency
        await new Promise(resolve => setTimeout(resolve, 1));
        return { rows: [{ status: 'sending' }] };
    }
};

async function runBenchmark() {
    console.log('Starting benchmark...');

    const recipientsCount = 1000;
    const recipients = Array.from({ length: recipientsCount }).map((_, i) => ({
        id: i,
        email: `test${i}@example.com`,
        first_name: `First${i}`,
        last_name: `Last${i}`
    }));

    // 1. Benchmark current approach (querying every 10 iterations)
    console.log(`\nBenchmarking CURRENT approach (query every 10 iterations) for ${recipientsCount} recipients...`);
    let start1 = performance.now();
    let processedCount1 = 0;
    let queriedCount1 = 0;

    for (const recipient of recipients) {
        // Mock email sending delay (commented out so we measure just the overhead)
        // await new Promise(resolve => setTimeout(resolve, 1));

        if (processedCount1 % 10 === 0) {
            queriedCount1++;
            const statusCheck = await client.query(
                'SELECT status FROM test_email_campaigns WHERE id = $1',
                ['mock-id']
            );

            if (!statusCheck.rows.length || !['sending'].includes(statusCheck.rows[0].status)) {
                break;
            }
        }
        processedCount1++;
    }
    let end1 = performance.now();
    console.log(`CURRENT approach took: ${(end1 - start1).toFixed(2)} ms (queried DB ${queriedCount1} times)`);

    // 2. Benchmark optimized approach (time-based check, every 5s)
    console.log(`\nBenchmarking OPTIMIZED approach (time-based, check every 5s) for ${recipientsCount} recipients...`);
    let start2 = performance.now();
    let processedCount2 = 0;
    let queriedCount2 = 0;
    let lastStatusCheck = performance.now();

    const initialStatusCheck = await client.query(
        'SELECT status FROM test_email_campaigns WHERE id = $1',
        ['mock-id']
    );
    let campaignStatus = initialStatusCheck.rows.length > 0 ? initialStatusCheck.rows[0].status : 'unknown';
    queriedCount2++;

    for (const recipient of recipients) {
        // Mock email sending delay (commented out so we measure just the overhead)
        // await new Promise(resolve => setTimeout(resolve, 1));

        if (performance.now() - lastStatusCheck > 5000) {
            queriedCount2++;
            lastStatusCheck = performance.now();
            const statusCheck = await client.query(
                'SELECT status FROM test_email_campaigns WHERE id = $1',
                ['mock-id']
            );
            campaignStatus = statusCheck.rows.length > 0 ? statusCheck.rows[0].status : 'unknown';
        }

        if (campaignStatus !== 'sending') {
            break;
        }
        processedCount2++;
    }
    let end2 = performance.now();
    console.log(`OPTIMIZED approach took: ${(end2 - start2).toFixed(2)} ms (queried DB ${queriedCount2} times)`);

    const improvement = (((end1 - start1) - (end2 - start2)) / (end1 - start1) * 100).toFixed(2);
    console.log(`\nImprovement: ${improvement}% faster!`);
}
runBenchmark();
