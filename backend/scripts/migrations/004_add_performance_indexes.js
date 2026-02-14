require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration004() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/add_performance_indexes.sql'),
      'utf-8'
    );
    
    await pool.query(sql);
    console.log('✅ Migration 004: Performance indexes added');
  } catch (error) {
    console.error('Migration 004 failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigration004();
}

module.exports = runMigration004;