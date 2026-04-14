// A simple benchmark measuring node.js string manipulation & logic simulation
console.log('--- Benchmarking Canvas Notes Update (Node logic) ---');

const numUpdates = 1000;
const notes = [];
for (let i = 0; i < numUpdates; i++) {
  notes.push({ id: i, position_x: i, position_y: i, width: 100, height: 100 });
}

// Simulated sequential queries overhead
console.time('Sequential Query Preparation');
for (let i = 0; i < numUpdates; i++) {
  const note = notes[i];
  const query = 'UPDATE notes SET position_x = $1, position_y = $2, width = COALESCE($3, width), height = COALESCE($4, height) WHERE id = $5 AND user_id = $6 RETURNING *';
  const params = [note.position_x, note.position_y, note.width ?? null, note.height ?? null, note.id, 1];
  // Normally we would `await client.query(query, params)` here.
}
console.timeEnd('Sequential Query Preparation');

// Batch UNNEST Query Preparation
console.time('Batch UNNEST Array Construction');
const updateIds = [];
const updateXs = [];
const updateYs = [];
const updateWs = [];
const updateHs = [];

for (const note of notes) {
  updateIds.push(note.id);
  updateXs.push(note.position_x);
  updateYs.push(note.position_y);
  updateWs.push(note.width ?? null);
  updateHs.push(note.height ?? null);
}

const batchQuery = `
  UPDATE notes AS n
  SET position_x = u.position_x,
      position_y = u.position_y,
      width = COALESCE(u.width, n.width),
      height = COALESCE(u.height, n.height)
  FROM (SELECT * FROM UNNEST($1::int[], $2::float[], $3::float[], $4::float[], $5::float[]))
  AS u(id, position_x, position_y, width, height)
  WHERE n.id = u.id AND n.user_id = $6
  RETURNING n.*
`;
const batchParams = [updateIds, updateXs, updateYs, updateWs, updateHs, 1];
console.timeEnd('Batch UNNEST Array Construction');

console.log('The real DB driver overhead is bounded by sequential trips vs 1 round-trip.');
