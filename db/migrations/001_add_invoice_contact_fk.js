require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runMigration001() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/add_invoice_contact_fk.sql'),
      'utf-8'
    );
    
    await pool.query(sql);
    console.log('✅ Migration 001: Invoice contact_id FK added');
  } catch (error) {
    console.error('Migration 001 failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigration001();
}

module.exports = runMigration001;