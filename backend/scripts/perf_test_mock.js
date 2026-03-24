function runMockTest() {
    const ITEMS_COUNT = 100;

    // Simulate database query latency
    const QUERY_LATENCY_MS = 5; // e.g. 5ms per query overhead over network

    console.log(`Simulating creating an estimate with ${ITEMS_COUNT} items...`);
    console.log(`Assuming a network latency of ${QUERY_LATENCY_MS}ms per query.`);

    // Loop strategy: 1 DELETE + N INSERTS
    const loopQueries = 1 + ITEMS_COUNT;
    const loopEstimatedTime = loopQueries * QUERY_LATENCY_MS;

    console.log(`\n--- Current Approach: Loop Insert ---`);
    console.log(`Number of queries: ${loopQueries}`);
    console.log(`Estimated time (latency only): ${loopEstimatedTime}ms`);

    // Bulk strategy: 1 DELETE + 1 BULK INSERT
    const bulkQueries = 1 + 1;
    const bulkEstimatedTime = bulkQueries * QUERY_LATENCY_MS;

    console.log(`\n--- Optimized Approach: Bulk Insert ---`);
    console.log(`Number of queries: ${bulkQueries}`);
    console.log(`Estimated time (latency only): ${bulkEstimatedTime}ms`);

    const improvement = loopEstimatedTime - bulkEstimatedTime;
    const improvementPercent = (improvement / loopEstimatedTime) * 100;

    console.log(`\n--- Theoretical Improvement ---`);
    console.log(`Time saved: ${improvement}ms`);
    console.log(`Improvement: ${improvementPercent.toFixed(2)}% faster (ignoring Postgres parse/plan/execute time differences, which heavily favor bulk insert as well)`);
}

runMockTest();
