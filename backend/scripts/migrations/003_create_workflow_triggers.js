require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration003() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/create_workflow_triggers.sql'),
      'utf-8'
    );
    
    await pool.query(sql);
    console.log('✅ Migration 003: workflow_triggers table created');
  } catch (error) {
    console.error('Migration 003 failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigration003();
}

module.exports = runMigration003;