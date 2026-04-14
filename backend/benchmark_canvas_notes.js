async function benchmark() {
  const userId = 1;
  const numNotes = 500;

  // Create update objects
  const updates = Array.from({length: numNotes}).map((_, i) => ({
    type: 'note',
    id: i,
    position_x: i * 2,
    position_y: i * 2,
    width: 200,
    height: 200
  }));

  // Benchmark Original (Sequential updates preparation)
  const startSequential = Date.now();
  let queryCalls = 0;
  for (const update of updates) {
    // Simulating the work of building and executing individual queries
    const query = 'UPDATE notes SET position_x = $1, position_y = $2, width = COALESCE($3, width), height = COALESCE($4, height) WHERE id = $5 AND user_id = $6 RETURNING *';
    const params = [update.position_x, update.position_y, update.width ?? null, update.height ?? null, update.id, userId];
    queryCalls++;
  }
  const endSequential = Date.now();
  const timeSequential = endSequential - startSequential;
  console.log(`Original Pattern: Makes ${queryCalls} individual queries (1 per note)`);
  console.log(`Original Time (Query preparation loop for ${numNotes} notes): ${timeSequential}ms`);

  // Benchmark Optimized (UNNEST batch update preparation)
  const startUnnest = Date.now();

  const u_ids = [];
  const u_pos_xs = [];
  const u_pos_ys = [];
  const u_widths = [];
  const u_heights = [];

  for (const update of updates) {
    u_ids.push(update.id);
    u_pos_xs.push(update.position_x);
    u_pos_ys.push(update.position_y);
    u_widths.push(update.width ?? null);
    u_heights.push(update.height ?? null);
  }

  const query = `
    UPDATE notes AS n
    SET
        position_x = u.position_x,
        position_y = u.position_y,
        width = COALESCE(u.width, n.width),
        height = COALESCE(u.height, n.height)
    FROM (
        SELECT * FROM UNNEST (
            $1::int[], $2::numeric[], $3::numeric[], $4::numeric[], $5::numeric[]
        ) AS t(id, position_x, position_y, width, height)
    ) AS u
    WHERE n.id = u.id AND n.user_id = $6
    RETURNING n.*
  `;
  const params = [u_ids, u_pos_xs, u_pos_ys, u_widths, u_heights, userId];

  const endUnnest = Date.now();
  const timeUnnest = endUnnest - startUnnest;

  console.log(`Optimized Pattern: Makes 1 single query for all ${numNotes} notes`);
  console.log(`Optimized Time (Array preparation for ${numNotes} notes): ${timeUnnest}ms`);

  // Rationale output
  console.log(`\nRationale:`);
  console.log(`While preparation time is negligible for both methods (${timeSequential}ms vs ${timeUnnest}ms),`);
  console.log(`the N+1 query issue causes severe overhead in production due to:`);
  console.log(`1. Database round-trip latency (${queryCalls} network requests vs 1)`);
  console.log(`2. PostgreSQL connection pool exhaustion`);
  console.log(`3. Query parsing overhead (PostgreSQL must parse/plan ${queryCalls} queries instead of 1)`);
  console.log(`Using UNNEST reduces the complexity from O(n) database queries to O(1) query.`);
}

benchmark();
