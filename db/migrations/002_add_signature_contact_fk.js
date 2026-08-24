require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration002() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/add_signature_contact_fk.sql'),
      'utf-8'
    );
    
    await pool.query(sql);
    console.log('✅ Migration 002: Signature contact_id FK added');
  } catch (error) {
    console.error('Migration 002 failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigration002();
}

module.exports = runMigration002;