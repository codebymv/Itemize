const fs = require('fs');
const path = require('path');

const sourceRoot = path.resolve(__dirname, '..');

function migrationSourceFiles() {
  return fs.readdirSync(sourceRoot)
    .filter(name => name === 'db.js' || /^db.*_migrations\.js$/.test(name))
    .map(name => path.join(sourceRoot, name));
}

function discoverExpectedTables() {
  const tables = new Set(['_migrations']);
  const pattern = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)/gi;

  for (const file of migrationSourceFiles()) {
    const contents = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(contents))) tables.add(match[1].toLowerCase());
  }

  return [...tables].sort();
}

function discoverExpectedMigrationMarkers() {
  const contents = fs.readFileSync(path.join(sourceRoot, 'db.js'), 'utf8');
  const markers = new Set();
  const pattern = /runMigrationOnce\(\s*pool\s*,\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(contents))) markers.add(match[1]);
  return [...markers].sort();
}

async function verifySchema(pool) {
  const expectedTables = discoverExpectedTables();
  const tableResult = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const actualTables = new Set(tableResult.rows.map(row => row.table_name.toLowerCase()));
  const missingTables = expectedTables.filter(table => !actualTables.has(table));

  if (missingTables.length) {
    throw new Error(`Schema is missing tables: ${missingTables.join(', ')}`);
  }

  const expectedMarkers = discoverExpectedMigrationMarkers();
  const markerResult = await pool.query('SELECT name FROM _migrations');
  const actualMarkers = new Set(markerResult.rows.map(row => row.name));
  const missingMarkers = expectedMarkers.filter(marker => !actualMarkers.has(marker));

  if (missingMarkers.length) {
    throw new Error(`Schema has incomplete migrations: ${missingMarkers.join(', ')}`);
  }

  return {
    tableCount: actualTables.size,
    verifiedTableCount: expectedTables.length,
    verifiedMigrationCount: expectedMarkers.length,
  };
}

module.exports = {
  discoverExpectedMigrationMarkers,
  discoverExpectedTables,
  verifySchema,
};
